---
date: 2026-10-01
tags: [metrics, visualization, frontend]
artifacts: []
---

# Switching metrics within a performance review

## User intent

Viona asked to switch which metric is visualized while viewing a participant performance. The chosen performance and position in its full multi-segment timeline should carry across the Qijia2D and Viona2D inspectors.

## Decision

The inspector header offers Qijia2D and Viona2D as metric choices. A switch carries the opaque performance ID and global timeline time in the route URL. The destination restores the performance from the local catalog, loads its ordered segments, and seeks through the same timeline mapping used by its scrubber. This makes a metric change a normal browser navigation and keeps the selection inspectable without changing either metric calculation.

## Implementation and checks

The Qijia2D and Viona2D review headers now share a compact DaisyUI metric selector. The original browser history entry receives the chosen performance and current global time before the route change, so Back can restore that review. Both routes restore a saved performance after their local catalog and segments have loaded; a performance-only link starts at zero. Returning to the picker clears the saved performance and time from the URL. Unknown or malformed values leave the picker usable.

Browser review on a four-segment performance switched Viona2D → Qijia2D → Viona2D at 9.63 seconds and retained segment 3, pose row 24, and the scrubber position. Browser Back restored the same review; the selector remained visible at 390 × 844. Returning to the picker cleared the query parameters. A performance-only link opened at 0 seconds, and an invalid link left the picker available. No participant frames or screenshots were saved.

The production frontend build passed with non-secret placeholder environment values. The full `pnpm check` still reports pre-existing errors elsewhere in the repository, with no diagnostics in the changed routes.
An independent read-only code review found no material issue in the switcher or URL restoration path.

## Research status

This is an inspection-workflow change. It does not validate either metric or change dissertation claims.
