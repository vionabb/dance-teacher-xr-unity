---
date: 2026-10-28
tags: [research-studio, discrepancy-review, hosting, annotation, ui]
artifacts:
  - assets/2026-10-28-hosted-discrepancy-ui/tablet-landscape-synthetic.png
  - assets/2026-10-28-hosted-discrepancy-ui/tablet-portrait-notes-synthetic.png
---

# Portable discrepancy review UI for hosted integration

Viona authorized coordinating with the hosting chat to get the discrepancy review desk and metric visualizers onto the production website. The hosting chat owns the backend, imports, schema, pull requests and deployment. This entry records the bounded browser/UI implementation; it does not establish that the feature is deployed or evaluated with users.

The UI was transplanted using a textual patch into an independent clone starting at rewritten main `9b130fd52004e9750ff33669a6e14bbb7075b79b`. No old feature Git objects were imported. The earlier type fixes remain intact. Hooks, server loaders, stores, catalog handlers, database migrations and production services were not changed in this slice.

## Browser contract

- Metric pages read `researchBackend: 'local' | 'hosted'` from page data. Local requests retain `/api/dev`; hosted requests use `/api/research`. The `source=local` query continues to mean manual file inspection, independently of the backend.
- Hosted catalog and performance endpoints use the existing browser DTO. A supplied `thumbnailUrl` takes precedence over the local fallback.
- Hosted discrepancy GET responses supply the existing task/navigation/annotator plus `backend: 'hosted'`, `ownerId`, `canAnnotate`, and an immutable `inputVersion` string. Hosted writes and draft access require those values; viewers can inspect intervals and saved notes but cannot enter or save observations.
- A hosted draft key contains the authenticated owner, study-scoped segment id, and input version. Its components are encoded to prevent separator collisions. Draft restoration happens only after the authenticated review response. Local draft keys and manual draft entry remain compatible with the original desk.
- POST sends the original observation fields plus `mutationId` and `inputVersion`. A pending UUID and serialized payload are saved with the draft before sending. An unchanged retry, including after reloading, retains its UUID; a changed payload gets a new UUID. Errors preserve the draft, and success clears it. Server uniqueness and immutable-input validation remain backend responsibilities.
- Hosted receipts say that the observation was saved to the research account. Only the local path mentions its verified SQLite backup. Observation IDs support either local numeric IDs or hosted string IDs.

Both visualizers retain the previous human-rating context, full-performance curve, interval selection/replay, optional overlays and metric audit, keyboard controls and notes. Metric navigation uses SvelteKit path resolution. Metric calculations were not changed.

## Validation

From `svelte-web-frontend/`, using Node 24 and the pinned pnpm:

```sh
pnpm test -- --run src/lib/research/discrepancy.test.ts src/lib/research/discrepancy-client.test.ts src/lib/research/review-playback.test.ts
pnpm check
pnpm lint
pnpm build
node scripts/verifyHostedDiscrepancy.mjs
```

The focused tests pass (six tests in three files). Type checking reports zero errors and the existing 12 warnings; lint and production build pass. Svelte autofixer reports no issues in the new composer, queue, switcher or either metric page; existing optional modernization suggestions remain in the large visualizers. Required daisyUI Blueprint tools were unavailable in this session.

The committed browser script creates an isolated temporary route and its own strict-port loopback server, uses mocked API responses and generated video/pose data, and cleans up its route/server. It requires Chromium and `ffmpeg` on PATH (override with `FFMPEG`); `DISCREPANCY_PROOF_PORT` changes its default port 5197. It makes no production-service calls and reads no participant files. The test checks:

- local/hosted transport and receipts;
- viewer controls and account/input draft isolation;
- failed saves, reload restoration, unchanged retry UUIDs, changed-payload UUIDs, successful clearing and note focus;
- both actual metric components loading and replaying a marked interval;
- tablet portrait 820×1180, tablet landscape 1180×820, phone portrait 390×844, without horizontal page overflow;
- bounded queue pagination from 50 to 60 synthetic items.

The test's video endpoint must implement byte ranges for seek assertions. It also waits for hydration before clicking the queue's server-rendered button. These are test-harness requirements, not production behavior changes.

[Landscape visualizer with synthetic pose/video](assets/2026-10-28-hosted-discrepancy-ui/tablet-landscape-synthetic.png) shows the paired videos, curve and review controls. [Portrait notes with synthetic data](assets/2026-10-28-hosted-discrepancy-ui/tablet-portrait-notes-synthetic.png) shows the interval and note composer. These screenshots contain no participant imagery or source pose data.

## Integration gates

The hosting chat must supply compatible authenticated loaders/endpoints, immutable media and input provenance, owner-scoped durable writes and retry uniqueness, the missing reference-pose imports, and study/segment identity mapping. Real iPad Safari playback, long-paused signed media expiry/reseek, session/access changes and large-performance load/compute behavior remain unverified by this synthetic Chromium proof. No research findings or thesis claims changed.

## Local backend restoration follow-up

The hosting chat found that the portable composer also needs the existing loopback-only local backend when used in local mode. A separate textual transplant restores only the discrepancy table and store functions, task/identity join, `/api/dev/discrepancy/[segmentId]` handlers, and the hooks endpoint guard. The hosting chat retains ownership of the queue page's hosted/local server loader. Unrelated older whole-aggregate CSV import changes were excluded.

Focused validation covers append-only observations, verified snapshots, separation from video-usability revisions, invalid intervals, and a forced backup-directory failure that returns a saved-row receipt with a warning rather than losing the committed observation. The three focused files (store, client-address boundary and observation validation) pass 13 tests; type checking remains zero errors and 12 baseline warnings; lint and build pass. Tests use disposable SQLite databases only.

The media audit found no displayed-video error/reload path in either visualizer; their existing error listener and `load()` calls belong only to detached metadata probes. The hosting chat confirmed that hosted video DTOs contain stable authorized paths, which can issue fresh redirects. It requested a separate explicit-reload UI follow-up that preserves the playhead and drafts, performs no automatic retries, and resumes playback only following a user gesture. That follow-up is distinct from restoring the local backend.
