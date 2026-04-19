# Agent Instructions

The canonical agent instructions for this repository live at:

- [/Users/viona/dev/dance-teacher-xr-unity/AGENTS.md](/Users/viona/dev/dance-teacher-xr-unity/AGENTS.md)

Agents working from `motion-pipeline/` as an independent workspace root should follow the parent repo instructions first.

This file adds `motion-pipeline`-specific guidance on top of the repo-wide instructions.

## Workflow Context

Check `README.md` and `.vscode/launch.json` when workflow details, canonical sample arguments, or expected artifact locations matter.

Pay attention to cross-project couplings that affect `motion-pipeline`, especially:

- frontend motion-metric exports consumed by `motion_extraction/scripts/fit_metric_linear_model.py`;
- bundle and media outputs exchanged with `svelte-web-frontend`;
- metric export and model-fitting interfaces.

If you change those interfaces or data flows, update `repository-summary.md` in the repo root when a future agent would otherwise be misled.

## Python Functions

When creating a new Python function, add a docstring.

When changing a Python function's parameters, return value, side effects, or intended usage, update its docstring in the same change so it stays accurate.

Keep function docstrings practical and concise. Prefer documenting:

- the function's purpose;
- key parameters when their meaning is not obvious from the signature;
- return values when they are non-trivial;
- important side effects, file outputs, or behavior that callers need to know.

If the intended contract of a function is unclear enough that a correct docstring cannot be written confidently, ask the user instead of guessing.
