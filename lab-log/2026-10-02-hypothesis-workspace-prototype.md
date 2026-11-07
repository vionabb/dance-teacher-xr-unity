---
date: 2026-10-02
tags: [research-workspace, hypotheses, research-provenance, prototype]
artifacts: []
---

# Hypothesis workspace prototype

Viona asked whether the consolidating research app could keep track of her
research hypotheses, with a route under `/research/hypothesis/<slug>` for each
one. She wants each page to fit its own question, share a hypothesis overview
with the lab log, store findings, and use a conversation with Codex as the main
way to manage status. Investigation tools can be added for particular
hypotheses when she directs the work. This prototype branches from the latest
PR #411 head, on top of the local research workspace direction and read model
in PRs #408 and #409.

The initial pages collect five candidate threads already present in the lab
log: error signals beyond landmark visibility; possible segment-level tracking
risk; whether reference difficulty signals participant trackability; metric
sensitivity to human pose corrections; and confidence-aware coaching. The
first four draw on the [visibility audit](2026-09-30-frame-visibility-audit.md),
[coverage audit](2026-10-01-layered-pose-quality-and-segment-coverage.md), and
[paired metric analysis](2026-10-02-manual-review-paired-metrics.md). The last
is a design and evaluation direction from the coverage entry. Existing
annotation summaries are selected, sparse, and sometimes revision-based; the
pages do not recast them as independent ground truth or established effects.

The overview on each page reads the cited lab-log Markdown at request time.
Append-only local SQLite records hold conversation turns, workflow statuses,
and explicitly saved findings, with a verified snapshot after each turn.
The local Codex CLI response is structured and read-only; the server checks
status values before storing them. The panel can plan a new analysis or tool,
but this slice does not implement that tool or run a hypothesis-specific job.
The routes remain development-only and loopback-only, following PR #411.

The focused hypothesis/store tests passed. The Vite production build passed
using the repository's three tracked LFS JSON/CSV build inputs and
placeholder build environment values. The existing repository-wide
`svelte-check` errors remain outside these files. A loopback browser check
loaded the index and detail page, sent a message through the Codex CLI, then
changed the test hypothesis status to `investigating` through the conversation.
The disposable test SQLite database contains that status event, four chat
messages, and two verified snapshots. The first assistant answer only saw the
short overview and missed the audit's numerical evidence; the prompt was
revised to include the full cited lab-log entry, after which it reported the
59% visibility-cutoff recall and high-visibility corrections with the sample
limitations. The temporary test data is not a research finding.

This is an interface and data-management experiment, not a technical
validation of any of these hypotheses. No thesis result or coaching claim is
changed. The [handoff](2026-10-02-hypothesis-workspace-prototype-handoff.md)
records the remaining acceptance work.
