# Hypothesis workspace prototype handoff

Status: draft PR #414 on `codex/research-hypotheses-prototype`, based on merged
PR #411. The index and five source-backed pages have local Codex conversation
actions, append-only SQLite events, and snapshot logic. The index also supports
chat-driven add, rename, status changes, reversible removal, and restore. The
[original entry](2026-10-02-hypothesis-workspace-prototype.md) and
[collection update](2026-10-03-hypothesis-collection-management.md) record
Viona's requests and the claim boundary.

Decided: lab-log Markdown supplies the seeded overview prose; newly added
hypotheses have a draft SQLite overview until a source policy is settled.
Workflow status is distinct from evidence strength; source annotation records
remain read-only; the local panels cannot run analyses or create tools.
Removal hides and preserves history. The existing dev-loopback access boundary
remains in force.

Still open: Viona should review the five initial question wordings and choose
the first hypothesis-specific investigation. Define whether permanent deletion
is ever needed and how to cite/revise draft overviews. Before remote use,
add researcher authorization to every research page/action. Before relying on
saved findings as the authoritative record, define source citations and any
review/revision procedure. The current thesis chapter has no settled result to
incorporate from this interface work.

Validation: nine focused hypothesis/store tests, a production build, desktop
and 390-pixel loopback page checks, and an isolated live Codex structured
creation response passed. A prior detail conversation request set a
disposable hypothesis to `investigating` with verified snapshots. The full
frontend suite has unrelated motion-metric fixture failures and one existing
DTW expectation failure; repository-wide `svelte-check` reports 64 errors
outside the changed files.

Next action: review the initial hypothesis list with Viona and choose one
specific investigation tool and its evidence/acceptance contract.
