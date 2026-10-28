---
date: 2026-10-28
tags: [research-workspace, chi25, access-control, storage]
artifacts: []
---

Viona wants to host the research part of the existing production app behind
accounts with explicit authorization and to put study videos, pose files, and
related materials in Supabase Storage. She selected both CHI25 user studies,
named the first account privately as an administrative input, and wants to add
more accounts later. For the first milestone, participant videos and raw pose
files are read-only through the web app.

The implementation in `codex/hosted-chi25-research` starts with a separate
read-only `/research/studies` collection, private Storage, study-scoped
memberships, and a resumable verified import command. A local dry run paired
675 study 1 recordings and 1,081 study 2 recordings with canonical raw 2D
poses. No participant files were added to Git. The existing broad Storage
SELECT policy was identified as covering future private buckets and must be
replaced before the research bucket is used.

The production Supabase project was confirmed on Pro. On 2026-10-28 the
research migration was applied through its SQL editor as one transaction.
Verification showed a private bucket, empty membership/catalog tables, and
SELECT-only grants to authenticated clients. A pilot transfer uploaded one
video/raw-pose pair from each study. The full transfer then verified 675
Study 1 pairs and 1,081 Study 2 pairs by hash, with the same counts in the
production catalog. Direct anonymous requests to the catalog and a pilot
video were denied.

The migration was applied manually and its `20261028120000` version was then
recorded in Supabase migration history after verifying both tables' RLS and
all three research policies. The repository's older 2025 migration files are
not recorded in this production project's history, so a future general
`db push` still requires a separate history/schema audit. The first nominated
account does not yet exist in this project's Auth users; it must sign up before
viewer membership can be granted. An existing account nominated subsequently
received viewer membership for both studies, confirmed as two access rows.
Positive signed-in and ordinary-account tests, PR merge/deploy, and browser
acceptance remain open.
The existing local research SQLite and annotation workflow remain authoritative
for their current tasks. Additional materials, including reference videos,
human ratings, and reviewed poses, need a separate inventory and release
boundary before joining this hosted catalog.

The AI Dance Coach chapter currently describes the learner web application and
pose evaluation, not a hosted research collection or its access policy. This
infrastructure work does not yet change an evaluated system claim, so the
chapter is unchanged. Revisit its system and data-method descriptions if the
hosted workspace later becomes part of the reported study workflow.
