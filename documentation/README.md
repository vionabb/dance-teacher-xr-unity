# Documentation Guide

This directory is the canonical documentation hub for the standalone code repository. Load only the documents needed for the current task.

## Fast reading paths

| Need | Read |
| --- | --- |
| Understand the repository in a few minutes | [Repository README](../README.md) and [research context](research-context.md) |
| Change a cross-project interface or trace data flow | [Technical architecture](technical-architecture.md) |
| Check implementation maturity, limitations, or near-term work | [Project state](project-state.md) |
| Locate study data or use Google Drive/rclone safely | [Dataset and artifact guide](dataset.md) |
| Work on the Svelte app | [Frontend README](../svelte-web-frontend/README.md) and [frontend agent instructions](../svelte-web-frontend/AGENTS.md) |
| Work on Python processing or analysis | [Motion pipeline README](../motion-pipeline/README.md) and [pipeline agent instructions](../motion-pipeline/AGENTS.md) |
| Review the pose-preprocessing experiment | [Experiment report](preprocessing-cleanup-experiment-report.md), [short paper](preprocessing-cleanup-short-paper.md), and [dated lab log](../lab-log/2026-08-25-preprocessing-cleanup.md) |
| Understand why a research decision was made | [Lab log conventions](../lab-log/README.md), then search dated entries by tag |
| Understand research lineage and claim boundaries | [Research context](research-context.md) |

## Document ownership

- `technical-architecture.md` owns current implementation structure and cross-project contracts.
- `project-state.md` owns research maturity, known limitations, and next milestones.
- `dataset.md` owns data provenance, sensitivity, storage locations, and transfer/publishing rules.
- `research-context.md` owns the concise, self-contained research lineage and claim boundaries needed for code work.
- Subproject READMEs own environment setup and runnable commands.
- `AGENTS.md` files own operational instructions for coding agents.
- `lab-log/` owns dated rationale, findings, and changes in research direction.

The dissertation and published-paper sources are maintained elsewhere. Do not copy them here as mutable implementation documentation; use the research-context summary and confirm contested claims against the primary source when available.

When information changes, update the owning document and link to it elsewhere rather than duplicating the full explanation.
