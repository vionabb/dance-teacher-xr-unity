---
date: 2026-10-03
tags: [research-workspace, hypotheses, prototype]
artifacts: []
---

# Hypothesis collection management

Viona found that the prototype conversation was absent from the hypothesis
index. She said the index is a good place for a conversation because she may
want to add hypotheses or move their statuses, and clarified that she also
wants to delete and rename hypotheses. This extends the original per-hypothesis
conversation into a collection-level management path.

The index now has its own local Codex conversation for explicit add, rename,
status, remove, and restore requests. The server validates structured actions
and writes them into the app-managed SQLite database with a verified snapshot.
For an existing hypothesis, a change must name its exact current title or URL
name and state the matching action and value. Discussion, hypotheticals, and
ambiguous or mismatched model actions leave the collection unchanged.
Removal is reversible: it hides the entry from the active index while retaining
its URL and audit trail. Renaming preserves the URL. Newly added questions
start as candidates with a draft overview in SQLite; the five seeded
hypotheses still read overview prose from their cited lab-log entries. This is
workflow management, not evidence that any hypothesis is supported.

The intended meaning of permanent deletion remains open. The current
reversible removal preserves research provenance and can be restored through
the index conversation. Citation and revision rules for new draft overviews
and saved findings also remain open before this becomes an authoritative
research record. No thesis result changed.

The focused collection, intent, and store tests passed (15 total). An isolated live
Codex CLI call returned a structured create action without writing to the
research database. The production build and desktop/mobile index checks
passed. The full frontend test run still has unrelated motion-metric fixture
failures and a DTW expectation failure; the repository-wide Svelte check
reports pre-existing diagnostics outside the changed files.
