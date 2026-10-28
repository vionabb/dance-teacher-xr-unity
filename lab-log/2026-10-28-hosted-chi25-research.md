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

This is code preparation, not a live hosted release. The production migration,
account grant, transfer, direct-RLS checks, and signed-in browser acceptance
still require the correct production project credentials and deployment. The
existing local research SQLite and annotation workflow remain authoritative
for their current tasks. Additional materials, including reference videos,
human ratings, and reviewed poses, need a separate inventory and release
boundary before joining this hosted catalog. The next action is to review the
code and target project, then apply the migration and test a small paired
recording before uploading the full two-study corpus.

The AI Dance Coach chapter currently describes the learner web application and
pose evaluation, not a hosted research collection or its access policy. This
infrastructure work does not yet change an evaluated system claim, so the
chapter is unchanged. Revisit its system and data-method descriptions if the
hosted workspace later becomes part of the reported study workflow.
