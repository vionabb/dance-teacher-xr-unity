---
name: lab-log-entry
description: Create or update a dated entry in this repository's lab-log/ following its committed conventions, and keep lab-log/index.md's synopsis in sync. Use whenever substantive user-driven research work happened this session (a decision, finding, analysis, or change in research direction) and needs to be logged, or when the user explicitly asks to write up, log, or record something in the lab log.
---

# Lab log entry

Write or update a `lab-log/` entry for this project. The lab log is the
primary research-narrative record — read [../../lab-log/README.md](../../lab-log/README.md)
first if any of the rules below are unclear; it is the source of truth and
this skill only condenses it into an actionable checklist.

## When writing a new entry

1. Pick a slug: `YYYY-MM-DD-short-slug.md` (use today's date; a new slug for
   each distinct thread, even same-day).
2. Frontmatter: `date`, `tags` (free-form topic labels), `artifacts` (paths
   relative to `lab-log/`, `[]` if none).
3. Body sections, in this order, only including what applies:
   - **User intent** — the researcher's own phrasing, quoted as closely as
     possible. This is the single most important thing to preserve; do not
     paraphrase into neutral technical prose.
   - **Decisions** — one bullet per non-trivial decision, with brief rationale.
   - **Findings** — results, correlations, surprises, interpretations.
   - **Artifact references** — inline links to committed assets under
     `assets/` (see below).
   - **Open questions / next steps** — what remains unresolved, and what is
     blocked on the researcher's own judgment versus further agent work.

## Asset handling

Any plot, CSV, or other file the entry cites inline must be **copied into**
`lab-log/assets/YYYY-MM-DD-slug/`, not referenced from `temp/`,
`artifact-archive/`, or any other path outside the repo or inside a
`.gitignore`d directory. Copy only what the prose actually links to and
explains — not every file a run produced.

**Never commit a frame of a participant's video, in any form** — including a
pose overlay drawn on top of the original frame; the participant remains
identifiable. See `documentation/dataset.md`. Use synthetic frames, non-participant
reference frames, or skeleton-only renderings with no source image beneath
them instead.

## When updating an existing entry

Append new sections (Findings, Decisions, Open questions) to the existing
file rather than creating a duplicate slug for the same thread. Preserve
what was already written; add to it.

## Always: keep the index in sync

After writing or updating an entry, open [../../lab-log/index.md](../../lab-log/index.md):

- **New entry** → append a 1-4 line synopsis for it, in date order.
- **Material update to an existing entry** (a new decision, a finding that
  changes the conclusion, a resolved open question) → revise that entry's
  *existing* synopsis line so it still accurately reflects the entry's
  current content. Do not append a second synopsis for the same entry.
- A cosmetic fix (typo, wording) does not require an index update.
- Keep each synopsis to 1-4 lines; tighten rather than let it grow.
