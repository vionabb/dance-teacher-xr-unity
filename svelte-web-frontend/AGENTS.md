# Svelte Frontend Agent Instructions

Follow [../AGENTS.md](../AGENTS.md) first.

## Warm start

1. Read [README.md](README.md) for Node, pnpm, Supabase, and media-bundle setup.
2. Read [../documentation/technical-architecture.md](../documentation/technical-architecture.md) before changing evaluation, coaching, or pipeline interfaces.
3. Use [package.json](package.json) as the source of truth for scripts and tool versions.
4. Use [.vscode/launch.json](.vscode/launch.json) for current development and asset-sync launch configurations, but treat absolute workstation paths as examples only.

## Important workflows and contracts

- Teaching and practice-plan logic: `src/lib/ai/TeachingAgent/`
- Live and terminal evaluation: `src/lib/ai/evaluation/`
- Metric implementations and study fixtures: `src/lib/ai/motionmetrics/`
- Participant-study videos and canonical pose artifacts are owned by
  `../data/participant_motions/<study>/`; do not add participant pose
  files to this frontend repository.
- Generated/local metric outputs: `testResults/`
- Cross-language metric export: `artifacts/motion_metrics.csv`, consumed by the Python fitting script
- Pipeline-provided app data: `src/lib/data/bundle/` and `static/bundle/`

Check the Python producer or consumer when changing shared bundle schemas, metric columns, filename conventions, or artifact paths.

## UI work with daisyUI Blueprint

- Viona's rule (2026-11-20): default to daisyUI components (card, fieldset, list, tabs, badge, join, collapse, and so on, with the `daisy-` prefix) whenever one fits. Reserve custom components and hand-rolled styling for UI daisyUI does not cover, such as the span timeline.
- Research workspace pages (`/research/**`) share a frame: the root layout wraps them in `ResearchShell.svelte`, which applies the white-surface `research` daisyUI theme (`src/app.pcss`) on a light page background. Start each page with `ResearchHeader.svelte` (breadcrumbs, title, description and actions snippets), put content in bordered `daisy-card`/`daisy-list`/table surfaces with `bg-base-100`, and use `ResearchIcon.svelte` for icons (offline Lucide subset; add icons there). Show CHI25 recording stems through `recordingTitle()` in `$lib/research/source-stem.ts`, keeping the raw stem as secondary text.
- For new or edited UI, use the available daisyUI Blueprint MCP tools or skills and follow their current instructions and complete results. Inspect the existing Svelte components, Tailwind/daisyUI setup, and visual conventions first. "Blueprint" names the MCP server, not a theme to apply.
- Start a cohesive UI workflow with `daisyui_setup_expert`, then `daisyui_rules_enforcer`. For a new complete page or screen, also use `daisyui_creative_director` and `daisyui_page_architect`. Before writing component code, get the needed syntax from `daisyui_component_syntax_expert`, including any remaining snippet batches it requests.
- After a substantive UI change, use `daisyui_quality_inspector` and follow its next action. Then inspect the diff and verify the rendered UI and relevant checks. Follow the tool's exception for copy-only or harmless localized fixes. If a required Blueprint tool is unavailable, report that limitation instead of substituting invented guidance.

## UI screenshots for Viona's review

Viona's standing rule (2026-11-20): whenever you build or change UI, capture
screenshots when you finish and send them to her (in the project thread when
working in the Claude project) so she can annotate them and give feedback.
Maintain the harness as part of every UI change.

- Run `pnpm screenshots` (or `pnpm screenshots -- --only <scenario-id> --out <dir>`).
  It starts a loopback dev server, opens dev-only fixture pages under
  `/dev/ui-harness/<scenario>`, and saves desktop and phone PNGs plus
  `contact-sheet.png` and `manifest.json`. `--base-url` reuses a running dev server;
  `--list` prints the scenarios.
- Add or update a scenario for each screen you change: fixture data in
  `src/lib/server/ui-harness.ts`, the view switch in
  `src/routes/dev/ui-harness/[scenario]/+page.svelte`, and capture states and
  request mocks in `scripts/ui-screenshots/scenarios.mjs`. Mock every write;
  the harness must never touch Supabase.
- Media comes from the git-ignored `local-data/` cache (fetched with
  `.github/research-storage.py` when cloud credentials exist), else a synthetic
  test video. Viona allows real study media, including participant videos and
  data, in screenshots sent to her. Never commit or push those screenshots or the
  media: the default output (`artifacts/ui-screenshots/`) is git-ignored, the
  runner refuses an unignored path inside the repo, and in the Claude project
  save them under `/mnt/project-files/screenshots/<date>-<slug>/`.
- The harness routes 404 outside a loopback dev server.
- The app is installable (PWA) and must stay navigable without browser chrome:
  see [../documentation/pwa.md](../documentation/pwa.md). For changes to
  navigation, layout bars, downloads or links leaving the app, add the
  `standalone` viewport (`--viewports phone,standalone`) and run
  `scripts/pwa/walk-standalone.mjs`.

## Validation

Run from `svelte-web-frontend/` and prefer the smallest applicable command:

- One-shot focused test: `pnpm test -- --run <test-file>`
- All tests once: `pnpm test -- --run`
- Type and Svelte checks: `pnpm check`
- Formatting and lint checks: `pnpm lint`
- Production build: `pnpm build`

Do not run the default `pnpm test` in automation when a one-shot run is intended; it starts watch mode.
