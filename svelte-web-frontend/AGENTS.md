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
  `../motion-pipeline/temp/cached/userstudydata/`; do not add participant pose
  files to this frontend repository.
- Generated/local metric outputs: `testResults/`
- Cross-language metric export: `artifacts/motion_metrics.csv`, consumed by the Python fitting script
- Pipeline-provided app data: `src/lib/data/bundle/` and `static/bundle/`

Check the Python producer or consumer when changing shared bundle schemas, metric columns, filename conventions, or artifact paths.

## Validation

Run from `svelte-web-frontend/` and prefer the smallest applicable command:

- One-shot focused test: `pnpm test -- --run <test-file>`
- All tests once: `pnpm test -- --run`
- Type and Svelte checks: `pnpm check`
- Formatting and lint checks: `pnpm lint`
- Production build: `pnpm build`

Do not run the default `pnpm test` in automation when a one-shot run is intended; it starts watch mode.
