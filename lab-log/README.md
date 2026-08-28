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

**Copy only what the entry actually cites inline.** An experiment run typically produces far more plots and data files than are relevant to the narrative. List and copy the specific ones the entry's prose links to and explains — not every output the run happened to write. If a future reader needs the full run output, point to its path under `temp/experiments/` (or the Drive `agent-output/` area per [`../documentation/dataset.md`](../documentation/dataset.md)) instead of duplicating it here. An asset that ends up in the `artifacts:` frontmatter list without a matching inline link in the entry body is a sign it was swept in rather than chosen.

**Never commit a frame of a participant's video, in any form.** This includes lightly processed renders such as a pose overlay drawn on top of the original frame — the participant is still identifiable in the image. See [`../documentation/dataset.md`](../documentation/dataset.md): raw participant videos and poses are access-controlled and must not enter a broader-access location, and `lab-log/assets/` is always committed to this git repository. If a finding genuinely needs a visual example of a skeleton over a person, use a synthetic or non-participant frame, or a skeleton-only rendering with no source image beneath it. Reference-video frames (the tutorial/dance videos being taught, not participant recordings) are lower sensitivity but are still Drive-owned source data — prefer linking to the source path over duplicating full frames, and keep any copied crop to what the point actually requires.

---

## Index page

[`index.md`](index.md) is a running, chronological index of every entry: one
1-4 line synopsis each, giving a high-level view of how the research direction
has evolved without requiring every entry to be opened. It is a summary aid,
not a substitute for reading the entry itself.

Keep it in sync with the entries:

- **New entry**: append a synopsis line for it, in date order.
- **Material update to an existing entry** (a new decision, a finding that
  changes the conclusion, a resolved open question — not a typo fix): revise
  that entry's existing synopsis so it still accurately reflects the entry's
  current content. Do not just append a second synopsis line for the same
  entry.
- Keep each synopsis to 1-4 lines. If it no longer fits that length after a
  revision, tighten it rather than letting it grow — the detail belongs in the
  entry, not the index.

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
