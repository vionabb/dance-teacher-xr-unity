---
date: 2026-09-30
tags: [metrics, visualization, frontend]
artifacts: []
---

# Viona2D inspector views

## User intent

Viona asked to see several implemented visualizations of the Viona2D metric and choose among them while inspecting a performance. The candidate views are a selected-vector lens, an eight-pair audit, and an angle-versus-length scatterplot. She also clarified the Qijia2D drawing: make the vector shafts longer, arrow tips smaller, vectors nearly opaque, and endpoint error connectors a two-layer red laser with a dark outline and light core.

## Metric and design decisions

Viona2D compares the same eight upper-body pairs as Qijia2D but uses each pair's 2D direction and projected length. It compares the raw directions by angle; it adjusts the participant length by the ratio of reference to participant body-scale indicators; then it blends angle discrepancy and adjusted-length discrepancy. Each body-scale indicator is half shoulder width plus one quarter each left and right torso height. The angle weight is the minimum of two linear mappings from the raw pair lengths over a 50–100 px interval.

The production mapping is not clamped, so the weight can be below zero or above one. The inspector should expose the actual weight and mark extrapolation rather than present it as a bounded reliability probability. Zero or absent geometry can make the current production calculation non-finite; the visual can flag such frames without silently changing the production metric.

The three views will share one performance, timeline, selected frame, and selected vector pair. The existing local catalog and exact segmented pose/video pairing remain the data source. A separate Viona2D route keeps experimental visual design independent of the Qijia2D inspector. The bottom frame-error chart remains the scrubber for the full multi-segment performance.

## Implementation and checks

The frontend now offers three selectable views over a shared frame and selected pair: a vector lens, an eight-pair audit, and an angle-versus-length scatterplot. The full-performance Viona2D curve doubles as the fixed bottom scrubber. The local performance catalog, reference video, segmented pose pairing, and fixed pose crops are reused from the Qijia2D inspector. The research metric explorer links to the new Viona2D route.

A finite-case parity test compares every pair and the frame mean against the production Viona2D metric. Focused tests also cover the unclamped 50–100 px gate, body-scale length adjustment, and invalid geometry. The four focused tests pass. Svelte diagnostics report no errors in changed files; the full frontend check still reports 64 errors and 12 warnings in unrelated existing files. The frontend build succeeds with placeholder values for the four required environment exports.

An independent read-only review found no Viona2D formula mismatch for valid finite vectors. The inspector flags degenerate pairs and leaves their frames blank in the chart; production currently propagates a non-finite result for those cases, so this is a diagnostic display policy rather than a claim that production handles missing data. Dataset seeking assumes 30 fps, inherited from the Qijia2D inspector. A stratified sample of 20 participant clips across the local corpus reported 30/1 for both average and nominal frame rates; the entire corpus was not probed.

The metric visualizations are debugging aids. No Viona2D metric validation result is inferred from this work.

## Next research step

Use the views on high-error, short-projection, and low-visibility frames to see whether the blend follows meaningful movement differences or pose-estimation artifacts. Record any proposed metric changes separately, then assess their effect against human ratings before updating the thesis's metric findings.
