# Blinded repair-case review

A small, separate review screen for the 48 blinded first-pass cases of the
exploratory isolated-jump repair rule (see
`lab-log/2026-10-06-preprocessing-metric-validation-handoff.md`). The October
v1 sample was lost; the current sample is v2, drawn on 2026-11-06. For each
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
  `lab-log/assets/2026-10-06-preprocessing-metric-validation/repair-adjudication-v2-selection.json`.
  `--allow-unfrozen-manifest` skips that check for synthetic dry runs only.

## Rule and sample (v2)

- `isolated_jump.py` is the rule under test (rule v2). It is experimental
  and is not used by any pipeline.
- `prepare_sample.py` applies it to a frozen manual-review release and writes
  a new private bundle: `blinded/first_pass_manifest.json`, `sealed/pool.json`,
  `sealed/first_pass_answer_key.json`, and an aggregate
  `selection_summary.json`. It refuses an existing output directory.
  `--video-info` maps each source-video sha256 to its measured `fps`,
  `width`, and `height`; tracked pixel points are normalized by them.

```bash
.venv/bin/python -m motion_extraction.repair_adjudication.prepare_sample \
  --release-root <copy of agentoutput:manual-review/manual-review> \
  --video-info <video_info.json> --output-root <new private directory>
```

The 2026-11-06 bundle is on Drive at `agentoutput:repair-adjudication/20261106-v2/`.
Keep `sealed/` off the review machine until judgments are frozen.

## Manifest fields

Each case is:

```json
{"blind_id": "V2-07", "video": "<path under --media-root>", "frame_index": 412,
 "fps": 30, "landmark": "LEFT_HIP", "point": [0.41, 0.63],
 "context_points": {"LEFT_SHOULDER": [0.43, 0.31]}}
```

`frame_index` is the source-video frame. `point` and `context_points` are
`[x, y]` coordinates normalized to the source video, and context points are
the other finite upper-body landmarks on that frame.

## Run

From `motion-pipeline/`:

```bash
.venv/bin/python -m motion_extraction.repair_adjudication.server \
  --blinded-manifest temp/experiments/20261106-repair-adjudication-v2/blinded/first_pass_manifest.json \
  --media-root ../data \
  --database temp/experiments/20261106-repair-adjudication-v2/adjudication.sqlite3 \
  --port 8775
```

Open `http://127.0.0.1:8775`. A LAN bind needs `--host <address>` and a
six-character `--access-token`, as with the annotation tool. Keep the
database and exports in access-controlled storage: they hold judgments on
participant-derived frames. Back up a JSONL export to the Drive bundle folder after each session.

## Tests

```bash
.venv/bin/python -m pytest motion_extraction/tests/test_repair_adjudication.py -q
```

The tests use synthetic cases only. They cover the rule thresholds, stratified
and deterministic sampling, the blinded projection, the sealed-path and
frozen-hash guards, append-only triggers, refusal of the annotation database,
judgment validation, and the HTTP/auth contract.
