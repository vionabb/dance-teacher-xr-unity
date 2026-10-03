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

- For new or edited UI, use the available daisyUI Blueprint MCP tools or skills and follow their current instructions and complete results. Inspect the existing Svelte components, Tailwind/daisyUI setup, and visual conventions first. "Blueprint" names the MCP server, not a theme to apply.
- Start a cohesive UI workflow with `daisyui_setup_expert`, then `daisyui_rules_enforcer`. For a new complete page or screen, also use `daisyui_creative_director` and `daisyui_page_architect`. Before writing component code, get the needed syntax from `daisyui_component_syntax_expert`, including any remaining snippet batches it requests.
- After a substantive UI change, use `daisyui_quality_inspector` and follow its next action. Then inspect the diff and verify the rendered UI and relevant checks. Follow the tool's exception for copy-only or harmless localized fixes. If a required Blueprint tool is unavailable, report that limitation instead of substituting invented guidance.

## Validation

Run from `svelte-web-frontend/` and prefer the smallest applicable command:

- One-shot focused test: `pnpm test -- --run <test-file>`
- All tests once: `pnpm test -- --run`
- Type and Svelte checks: `pnpm check`
- Formatting and lint checks: `pnpm lint`
- Production build: `pnpm build`

Do not run the default `pnpm test` in automation when a one-shot run is intended; it starts watch mode.
