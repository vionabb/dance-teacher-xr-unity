# Agent Instructions

The canonical agent instructions for this repository live at:

- [/Users/viona/dev/dance-teacher-xr-unity/AGENTS.md](/Users/viona/dev/dance-teacher-xr-unity/AGENTS.md)

Agents working from `svelte-web-frontend/` as an independent workspace root should follow the parent repo instructions first.

This file adds `svelte-web-frontend`-specific guidance on top of the repo-wide instructions.

## Workflow Context

Check `README.md` and `.vscode/launch.json` when workflow details, canonical commands, sync tasks, or local development setup matter.

Pay attention to cross-project couplings that affect `svelte-web-frontend`, especially:

- bundle data and media exported from `motion-pipeline`;
- motion-metric exports consumed by `motion-pipeline/motion_extraction/scripts/fit_metric_linear_model.py`;
- artifact paths or interfaces shared with the Python pipeline.

If you change those interfaces or data flows, update `repository-summary.md` in the repo root when a future agent would otherwise be misled.
