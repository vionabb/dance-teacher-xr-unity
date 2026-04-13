# Agent Instructions

Start with [.repository-summary.md](/Users/viona/dev/dance-teacher-xr-unity/.repository-summary.md) for fast repo context.

Use it as a map, not as the sole source of truth:

- verify any area you plan to modify by reading the current code and config files;
- check project README files and the relevant `.vscode/launch.json` entries when workflow details or sample arguments matter;
- pay special attention to cross-project couplings, especially the frontend motion-metric exports consumed by `motion-pipeline`.

Keep `.repository-summary.md` up to date when you make changes that alter:

- repository structure,
- key workflows or launch configurations,
- generated artifact paths,
- bundle/data flow between `motion-pipeline` and `svelte-web-frontend`,
- metric export/model-fitting interfaces,
- or the practical importance of major subprojects.

Do not rewrite the summary for trivial local edits. Update it when a future agent would otherwise be misled.
