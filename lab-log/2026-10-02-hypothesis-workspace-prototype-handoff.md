# Hypothesis workspace prototype handoff

Status: local prototype on `codex/research-hypotheses-prototype`, rebased onto
`main` after PR #411 merged (`05f2927`). The hypothesis index, five source-backed pages, local
Codex conversation action, append-only SQLite events, and snapshot logic are
implemented. The dated [entry](2026-10-02-hypothesis-workspace-prototype.md)
records Viona's request and the claim boundary.

Decided: lab-log Markdown supplies the current overview prose; workflow status
is distinct from evidence strength; source annotation records remain read-only;
the local panel cannot run analyses or create tools. The existing dev-loopback
access boundary remains in force.

Still open: Viona should review the five initial question wordings and choose
the first hypothesis-specific investigation. Before remote use,
add researcher authorization to every research page/action. Before relying on
saved findings as the authoritative record, define source citations and any
review/revision procedure. The current thesis chapter has no settled result to
incorporate from this interface work.

Validation: focused hypothesis/store tests, a production build, loopback page
loads, and a live read-only Codex conversation passed. A conversation request
set a disposable hypothesis to `investigating`; the test database has the
status event and verified snapshots. Repository-wide `svelte-check` has
pre-existing errors outside the changed files.

Next action: review the initial hypothesis list with Viona and choose one
specific investigation tool and its evidence/acceptance contract.
