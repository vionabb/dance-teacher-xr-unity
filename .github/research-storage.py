#!/usr/bin/env python3
"""Access to the private `research-chi25` Supabase bucket for cloud agents.

Signs in as the dedicated research-agent user and reads catalog rows and objects
through the same row-level security as the hosted research pages. It sees only
what that user is granted. The only write is `upload`, which adds a new,
write-once object under uploads/<study>/ and needs the agent to be an `editor`
for that study (migration 20261120150000_research_agent_uploads.sql). It never
writes tables, overwrites or deletes.

Required environment (set as cloud-environment secrets, never committed):
  RESEARCH_SUPABASE_URL        e.g. https://<ref>.supabase.co
  RESEARCH_SUPABASE_PUBLISHABLE_KEY  the project's public sb_publishable_ key
  RESEARCH_AGENT_EMAIL         the research-agent user's email
  RESEARCH_AGENT_PASSWORD      the research-agent user's password

Usage:
  python3 -I .github/research-storage.py check
  python3 -I .github/research-storage.py materials [--kind reference_pose]
  python3 -I .github/research-storage.py media [--study chi25_study1] [--limit 20]
  python3 -I .github/research-storage.py fetch <object_path> [<object_path> ...]
  python3 -I .github/research-storage.py table <table> [--select id,study] [--out rows.json]
  python3 -I .github/research-storage.py uploads <study> [<subfolder>]
  python3 -I .github/research-storage.py upload <study> <local-data file> <dest/path>

Downloads land under local-data/research-chi25/<object_path> (git-ignored).
Treat them as access-controlled: never copy them into the repo, project files,
or any other shared location.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path, PurePosixPath

BUCKET = "research-chi25"
REPO_ROOT = Path(__file__).resolve().parent.parent
CACHE_ROOT = REPO_ROOT / "local-data" / BUCKET
STUDIES = ("chi25_study1", "chi25_study2")
CONTENT_TYPES = {
    ".csv": "text/csv",
    ".json": "application/json",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".mp4": "video/mp4",
}


def env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        sys.exit(f"{name} is not set; add it as a cloud-environment secret.")
    return value


def request(method: str, url: str, headers: dict[str, str], body: bytes | None = None) -> bytes:
    req = urllib.request.Request(url, data=body, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.read()
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", "replace")[:300]
        sys.exit(f"{method} {urllib.parse.urlsplit(url).path} failed: HTTP {err.code} {detail}")


class Client:
    def __init__(self) -> None:
        self.base = env("RESEARCH_SUPABASE_URL").rstrip("/")
        self.anon = env("RESEARCH_SUPABASE_PUBLISHABLE_KEY")
        payload = json.dumps(
            {
                "email": env("RESEARCH_AGENT_EMAIL"),
                "password": env("RESEARCH_AGENT_PASSWORD"),
            }
        ).encode()
        token = json.loads(
            request(
                "POST",
                f"{self.base}/auth/v1/token?grant_type=password",
                {"apikey": self.anon, "Content-Type": "application/json"},
                payload,
            )
        )
        self.headers = {
            "apikey": self.anon,
            "Authorization": f"Bearer {token['access_token']}",
        }

    def rows(self, table: str, query: dict[str, str]) -> list[dict]:
        url = f"{self.base}/rest/v1/{table}?{urllib.parse.urlencode(query)}"
        return json.loads(request("GET", url, self.headers))

    def all_rows(self, table: str, select: str) -> list[dict]:
        """Page through a table in id order; Supabase caps one response at 1000 rows."""
        rows: list[dict] = []
        while True:
            page = self.rows(
                table,
                {
                    "select": select,
                    "order": "id",
                    "limit": "1000",
                    "offset": str(len(rows)),
                },
            )
            rows.extend(page)
            if len(page) < 1000:
                return rows

    def download(self, object_path: str) -> Path:
        if object_path.startswith("/") or ".." in Path(object_path).parts:
            sys.exit(f"refusing unsafe object path: {object_path}")
        quoted = urllib.parse.quote(object_path)
        url = f"{self.base}/storage/v1/object/authenticated/{BUCKET}/{quoted}"
        data = request("GET", url, self.headers)
        target = CACHE_ROOT / object_path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)
        return target

    def list(self, prefix: str) -> list[dict]:
        body = json.dumps({"prefix": prefix, "limit": 1000, "offset": 0}).encode()
        url = f"{self.base}/storage/v1/object/list/{BUCKET}"
        headers = {**self.headers, "Content-Type": "application/json"}
        return json.loads(request("POST", url, headers, body))

    def upload(self, object_path: str, data: bytes, content_type: str) -> None:
        quoted = urllib.parse.quote(object_path)
        url = f"{self.base}/storage/v1/object/{BUCKET}/{quoted}"
        headers = {**self.headers, "Content-Type": content_type, "x-upsert": "false"}
        request("POST", url, headers, data)


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("check", help="sign in and show which studies the agent can read")
    materials = sub.add_parser(
        "materials", help="list companion materials (reference poses/videos, ratings)"
    )
    materials.add_argument("--kind")
    media = sub.add_parser("media", help="list participant recordings")
    media.add_argument("--study")
    media.add_argument("--limit", type=int, default=20)
    fetch = sub.add_parser("fetch", help="download objects into local-data/research-chi25/")
    fetch.add_argument("paths", nargs="+")
    table = sub.add_parser("table", help="dump every readable row of a research table as JSON")
    table.add_argument("name")
    table.add_argument("--select", default="*")
    table.add_argument(
        "--out", help="write under local-data/research-chi25/tables/ instead of stdout"
    )
    uploads = sub.add_parser("uploads", help="list objects under uploads/<study>/")
    uploads.add_argument("study", choices=STUDIES)
    uploads.add_argument("folder", nargs="?", default="")
    upload = sub.add_parser(
        "upload",
        help="add a write-once object under uploads/<study>/ (editor role needed)",
    )
    upload.add_argument("study", choices=STUDIES)
    upload.add_argument("source", help="a file under local-data/")
    upload.add_argument("dest", help="path below uploads/<study>/, e.g. ratings/2026-11-20/x.csv")
    args = parser.parse_args()

    client = Client()
    if args.command == "check":
        access = client.rows("research_access", {"select": "study,role"})
        print(json.dumps(access, indent=2))
        if any(row["role"] not in ("viewer", "editor") for row in access):
            print(
                "warning: agent user has admin access; it needs at most editor",
                file=sys.stderr,
            )
    elif args.command == "materials":
        query = {
            "select": "id,scope,kind,label,object_path,bytes",
            "order": "kind,label",
        }
        if args.kind:
            query["kind"] = f"eq.{args.kind}"
        print(json.dumps(client.rows("research_material", query), indent=2))
    elif args.command == "media":
        query = {
            "select": "id,study,source_stem,video_path,pose_path",
            "order": "study,source_stem",
            "limit": str(args.limit),
        }
        if args.study:
            query["study"] = f"eq.{args.study}"
        print(json.dumps(client.rows("research_media", query), indent=2))
    elif args.command == "fetch":
        for path in args.paths:
            print(client.download(path).relative_to(REPO_ROOT))
    elif args.command == "table":
        if not args.name.startswith("research_"):
            sys.exit("only research_* tables are readable")
        rows = client.all_rows(args.name, args.select)
        if not args.out:
            print(json.dumps(rows, indent=2))
            return
        target = CACHE_ROOT / "tables" / Path(args.out).name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(rows))
        print(f"{len(rows)} rows -> {target.relative_to(REPO_ROOT)}")
    elif args.command == "uploads":
        prefix = "/".join(part for part in ("uploads", args.study, args.folder.strip("/")) if part)
        for entry in client.list(prefix):
            size = (entry.get("metadata") or {}).get("size")
            kind = "dir " if entry.get("id") is None else f"{size} bytes"
            print(f"{prefix}/{entry['name']}  {kind}")
    elif args.command == "upload":
        source = Path(args.source).resolve()
        local_root = (REPO_ROOT / "local-data").resolve()
        if not source.is_file() or local_root not in source.parents:
            sys.exit(
                "upload only files under local-data/ (participant data never leaves it otherwise)"
            )
        dest = PurePosixPath(args.dest)
        if dest.is_absolute() or ".." in dest.parts or not dest.name:
            sys.exit(f"refusing unsafe destination: {args.dest}")
        content_type = CONTENT_TYPES.get(source.suffix.lower(), "application/octet-stream")
        object_path = f"uploads/{args.study}/{dest}"
        client.upload(object_path, source.read_bytes(), content_type)
        print(f"uploaded {source.relative_to(REPO_ROOT)} -> {object_path}")


if __name__ == "__main__":
    main()
