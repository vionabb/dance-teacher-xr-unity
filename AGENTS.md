# Agent Instructions

## Warm start

1. Read [README.md](README.md) and [documentation/README.md](documentation/README.md).
2. Use the documentation index to choose only the additional context relevant to the task.
3. Read the nearest scoped `AGENTS.md`, README, manifests, and configuration before editing a subproject.
4. Verify claims against current code. Thesis and paper documents explain research intent, but they are not implementation specifications.

Open [dance-teacher-xr-unity.code-workspace](dance-teacher-xr-unity.code-workspace) when working across the Python and Svelte projects. It preserves each subproject's language-server working directory and recommended extensions.

## Route work to the right subsystem

- Frontend, coaching flow, live evaluation, or motion metrics: [svelte-web-frontend/AGENTS.md](svelte-web-frontend/AGENTS.md)
- Offline pose/audio/complexity processing, bundle generation, or model fitting: [motion-pipeline/AGENTS.md](motion-pipeline/AGENTS.md)
- Research purpose and current maturity: [documentation/project-state.md](documentation/project-state.md)
- Architecture and cross-project interfaces: [documentation/technical-architecture.md](documentation/technical-architecture.md)
- Study data, generated artifacts, and cloud/local access: [documentation/dataset.md](documentation/dataset.md)
- Research history and rationale: [lab-log/README.md](lab-log/README.md), then the relevant dated entries
- Research lineage and claim boundaries: [documentation/research-context.md](documentation/research-context.md)

Do not load the full thesis or CHI paper unless the task requires primary-source research context. Start with the repository summary and follow its targeted links.

## Repository-wide working rules

- Preserve the distinction between generated outputs, checked-in fixtures, and source data. Do not hand-edit generated artifacts unless the task explicitly targets them.
- Shared smoke fixtures are organized by stage under `data/test-fixtures/smoketest/`; files for one case share a stem across stage directories. Ordinary pipeline runs write only to temporary output directories. Promote a generated output into the fixture corpus only after validating it and recording its provenance in the smoke-test manifest.
- Treat machine-local Google Drive paths and user-study videos as access-controlled data, not portable defaults.
- Keep raw and clean pose contracts explicit. Raw `pose2d` is required for image-space overlays; analytical consumers should normally use the appropriate clean representation.
- Check both sides of cross-project contracts when changing bundle schemas, metric exports, filenames, or artifact paths.
- Use the smallest existing validation command that covers a change. Subproject `AGENTS.md` files list the canonical commands.
- Browser automation (e.g. the Playwright MCP server) against the Svelte frontend or the annotation tool is token-expensive: it returns the page's full accessibility tree on every action. Reserve it for exploratory, interactive work and local UI debugging. For CI/CD or any repeated run, generate a static Playwright test script (e.g. via `npx playwright codegen`) instead of driving a persistent MCP loop headlessly.
- On macOS, MediaPipe pose-extraction tests require a GUI-authorized local
  process because the pinned wheel creates a native NSOpenGL context. When a
  change affects extraction, run the focused wrapper in
  `motion-pipeline/script_invocations/run_pose_extraction_smoke.sh` with the
  required local permission; do not misclassify a sandbox-only OpenGL failure
  as an extraction regression.
- Update the owning canonical document rather than copying the same explanation into several files. Update [documentation/project-state.md](documentation/project-state.md) only when research maturity, known limitations, or priorities change.
- Update the owning canonical document rather than copying the same explanation into several files.

## Branching, worktrees, and commit cadence

Default to a dedicated branch for any non-trivial work — new features, multi-file changes, or anything likely to span more than one sitting — rather than committing directly to `main`. Use the harness's `EnterWorktree`/`ExitWorktree` tools (or `git worktree add`/`git worktree remove` outside Claude Code) so a long-running or multi-session piece of work gets its own isolated checkout and branch, separate from whatever else may be happening in the primary working directory. A single small, low-risk documentation or lab-log-only edit may still go straight to `main` in one scoped commit, matching this repo's existing practice for that class of change.

Commit at phase or milestone boundaries, not only once at the end: each commit should represent one coherent, individually-reviewable unit of work — one phase of a multi-phase plan, one bounded implementation brief in the sense used under "Experimental research loops" below — rather than a single large dump of unrelated changes. This matches the git-hygiene already visible throughout this repo's history: small scoped commits on feature branches, merged via pull request (`git log --merges` shows the existing `<owner-or-agent>/<slug>` branch-naming pattern this repo has always used).

Open a pull request rather than pushing directly to `main` for anything beyond a trivial doc fix, and never push or merge without the user's explicit go-ahead — creating a branch or worktree and committing to it locally does not by itself authorize publishing it.

That said, on an existing feature/worktree branch that is already pushed to origin (i.e. not `main`, and not the act of opening a new PR), commit and push routine incremental updates — including lab-log handoff-document updates — automatically, without pausing to ask each time; this is how sessions on this repo actually operate in practice. This does not change the rule above: opening a PR, merging, or pushing to `main` for the first time still always requires the user's explicit go-ahead.

When a piece of work is expected to span multiple sessions, record its state in a lab-log handoff document (see [lab-log/README.md](lab-log/README.md)'s "Handoff documents" section) so a future session — potentially on a different machine, in a different worktree — can resume it without re-deriving context from scratch.

## Experimental research loops

For metric and pose-data validation experiments, the parent agent is the
research lead: it owns the hypothesis, acceptance criterion, decisions,
progress updates, lab-log entry, and any later project-state or thesis edits.

- Delegate one bounded implementation brief at a time to
  `implementation_worker`; it is the only agent allowed to edit source code
  during that experiment.
- Use `metric_experimenter` to inspect the baseline, run the focused pipeline
  or metric analysis, and interpret results. It must not edit source code.
- Use `evidence_reviewer` for an independent, read-only validity review after
  meaningful results exist.
- Never run concurrent source writers. Give each experiment a unique output
  directory under `temp/experiments/` and preserve cached upstream inputs.
- Keep raw logs and stack traces in subagent threads; return concise evidence
  summaries with commands, parameters, provenance, artifact paths, findings,
  uncertainty, and a recommended decision.
- Do not treat technical correlation as coaching validity, and do not update
  `documentation/project-state.md` or the thesis until findings are settled.

### Session handoff

These experiments routinely span multiple agent sessions, sometimes with
different agents or tools in the research-lead role. Before ending a session
with unresolved experimental work, update the relevant dated lab-log entry
(create one if none exists yet for this thread) with a state a future agent
can resume from without replaying this session's reasoning:

- Exact commands already run, with their output paths under `temp/experiments/`.
- What is decided versus still open, and why.
- What is blocked and on whom — for example, work that requires Viona's own
  visual or perceptual judgment, which no agent should infer or fabricate on
  her behalf.
- The single next action, stated concretely enough to act on directly.

A later agent picking up the thread should read that lab-log entry (and the
artifacts it links) before re-deriving context from raw experiment output.

## Artifact archive

When the user asks to archive an artifact, place it under `artifact-archive/` using a `TIMESTAMP-label` name.

- A single artifact may be stored directly as `artifact-archive/TIMESTAMP-label.ext`.
- A plot or plot set belongs in `artifact-archive/TIMESTAMP-label/`.
- For plots, include a PDF, the data required to recreate it, and any relevant script, query, or command output.
- Prefer thesis-facing figures no larger than `6in` wide and `8in` high unless requested otherwise.
- If the user supplies commentary, store it as `commentary.md` beside the artifact; use a folder when needed.

## Lab log

Follow [lab-log/README.md](lab-log/README.md). Add or update a dated entry for substantive user-driven research work: decisions, analyses, findings, or changes in direction. Preserve the researcher's wording closely, record decisions and rationale, and copy referenced artifacts into `lab-log/assets/` before linking them. Whenever you add a new entry or materially update an existing one, also add or revise its 1-4 line synopsis in [lab-log/index.md](lab-log/index.md) so the index stays an accurate, short summary of the entry's current content.
