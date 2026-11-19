#!/usr/bin/env python3
"""Read-only access to the private `research-chi25` Supabase bucket for cloud agents.

Signs in as the dedicated research-agent user (a `viewer` in `research_access`)
and reads catalog rows and objects through the same row-level security as the
hosted research pages. It sees only what that user is granted, and it never
writes to Supabase.

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
from pathlib import Path

BUCKET = "research-chi25"
REPO_ROOT = Path(__file__).resolve().parent.parent
CACHE_ROOT = REPO_ROOT / "local-data" / BUCKET


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
            {"email": env("RESEARCH_AGENT_EMAIL"), "password": env("RESEARCH_AGENT_PASSWORD")}
        ).encode()
        token = json.loads(
            request(
                "POST",
                f"{self.base}/auth/v1/token?grant_type=password",
                {"apikey": self.anon, "Content-Type": "application/json"},
                payload,
            )
        )
        self.headers = {"apikey": self.anon, "Authorization": f"Bearer {token['access_token']}"}

    def rows(self, table: str, query: dict[str, str]) -> list[dict]:
        url = f"{self.base}/rest/v1/{table}?{urllib.parse.urlencode(query)}"
        return json.loads(request("GET", url, self.headers))

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
    args = parser.parse_args()

    client = Client()
    if args.command == "check":
        access = client.rows("research_access", {"select": "study,role"})
        print(json.dumps(access, indent=2))
        if any(row["role"] != "viewer" for row in access):
            print("warning: agent user has more than viewer access", file=sys.stderr)
    elif args.command == "materials":
        query = {"select": "id,scope,kind,label,object_path,bytes", "order": "kind,label"}
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


if __name__ == "__main__":
    main()
