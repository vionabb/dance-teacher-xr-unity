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
