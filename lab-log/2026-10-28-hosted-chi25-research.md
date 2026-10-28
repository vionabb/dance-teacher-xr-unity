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
`db push` still requires a separate history/schema audit. An existing account
nominated subsequently received viewer membership for both studies, confirmed
as two access rows. The initially nominated account later registered and also
received viewer membership for both studies. Before that grant, a SQL-editor
check with its authenticated user ID and role showed zero visible memberships
and zero visible recordings under RLS; afterward it showed two memberships and
all 1,756 catalog records. The administrative credential used for the grant
was held only temporarily and cleared afterward.
On the PR preview, the authorized account opened both study catalogs and a
Study 2 video, and downloaded the paired raw pose CSV. The in-app browser's
on-page pose overlay initially reported `Failed to fetch` even though that
same CSV downloaded successfully. After the next preview deployment, the
overlay rendered for recordings from both studies and moved with Study 2
playback. Viona declined an additional Safari sign-in, so cross-browser
confirmation was not pursued.

Before the branch's landing fix, both the production app and PR preview sent
sign-ins to `/menu`, which returns 500; the production Supabase API reports
`public.motion_video` missing from its PostgREST schema cache. The branch now
routes accounts with research access through `/auth/landing` to
`/research/studies`, leaving learner accounts on their existing path. This
does not repair the missing learner-app table.
The redeployed preview sent the signed-in research account from
`/auth/landing` to `/research/studies`. Viona confirmed the newly registered
account could use the browser, and PR #428 was merged on 2026-10-28.

The existing local research SQLite and annotation workflow remain authoritative
for their current tasks. The next branch, `codex/chi25-materials-menu-fix`,
inventoried five CHI study reference videos in the Drive source, 1,570
human-rating rows, and the immutable first manual-review release.
The release supplies 19 Study 1, 25 Study 2, and four reference reviewed pose
segments; it does not supply complete reviewed poses for all recordings.
The branch adds a study-scoped read-only companion catalog and browser route.
Migration `20261028191953_hosted_chi25_materials` was applied in production;
the 55 source artifacts were SHA-256 checked against their frozen inputs and
the stored copies. Production catalog/object counts match exactly. An
authenticated nonmember saw zero companion rows and objects under RLS,
while a member saw 55 of each; `anon` has no catalog SELECT grant. No active
annotation database or participant video copy was added to Git.

The same branch addresses `/menu`: production still has zero rows in its old
`dancedemo` tables and no `motion_video` table. It redirects research members
to the hosted collection and treats the absent learner table as an empty
catalog while surfacing other database errors. It does not create learner
content. PR #429 was merged and its production deployment succeeded. Viona
accepted the current production release on 2026-10-28. She subsequently asked
to access the menu as a researcher too; that navigation change is being made
in `codex/tablet-research-hosting`.

The original full human-ratings CSV was found in this public repository's
history. Viona requested its removal from both the current tree and Git
history. The full 143,554-byte source was uploaded to a private, owner-only
Google Drive file named `chi25-humanratings-source.csv`; the two scoped
study exports were already hash-verified in private Supabase Storage. The
local source is staged at the ignored `local-data/chi25-humanratings-source.csv`
path, and the frontend importer and metric-fixture loader now read that path
or `HUMAN_RATINGS_PATH`. After PR #429 merged, the 25 affected branch heads
were rewritten from the file's introduction commit; branch-tip comparisons
showed only removal of that file, and remote heads matched the rewritten tips.
Viona inspected the CSV, stated that it contains no PII, and declined a GitHub
Support purge. The current repository excludes it; older GitHub PR refs may
retain it. No Support request was sent.

Viona now wants research analysis from her tablet at a cafe: the discrepancy
review desk, metric visualizers and a Codex conversation component on the
website. The new [hosted workspace plan](../documentation/hosted-research-workspace.md)
records the deployment boundary and sequence. Coordination with the discrepancy
chat produced a [dependency handoff](2026-10-28-discrepancy-hosting-handoff.md),
including the 20 missing legacy reference poses and the local/hosted ID mapping.
The menu change removes its research-only redirect and adds navigation in both
directions. Five focused menu/access tests, lint, a production build, and
type/Svelte checking passed (zero errors, 12 existing warnings). Synthetic-data
browser renders verified links and no horizontal overflow at 820×1180,
1180×820 and 390×844; this is not a new real-tablet acceptance claim. The
broader hosted authoring and agent work remains planned.

The AI Dance Coach chapter currently describes the learner web application and
pose evaluation, not a hosted research collection or its access policy. This
infrastructure work does not yet change an evaluated system claim, so the
chapter is unchanged. Revisit its system and data-method descriptions if the
hosted workspace later becomes part of the reported study workflow.
