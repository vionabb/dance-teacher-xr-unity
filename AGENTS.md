# Agent Instructions

Start with [repository-summary.md](/Users/viona/dev/dance-teacher-xr-unity/repository-summary.md) for fast repo context.

Use it as a map, not as the sole source of truth:

- verify any area you plan to modify by reading the current code and config files;
- check the relevant local README files and configuration before relying on remembered workflows.

Keep `repository-summary.md` up to date when you make changes that alter:

- repository structure,
- key workflows or launch configurations,
- generated artifact paths,
- or the practical importance of major subprojects.

Do not rewrite the summary for trivial local edits. Update it when a future agent would otherwise be misled.

## Artifact Archive

When the user asks to archive an artifact, place it under `artifact-archive/`.

Naming convention:

- use `TIMESTAMP-label` names;
- if the artifact is a single file, save it directly as a file at `artifact-archive/TIMESTAMP-label.ext`;
- if the artifact is a plot or plot set, create a folder at `artifact-archive/TIMESTAMP-label/`.

For archived plots:

- save the rendered plot as PDF;
- save the underlying data needed to recreate the plot;
- if relevant, also save any script, query, or command output needed to replot for a different paper template or target.
- for thesis-facing artifacts, prefer figures no larger than `6in` wide and `8in` high unless the user explicitly asks for a different format.

Optional commentary:

- you may ask the user whether they want to provide commentary for the archive entry;
- if provided, save it as `commentary.md` inside the artifact folder;
- if the archived artifact is otherwise a single file and commentary is provided, use a folder so `commentary.md` can live alongside the artifact.

## Lab Log

The lab log lives at `lab-log/`. Read `lab-log/README.md` for the full conventions. Key rules:

**When to write:** append to or create a lab log entry for any substantive user-driven session — one where a decision is made, an analysis is run, a finding is reached, or a direction changes. Skip trivial mechanical tasks (e.g. renaming a variable, fixing a typo).

**Entry files:** `lab-log/YYYY-MM-DD-short-slug.md`. Daily granularity is the default; create a new slug on the same day when threads are clearly distinct. Each file starts with YAML frontmatter (`date`, `tags`, `artifacts`).

**What to write:**
1. The researcher's prompting language — verbatim or very close. This is the most important thing. Do not sanitize into neutral technical prose.
2. Decisions made, one bullet each, with brief rationale.
3. Findings, results, or interpretations — especially surprises.
4. References to any committed artifact files.

**Artifacts:** if an entry references a figure, CSV, or other file, copy it to `lab-log/assets/YYYY-MM-DD-slug/` first, then link it from the entry. Never reference paths outside the repo or inside `.gitignore`d directories. The `artifacts` frontmatter field should list every committed asset the entry uses.

**Relationship to `artifact-archive/`:** `artifact-archive/` is a user-triggered timestamped snapshot; `lab-log/assets/` is the narrative copy that supports a specific entry. An important artifact may appear in both — that is fine.

**Why this matters:** entries give future agents the "why" behind the current state of the code and data. They also make it easier to locate key figures and reconstruct the research narrative when drafting the thesis (Chapters 4 and 5).
