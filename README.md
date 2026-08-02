# Dance Teacher XR

Research code for automatically structuring short dance lessons from video and investigating the transition from a guided learning interface toward an adaptive virtual dance coach.

The active system has two primary subprojects:

- [motion-pipeline/](motion-pipeline/): offline Python processing for pose extraction, preprocessing, audio/complexity analysis, dance-tree generation, bundle export, and research analysis.
- [svelte-web-frontend/](svelte-web-frontend/): SvelteKit application for lesson delivery, webcam pose estimation, motion evaluation, feedback, and teaching-agent logic.

Unity, A-Frame, BVH, and NAO/retargeting code represent earlier or secondary investigations. They are not the main chapter-focused development path.

## Start here

- [Documentation index](documentation/README.md): choose the smallest relevant source of context.
- [Project state](documentation/project-state.md): implemented, unvalidated, and planned work.
- [Technical architecture](documentation/technical-architecture.md): system layers and cross-project contracts.
- [Dataset guide](documentation/dataset.md): data access, provenance, and publishing rules.
- [Research context](documentation/research-context.md): concise, self-contained study background and claim boundaries.
- [Agent instructions](AGENTS.md): operational guidance for repository work.

For setup and commands, use the README in the subproject you are changing. For cross-project work, open [dance-teacher-xr-unity.code-workspace](dance-teacher-xr-unity.code-workspace).
