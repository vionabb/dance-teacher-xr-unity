---
date: 2026-10-03
tags: [research-workspace, annotation, frame-usability, mobile]
artifacts: []
---

# Bring frame corrections into the research workspace

Viona asked to bring the frame-by-frame annotation tool into the SvelteKit
research interface while keeping the parts of the original that made it fast:
video-first review, sparse error marking, direct landmark correction, and an
effective mobile layout. This follows the compact whole-video usability page
and the broader aim of one interface for inspecting the processing pipeline.

The existing frame task manifest selects 49 follow-up segments, and its
SQLite revision history already contains substantial work. The port reads
that history in place and sends every new revision through the original
Python `AnnotationStore` validator. This preserves its source experiment,
task IDs, exact frame response fields, append-only provenance, and prior
corrections. It also avoids migrating evolving frame responses into a second
authoring database. The local research SQLite database continues to own new
whole-video ratings and derived records.

The Svelte screen keeps one-tap Good/Flawed/Unusable classification, frame
stepping, slow playback, a precise scrubber, direct landmark dragging, mark
details, and an upper-body timeline. On phones the video and thumb controls
occupy the screen while secondary tools move to a bottom sheet. Completion,
skip, and giving up remain explicit decisions. The route is development-only
and loopback-only, matching the current research workspace boundary.

The original 49 tasks were loaded read-only from their paired live manifest
and database. A test on a synthetic database verified an append, exact frame
response preservation, and rejection of a stale revision. The Vercel build,
focused frontend lint, and Playwright captures of the reference clip at
375×667, 390×844, 994×575, and desktop sizes passed. The captures exposed
an inherited navbar collapse bug that had pushed phone controls below the
viewport; the shared navbar now truly hides when collapsed. The
repository-wide Svelte check still reports existing errors outside the new
frame-review files.

During a later browser save probe, a service worker bypassed the intended
request interception and wrote one unintended revision (1743) to the original
annotation database. I immediately appended revision 1744 through the same
validated, compare-and-swap path to restore the prior completed response.
Read-only comparison confirmed that 1744 is active, its status and substantive
annotation fields match the prior revision 742, and the only additional
response fields are the new format's default `last_viewed_frame: 0` and
`video_usability_rating_override: null`. Both probe and recovery remain in
the append-only history. The probe also exposed a Svelte proxy serialization
error; the editor now snapshots reactive labels and marks before saving.
I verified the fix through a second loopback server backed by a temporary
SQLite copy: a frame label saved, reloaded, and remained selected with no page
error. I stopped that server and removed the copy. The production build and
focused lint then passed with placeholder build credentials.

A later pass can unify the legacy video usability authoring history and the
new research rating store once the shared contracts settle.
