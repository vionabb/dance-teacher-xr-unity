# Lab Log

This directory is the running research log for the dance-teacher-xr project. It documents decisions, findings, and direction as development unfolds. Entries are intended to capture the research narrative — not just what was built, but why, and what was learned.

Entries here are the primary context source for agents picking up mid-project and for drafting the final thesis.

---

## Entry filename convention

```
YYYY-MM-DD-short-slug.md
```

Examples:
- `2026-07-29-lab-log-setup.md`
- `2026-08-03-metric-correlation-baseline.md`
- `2026-08-03-lesson-plan-structure.md`

Daily granularity is the default. Multiple slugs on the same day are fine when the threads are distinct.

---

## Frontmatter schema

Every entry begins with a YAML frontmatter block:

```yaml
---
date: YYYY-MM-DD
tags: [tag1, tag2]
artifacts: []
---
```

- `date`: ISO date of the entry
- `tags`: free-form topic labels (e.g. `metrics`, `chapter-7`, `lesson-plan`, `artifact`)
- `artifacts`: list of committed asset paths relative to this directory — e.g. `assets/2026-08-03-metric-correlation-baseline/fig1.pdf`. Leave empty `[]` if no assets.

---

## Asset copying rule

When an entry references a plot, CSV, or other artifact file, the file must be **copied into this directory** under `assets/YYYY-MM-DD-slug/` and referenced from there.

```
lab-log/
  assets/
    2026-08-03-metric-correlation-baseline/
      fig1.pdf
      data.csv
```

The asset copy in `lab-log/assets/` is always committed. Source files (e.g. in `artifact-archive/` or `svelte-web-frontend/artifacts/`) may or may not be committed — that is separate from the lab log.

**Never reference paths outside the repository or inside directories that are `.gitignore`d.**

---

## What goes in an entry

- **User intent**: capture the researcher's own phrasing as closely as possible — this is the most important thing to preserve
- **Decisions**: one bullet per non-trivial decision (algorithm choice, schema, parameter, direction change), with brief rationale
- **Findings**: results, correlations, surprises, interpretations
- **Artifact references**: inline links to committed assets under `assets/`
- **Open questions / next steps**: brief notes on what remains unresolved

Tone: faithful to the researcher's voice. Do not rewrite into neutral technical prose.

---

## Navigating entries for paper writing

- Scan filenames by date to reconstruct the timeline
- Use tags in frontmatter to find entries related to a specific topic (e.g. `grep -r "chapter-7" lab-log/`)
- Entries referencing key figures will list them in the `artifacts` frontmatter field
- The `assets/` directory holds committed copies of all referenced figures and data
