# Agent Instructions

## Warm start

1. Read [documentation/repository-summary.md](documentation/repository-summary.md).
2. Use [documentation/README.md](documentation/README.md) to choose only the additional context relevant to the task.
3. Read the nearest scoped `AGENTS.md`, README, manifests, and configuration before editing a subproject.
4. Verify claims against current code. Thesis and paper documents explain research intent, but they are not implementation specifications.

Open [dance-teacher-xr-unity.code-workspace](dance-teacher-xr-unity.code-workspace) when working across the Python and Svelte projects. It preserves each subproject's language-server working directory and recommended extensions.

## Route work to the right subsystem

- Frontend, coaching flow, live evaluation, or motion metrics: [svelte-web-frontend/AGENTS.md](svelte-web-frontend/AGENTS.md)
- Offline pose/audio/complexity processing, bundle generation, or model fitting: [motion-pipeline/AGENTS.md](motion-pipeline/AGENTS.md)
- Research purpose and current maturity: [documentation/experimental-status.md](documentation/experimental-status.md)
- Architecture and cross-project interfaces: [documentation/technical-architecture.md](documentation/technical-architecture.md)
- Study data, generated artifacts, and cloud/local access: [documentation/dataset.md](documentation/dataset.md)
- Research history and rationale: [lab-log/README.md](lab-log/README.md), then the relevant dated entries
- Thesis and prior-study source material: [documentation/papers/thesis/index.md](documentation/papers/thesis/index.md) and [documentation/papers/chi2025/chi2025.md](documentation/papers/chi2025/chi2025.md)

Do not load the full thesis or CHI paper unless the task requires primary-source research context. Start with the repository summary and follow its targeted links.

## Repository-wide working rules

- Preserve the distinction between generated outputs, checked-in fixtures, and source data. Do not hand-edit generated artifacts unless the task explicitly targets them.
- Treat machine-local Google Drive paths and user-study videos as access-controlled data, not portable defaults.
- Keep raw and clean pose contracts explicit. Raw `pose2d` is required for image-space overlays; analytical consumers should normally use the appropriate clean representation.
- Check both sides of cross-project contracts when changing bundle schemas, metric exports, filenames, or artifact paths.
- Use the smallest existing validation command that covers a change. Subproject `AGENTS.md` files list the canonical commands.
- Update [documentation/repository-summary.md](documentation/repository-summary.md) only when repository structure, key workflows, artifact paths, or the practical importance of a subsystem changes.
- Update the owning canonical document rather than copying the same explanation into several files.

## Artifact archive

When the user asks to archive an artifact, place it under `artifact-archive/` using a `TIMESTAMP-label` name.

- A single artifact may be stored directly as `artifact-archive/TIMESTAMP-label.ext`.
- A plot or plot set belongs in `artifact-archive/TIMESTAMP-label/`.
- For plots, include a PDF, the data required to recreate it, and any relevant script, query, or command output.
- Prefer thesis-facing figures no larger than `6in` wide and `8in` high unless requested otherwise.
- If the user supplies commentary, store it as `commentary.md` beside the artifact; use a folder when needed.

## Lab log

Follow [lab-log/README.md](lab-log/README.md). Add or update a dated entry for substantive user-driven research work: decisions, analyses, findings, or changes in direction. Preserve the researcher's wording closely, record decisions and rationale, and copy referenced artifacts into `lab-log/assets/` before linking them.
