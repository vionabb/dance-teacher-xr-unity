# Local annotation tool

This tool normally runs only on the computer where it is started. It can also
be used from a phone on the same trusted Wi-Fi network with an explicit,
temporary access code. Its primary annotation is an editable 2D skeleton:
drag landmarks over the person and label each one `Non-occluded`,
`Semi-occluded`, or `Fully occluded`. A selected profile supplies initial
coordinates and visibility states. Every revision records the initial coordinate
and per-landmark source profile, final coordinate, drag/change counts, and global
initializer. The server ranks profiles using error beyond an annotation-
repeatability tolerance plus visibility-state error; fully occluded landmarks
contribute visibility evidence but not uncertain positional error.
The canvas includes a padded region around the source image so semi- and fully
occluded landmarks can be positioned outside the recorded frame. Their inferred
connections remain visible with lower-confidence color coding. Boundary checks
never prevent an unclear/skip judgment.
The editor also expands that padding around any initialized landmark that starts
outside the source frame, keeping it visible and selectable so an annotator can
correct it before completing the case. All landmarks can be dragged into this
outside-frame padding; completion validation still requires a non-occluded
landmark to be inside the source frame.

An optional free-text field records one observation for each frame. SQLite is the
authority for autosave and resume; every save appends a revision rather than
overwriting an earlier judgment.

First generate an experiment containing `annotation_tasks.json`, then run:

```bash
cd motion-pipeline
.venv/bin/python -m motion_extraction.annotation_tool.server \
  --experiment-root temp/experiments/20260825-preprocessing-cleanup-v10 \
  --database data/human-annotations/preprocessing-overlay-quality/annotations.sqlite3 \
  --port 8765
```

Open `http://127.0.0.1:8765`. The explicit database path above is recommended
because experiment output directories may be replaced. CSV and JSONL revision
exports are available in the interface. Stop with Ctrl-C and restart the same
command to resume. Periodically download a JSONL export and copy it to durable,
access-controlled research storage; it contains the complete append-only
revision history. Archive the SQLite database only while the server is stopped
(and include its `-wal`/`-shm` companions if present).

The server consumes a versioned task manifest rather than hard-coding the pose
experiment, so future human-input questions can reuse persistence, progress,
revision, export, editable-landmark, and frame-note behavior.

## Blinded temporal comparison

The `temporal_pose_comparison` workflow compares a source-motion window with
three anonymized overlay videos. Generate a new batch with explicit data roots:

```bash
uv run --locked python -m motion_extraction.annotation_tool.generate_temporal_comparison_tasks \
  --corpus-root temp/experiments/<pose-corpus> \
  --numerical-output temp/experiments/<c4-grid-output> \
  --reference-video-root ../data/reference_motions/videos \
  --participant-video-root ../data/participant_motions \
  --output-root temp/experiments/<new-temporal-batch> \
  --seed 20260826 \
  --task-count 6
```

The default batch contains four unique source-backed windows and two blinded
repeats with permuted candidate labels. The served
`annotation_tasks.json` contains only labels A/B/C. The profile mapping is
written to a sibling `<output-root>-answer-key.csv`, outside the served
experiment root; keep that file private until review is complete. The generator
requires ffmpeg with `libx264`, writes H.264/yuv420p fast-start MP4s, and never
modifies an existing output directory or annotation manifest.

## Agent and test instructions

Changes to the annotation tool must include or update focused tests in
`motion_extraction/tests/test_annotation_tool.py`. Cover both the persistence
contract and any changed browser interaction contract (including the static
HTML/JavaScript when no browser test runner is available). Run the focused
suite from `motion-pipeline`:

```bash
.venv/bin/python -m pytest motion_extraction/tests/test_annotation_tool.py -q
node --check motion_extraction/annotation_tool/static/app.js
```

Do not consider an annotation-tool change complete without running these
checks. Keep the server-side validation and browser interaction behavior in
sync when changing access, task workflow, landmark selection, dragging,
panning, or occlusion controls.

Whenever an annotator reports a bug, add a focused regression test for it when
the behavior is feasible to test. The test should fail against the buggy
behavior and pass after the fix; if the browser behavior cannot be exercised
directly, test the closest stable HTML, CSS, JavaScript, or server-side
contract and document that limitation.

### Real-browser tests

`motion_extraction/tests/test_annotation_tool.py` asserts against the static
HTML/CSS/JS source text and the server's HTTP contract; it cannot see actual
pointer-drag coordinate transforms, real `localStorage`/access-code gating,
or layout at a given viewport size. `motion_extraction/tests/
test_annotation_tool_browser.py` covers exactly those cases with a real
Chromium instance driven by Playwright, against a real `AnnotationServer`
started in a background thread (the same pattern already used by the
server-contract tests above). Add a case there, rather than a new source-text
assertion, when a change affects: the canvas drag/hit-test math in
`configureCanvas()`/`sourcePoint()`, the access-code login gate end to end,
or narrow-viewport/mobile layout reachability of controls under `#actions` or
`#landmark-panel`.

This suite is opt-in because it needs a real browser binary and network
access to the CDN-hosted Tailwind/daisyUI assets the page loads; it is not
part of the default `pytest` run or the motion-pipeline smoke gate. Set it up
once per environment, then run it explicitly:

```bash
cd motion-pipeline
uv sync --group browser-tests
uv run playwright install chromium
uv run --locked pytest motion_extraction/tests/test_annotation_tool_browser.py -m browser -q
```

## Research-tool UI guidance

Even internal research tools should be visually considered, modern, and easy
to use. Use daisyUI as the component library on top of Tailwind CSS: prefer
daisyUI components and semantic classes for buttons, forms, dialogs, alerts,
and states, with Tailwind utilities for layout, spacing, typography, and
responsive behavior. Keep custom CSS limited to genuinely specialized
visuals. Design for the annotator's actual workflow: show only
necessary information, make the current task and next action obvious, keep
controls touch-friendly, preserve keyboard focus and accessible labels, avoid
hidden content behind fixed controls, and provide clear, non-destructive
error feedback. Validate the UI at narrow mobile and desktop widths before
handing it to annotators.

## Phone on the local network

Do this only on a trusted private network: the source frames can contain
participant media. Choose a six-character access code using uppercase letters
and numbers and keep it private. The server refuses a LAN bind unless you
provide one.

```bash
cd motion-pipeline
ACCESS_CODE="A7K2Q9"
echo "Access code: $ACCESS_CODE"
.venv/bin/python -m motion_extraction.annotation_tool.server \
  --experiment-root temp/experiments/20260825-preprocessing-cleanup-v10 \
  --database data/human-annotations/preprocessing-overlay-quality/annotations.sqlite3 \
  --host 192.168.1.21 --port 8765 --access-token "$ACCESS_CODE"
```

On the phone, open `http://192.168.1.21:8765`, enter the same access code in
the **Access code** field, then load/resume. The code is sent only in the
`X-Annotation-Token` request header; it is never placed in the URL, including
downloads. API requests and participant-media artifacts require it. The small
application shell is intentionally public so the browser can show this
access-code field before it can send authenticated requests; do not expose this
server beyond your private LAN. If macOS asks about incoming connections, allow
the Python process on private networks only.

To avoid re-entering it on a personal phone, select **Remember this device**
before loading. This stores the code and annotator name only in that browser on
that device; use **Log out** before lending, selling, or otherwise sharing
the device.
The mobile skeleton editor uses one-finger landmark dragging and two-finger
view panning. Tap a landmark to open its detail popup and change occlusion,
then use **Reset view** to return to the full frame.

Five appended tolerance-repeat tasks use one alternate initializer from each of
`B0`–`C4`, never matching the pinned original annotation's initializer. After at
least three repeats, the active positional tolerance becomes the median of the
per-repeat p90 torso-normalized differences for landmarks marked non-occluded in
both passes. Semi-occluded repeatability is reported separately. Before that,
the provisional tolerance is 5% of torso length. Exports preserve historical
scores and add final scores recomputed with the currently active tolerance.

## UI source map

The browser shell lives in `static/index.html`, its visual system in
`static/style.css`, and workflow state/rendering in `static/app.js`. The two
main screens are `#skeleton-screen` (landmark alignment) and
`#annotation-screen` (source-evidence quality, factors, and notes). The
`#landmark-panel` beside the canvas persistently shows occlusion controls for
the selected landmark; it starts with the landmark showing the greatest
disagreement across preprocessing overlays. Keep those IDs stable: JavaScript
uses them as workflow boundaries and the focused tests assert their presence.
The fixed `#actions` bar is shared by both screens, so
changes to its height should be paired with the body's bottom padding. The UI
uses daisyUI classes for controls and a small custom layer for the canvas,
editor, and responsive layout.
