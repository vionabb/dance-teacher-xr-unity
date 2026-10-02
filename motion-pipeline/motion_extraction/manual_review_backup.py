"""Create, publish, and restore immutable manual-review snapshots with rclone.

This deliberately uses copy-only transfers. Snapshot payloads contain review
data and manifests, never source task videos.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import tempfile
from datetime import datetime, timezone

VIDEO_SUFFIXES = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm", ".mpg", ".mpeg"}
MANIFEST = "SHA256SUMS.json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def _safe_copy_tree(source: Path, destination: Path) -> bool:
    copied = False
    for item in sorted(source.rglob("*")):
        if item.is_symlink() or not item.is_file() or item.suffix.lower() in VIDEO_SUFFIXES:
            continue
        if item.name.lower().endswith(("-wal", "-shm", "-journal")):
            continue
        relative = item.relative_to(source)
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        if item.suffix.lower() in {".sqlite3", ".sqlite", ".db"}:
            _sqlite_snapshot(item, target)
        else:
            shutil.copy2(item, target)
        copied = True
    return copied


def _sqlite_snapshot(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(f"file:{source.resolve()}?mode=ro", uri=True) as src:
        with sqlite3.connect(destination) as dst:
            src.backup(dst)


def _write_manifest(root: Path) -> None:
    entries = {
        str(path.relative_to(root)): {"size_bytes": path.stat().st_size, "sha256": sha256(path)}
        for path in sorted(root.rglob("*"))
        if path.is_file() and path.name != MANIFEST
    }
    (root / MANIFEST).write_text(json.dumps({"algorithm": "sha256", "files": entries}, indent=2) + "\n")


def verify_snapshot(root: Path) -> None:
    manifest_path = root / MANIFEST
    data = json.loads(manifest_path.read_text())
    if data.get("algorithm") != "sha256" or not isinstance(data.get("files"), dict):
        raise ValueError(f"Invalid checksum manifest: {manifest_path}")
    expected = data["files"]
    actual = {str(p.relative_to(root)) for p in root.rglob("*") if p.is_file() and p.name != MANIFEST}
    if actual != set(expected):
        raise ValueError("Snapshot file set does not match checksum manifest")
    for relative, digest in expected.items():
        path = (root / relative).resolve()
        if root.resolve() not in path.parents:
            raise ValueError(f"Unsafe manifest path: {relative}")
        expected_hash = digest.get("sha256") if isinstance(digest, dict) else digest
        expected_size = digest.get("size_bytes") if isinstance(digest, dict) else None
        if expected_size is not None and path.stat().st_size != expected_size:
            raise ValueError(f"Size mismatch: {relative}")
        if sha256(path) != expected_hash:
            raise ValueError(f"Checksum mismatch: {relative}")


def create_snapshot(root: Path | None, output_parent: Path, active_db: Path | None, active_manifest: Path | None) -> Path:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output = output_parent / f"manual-review-{stamp}"
    output.mkdir(parents=True, exist_ok=False)
    if root and root.is_symlink():
        raise ValueError(f"Refusing symlink manual-review root: {root}")
    copied_canonical = bool(root and root.is_dir() and _safe_copy_tree(root, output / "manual-review"))
    if active_db:
        if not active_db.is_file():
            raise FileNotFoundError(active_db)
        _sqlite_snapshot(active_db, output / "active-source" / active_db.name)
    if active_manifest:
        if not active_manifest.is_file():
            raise FileNotFoundError(active_manifest)
        target = output / "active-source" / active_manifest.name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(active_manifest, target)
        # Preserve only the pose stream explicitly referenced for UI review.
        # source_artifact commonly names the task clip and is never copied.
        try:
            manifest_data = json.loads(active_manifest.read_text())
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError(f"Invalid task manifest: {active_manifest}") from error
        artifacts = output / "active-source"
        base = active_manifest.parent.resolve()
        for task in manifest_data.get("tasks", []):
            relative = task.get("landmarks_artifact")
            if not relative:
                continue
            rel_path = Path(relative)
            source = (base / rel_path).resolve()
            if (rel_path.is_absolute() or base not in source.parents or source.suffix.lower() != ".json"
                    or any(part.is_symlink() for part in [active_manifest.parent / rel_path, *list((active_manifest.parent / rel_path).parents)[:-1]])):
                raise ValueError(f"Unsafe landmarks_artifact path: {relative}")
            if not source.is_file():
                raise FileNotFoundError(f"Referenced landmarks artifact not found: {source}")
            target = artifacts / rel_path
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, target)
    if not copied_canonical and not active_db and not active_manifest:
        output.rmdir()
        raise ValueError("Refusing to create an empty snapshot; provide a nonempty root or active inputs")
    _write_manifest(output)
    verify_snapshot(output)
    return output


def _remote(value: str | None) -> str:
    result = value or os.environ.get("MANUAL_REVIEW_RCLONE_REMOTE") or "agentoutput:manual-review"
    if not result or ":" not in result or result.startswith(":"):
        raise ValueError("Provide a rclone remote path (REMOTE:path) or set MANUAL_REVIEW_RCLONE_REMOTE")
    return result.rstrip("/")


def publish(snapshot: Path, remote: str | None) -> str:
    verify_snapshot(snapshot)
    destination = _remote(remote)
    subprocess.run(["rclone", "copy", str(snapshot), destination, "--checksum", "--exclude", f"/{MANIFEST}", "--progress"], check=True)
    subprocess.run(["rclone", "check", str(snapshot), destination, "--one-way", "--exclude", f"/{MANIFEST}"], check=True)
    subprocess.run(["rclone", "copyto", str(snapshot / MANIFEST), f"{destination}/{MANIFEST}"], check=True)
    return destination


def restore(remote_snapshot: str, destination: Path) -> None:
    if destination.exists() and (not destination.is_dir() or any(destination.iterdir())):
        raise FileExistsError(f"Destination exists and is not empty: {destination}")
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="manual-review-restore-") as temporary:
        staged = Path(temporary) / "snapshot"
        staged.mkdir()
        remote_manifest = f"{remote_snapshot.rstrip('/')}/{MANIFEST}"
        subprocess.run(["rclone", "copyto", remote_manifest, str(staged / MANIFEST)], check=True)
        data = json.loads((staged / MANIFEST).read_text())
        if data.get("algorithm") != "sha256" or not isinstance(data.get("files"), dict):
            raise ValueError("Invalid remote checksum manifest")
        listed: list[str] = []
        for relative in data["files"]:
            relative_path = Path(relative)
            target = (staged / relative_path).resolve()
            if (relative_path.is_absolute() or staged.resolve() not in target.parents
                    or relative_path.name == MANIFEST or "\n" in relative or "\r" in relative or "\0" in relative):
                raise ValueError(f"Unsafe remote manifest path: {relative}")
            listed.append(relative)
        files_from = Path(temporary) / "manifest-files.txt"
        files_from.write_text("\n".join(listed) + ("\n" if listed else ""))
        subprocess.run(["rclone", "copy", remote_snapshot, str(staged), "--files-from-raw", str(files_from), "--progress"], check=True)
        verify_snapshot(staged)
        if destination.exists():
            destination.rmdir()
        shutil.copytree(staged, destination)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    snap = commands.add_parser("snapshot", help="make and locally verify an immutable snapshot")
    snap.add_argument("--root", type=Path, default=Path("local-data/manual-review"))
    snap.add_argument("--output-dir", type=Path, default=Path("temp/manual-review-snapshots"))
    snap.add_argument("--active-db", type=Path)
    snap.add_argument("--active-manifest", type=Path)
    pub = commands.add_parser("publish", help="copy a verified snapshot into the stable remote folder")
    pub.add_argument("snapshot", type=Path)
    pub.add_argument("--remote", help="rclone destination folder (default: agentoutput:manual-review; or MANUAL_REVIEW_RCLONE_REMOTE)")
    pull = commands.add_parser("restore", help="restore the current manifest-listed files without clobbering")
    pull.add_argument("remote_snapshot", nargs="?", default="agentoutput:manual-review", help="rclone snapshot folder")
    pull.add_argument("destination", type=Path)
    args = parser.parse_args()
    if args.command == "snapshot":
        result = create_snapshot(args.root, args.output_dir, args.active_db, args.active_manifest)
        print(f"Verified snapshot: {result}")
    elif args.command == "publish":
        print(f"Published snapshot to {publish(args.snapshot, args.remote)}")
    else:
        restore(args.remote_snapshot, args.destination)
        print(f"Restored verified snapshot to {args.destination}")


if __name__ == "__main__":
    main()
