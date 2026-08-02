# Documentation Guide

This directory is the canonical documentation hub for coding and research agents. Start with the repository map, then load only the documents needed for the current task.

## Fast reading paths

| Need | Read |
| --- | --- |
| Understand the repository in a few minutes | [Repository summary](repository-summary.md) |
| Change a cross-project interface or trace data flow | [Technical architecture](technical-architecture.md) |
| Understand what is implemented, exploratory, or planned | [Experimental status](experimental-status.md) |
| Locate study data or use Google Drive/rclone safely | [Dataset and artifact guide](dataset.md) |
| Work on the Svelte app | [Frontend README](../svelte-web-frontend/README.md) and [frontend agent instructions](../svelte-web-frontend/AGENTS.md) |
| Work on Python processing or analysis | [Motion pipeline README](../motion-pipeline/README.md) and [pipeline agent instructions](../motion-pipeline/AGENTS.md) |
| Understand why a research decision was made | [Lab log conventions](../lab-log/README.md), then search dated entries by tag |
| Consult the current thesis source | [Thesis index](papers/thesis/index.md) |
| Consult the earlier CHI dance-learning study | [CHI 2025 paper](papers/chi2025/chi2025.md) |

## Document ownership

- `repository-summary.md` is a stable map: purpose, subsystem boundaries, critical paths, and warm-start routing.
- `technical-architecture.md` owns current implementation structure and cross-project contracts.
- `experimental-status.md` owns research maturity, known limitations, and next milestones.
- `dataset.md` owns data provenance, sensitivity, storage locations, and transfer/publishing rules.
- Subproject READMEs own environment setup and runnable commands.
- `AGENTS.md` files own operational instructions for coding agents.
- `lab-log/` owns dated rationale, findings, and changes in research direction.
- `papers/` contains primary research sources; it should not be treated as current implementation documentation.

When information changes, update the owning document and link to it elsewhere rather than duplicating the full explanation.

## Thesis chapters

The published dance-learning work is [chapter 6](papers/thesis/chapters/06-enhancing-the-educational-potential-of-tiktok-dance-videos.md), and the adaptive-coaching work is [chapter 7](papers/thesis/chapters/07-toward-an-adaptive-virtual-dance-coach.md). Prefer linked chapter titles when a durable reference benefits from more context than the number alone.
