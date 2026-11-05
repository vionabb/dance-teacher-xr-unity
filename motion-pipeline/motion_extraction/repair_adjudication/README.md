# Blinded repair-case review

A small, separate review screen for the 48 blinded first-pass cases prepared in
`temp/experiments/20261006-repair-adjudication-v1/` (see
`lab-log/2026-10-06-preprocessing-metric-validation-handoff.md`). For each
case it shows the source video at the case frame with the tracked landmark
position, lets the reviewer step through neighboring frames, and records one
of three judgments by blind ID:

- `acceptable_as_is`
- `incorrect_correctable`, optionally with the landmark dragged to a corrected
  position on the case frame
- `unjudgeable`

plus an optional note and the frames that were viewed.

## Separation from the annotation tool and the answer key

- It has its own server, routes, access cookie, and SQLite file. It never
  opens the active annotation database: a database file that was not created
  by this tool is refused, and so is a database created for a different
  manifest hash.
- The judgment table is append-only. SQLite triggers reject every `UPDATE`
  and `DELETE`; each save is a new revision, and the latest revision per
  annotator and blind ID is the current judgment. Exports (JSONL/CSV) contain
  the full revision history.
- Only the blinded manifest is loaded. The manifest, media root, every case
  video, and the database are refused if any path component is `sealed`.
  The browser receives only `blind_id`, `frame_index`, `fps`, `landmark`,
  `point`, and optional `context_points`, in manifest order. Any other
  manifest field, including source file names, stays on the server. Videos
  are served at `/media/<blind_id>`.
- By default the manifest's sha256 must equal the frozen
  `blinded_first_pass_sha256` recorded in
  `lab-log/assets/2026-10-06-preprocessing-metric-validation/repair-adjudication-selection.json`.
  `--allow-unfrozen-manifest` skips that check for synthetic dry runs only.

## Expected manifest fields

The loader expects a list of cases (top level or under `"cases"`):

```json
{"blind_id": "B07", "video": "<path under --media-root>", "frame_index": 412,
 "fps": 30, "landmark": "LEFT_HIP", "point": [0.41, 0.63],
 "context_points": {"LEFT_KNEE": [0.43, 0.81]}}
```

`point` and `context_points` are normalized `[x, y]` image coordinates (an
`{"x", "y"}` object is also accepted). This contract was written without
access to the private manifest; check its field names against the real file
before the first session and adapt the loader, not the private file, if they
differ.

## Run

From `motion-pipeline/`:

```bash
.venv/bin/python -m motion_extraction.repair_adjudication.server \
  --blinded-manifest temp/experiments/20261006-repair-adjudication-v1/blinded/first_pass_manifest.json \
  --media-root <directory the case video paths are relative to> \
  --database <private storage>/repair-adjudication-v1.sqlite3 \
  --port 8775
```

Open `http://127.0.0.1:8775`. A LAN bind needs `--host <address>` and a
six-character `--access-token`, as with the annotation tool. Keep the
database and exports in access-controlled storage: they hold judgments on
participant-derived frames.

## Tests

```bash
.venv/bin/python -m pytest motion_extraction/tests/test_repair_adjudication.py -q
```

The tests use synthetic cases only. They cover the blinded projection, the
sealed-path and frozen-hash guards, append-only triggers, refusal of the
annotation database, judgment validation, and the HTTP/auth contract.
