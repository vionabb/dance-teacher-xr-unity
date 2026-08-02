---
date: 2026-08-02
tags: [documentation, repository-structure, research-context]
artifacts: []
---

# Documentation consolidation

## User intent

> "i've reorganized the repo. i want to streamline project documentation"

The researcher asked that the code repository remain self-sufficient and approved replacing copied thesis/paper snapshots with a concise research-context summary.

## Decisions

- Moved the current research-maturity record into `documentation/project-state.md` so it is versioned with the code repository.
- Consolidated the code repository's entry points around the root README, documentation index, project state, technical architecture, dataset guide, and research context.
- Removed `documentation/papers/`; the dissertation and paper sources remain authoritative outside this repository.
- Added `documentation/research-context.md` to preserve the stable research lineage and claim boundaries needed for code work.
- Added a thesis `research-context/README.md` that distinguishes working material from archival material and leaves explicit confirmation placeholders where provenance or intended use is unclear.

## Findings

- The reorganization removed `documentation/experimental-status.md` while several code documents still linked to it.
- Copied markdown versions of the dissertation and paper created a second, drifting source for research context.
- The previous thesis guidance still referred to a proposal-era work-tracking folder that no longer exists.

## Verification

- Updated entry-point links and removed all active references to the deleted status and paper-snapshot documentation.
- Preserved the distinction between implemented, unvalidated, and future-facing coaching functionality in the new project-state and research-context documents.
