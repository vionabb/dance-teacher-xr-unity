# CHI25 study design: what we know

A record of how the CHI25 studies were set up, built from what Viona pastes in
over time and from checks against the hosted research tables. Per-dance and
per-clip facts live in [reference-clips.md](reference-clips.md); data locations
and access rules live in [dataset.md](dataset.md).

Each entry gives its source and date. Agent inferences are marked as inferred.

## Study 2: conditions and workflows

Source: a table Viona pasted on 2026-11-20 (a screenshot of her study document),
transcribed here. Each cell is a tutorial workflow, launched as
`https://dancetutorial.julien.studio?workflowId=<id>&participantId=PARTICIPANTID`.

| Condition (study wording) | Code label | Bartender | Last Christmas ("easier") | Pajama Party | Mad at Disney |
| --- | --- | --- | --- | --- | --- |
| Control (blur, undivided) | `control` | `863816e2-19eb-4459-9531-dd84ffaa2e03` | `e1d510c2-5bc5-4b00-9e97-f82139c7be35` | `0b78f385-a6be-41d7-8898-57f075f777ab` | `f77787d8-9af4-4358-98e0-4cf00813438e` |
| Label Test (labeled, undivided) | `emoji` | `4a58e38b-adce-42d8-bfbc-997d40084308` | `9047689f-b735-4e52-811b-7782ab08931d` | `5e5d43f1-4914-40bf-bf51-bd6f1d9c2013` | `0cb498c3-8cdb-4bd3-80c8-d61f38b0d833` |
| Segmentation Test (blur, divided) | `segmented` | `c096aef4-3cd9-415d-9ca1-f8709a7f770a` | `0e6c3e35-4ba3-4e76-8c4e-dd7e1c42e3df` | `786b141b-3b92-48a0-925f-602e5ac8c454` | `9cf99b96-0a03-4f76-ad94-666b4701e02b` |
| All Aids (labeled, divided) | `emojiandsegmented` | `d114fd87-11bb-4da5-a7c5-f17c55540a8f` | `6d42a03e-8de1-4daf-81c3-7bd7ea3e071c` | `c489d783-4f40-464d-87ed-e86fdacadece` | `568e88b5-0a90-4755-bef4-3132efd7ffa1` |

- **Code labels.** The mapping from study wording to code labels (`emoji` for
  labels, `segmented` for divided) is inferred: it is the pairing under which
  every recording's workflow id agrees with its stored condition (below).
- **Cell colours.** In the source table, cells are shaded in four colours, and
  each colour appears exactly once per row and once per column:
  - yellow: Bartender–Control, Last Christmas–Label, Pajama Party–Segmentation,
    Mad at Disney–All Aids;
  - green: Last Christmas–Control, Pajama Party–Label, Mad at Disney–Segmentation,
    Bartender–All Aids;
  - purple: Pajama Party–Control, Mad at Disney–Label, Bartender–Segmentation,
    Last Christmas–All Aids;
  - white: Mad at Disney–Control, Bartender–Label, Last Christmas–Segmentation,
    Pajama Party–All Aids.

  Inferred, not confirmed: the colours are the four counterbalancing groups (a
  Latin square), so each participant saw each dance once under a different
  condition.

### Check against the recordings (2026-11-20)

- All 1,049 Study 2 recordings in `research_analysis_recording` have a
  workflow id from this table. For every one of them, the table's condition
  matches the recording's stored condition. Observed.
- The human-ratings file disagrees for three dances. The Study 2 condition it
  gives each participant's bartender rating is the recording condition of
  their mad-at-disney. Its last-christmas condition is their bartender's, and
  its mad-at-disney condition is their last-christmas's. Pajama-party agrees.
  The rotation is consistent across all 36–37 participants per dance. A few
  ratings are labeled `unknown`. Observed.
- Conclusion: the recordings' conditions are right, and the ratings file's
  Study 2 condition column is rotated for bartender, last-christmas and
  mad-at-disney. This is inferred from the workflow table and still needs
  Viona's confirmation. Once confirmed, the rating join can match on participant,
  dance and clip, or on the workflow id, instead of the ratings file's
  condition. That adds about 438 rated segments to the review queue (see
  [reference-clips.md](reference-clips.md)).

## Study 1: conditions and workflows

Source: a table Viona pasted on 2026-11-20, transcribed here. The launch URL is
`https://dancetutorial.julien.studio/?workflowId=<id>&participantId=PARTICIPANTIDHERE`.

| Condition (study wording) | Code label | Last Christmas | Mad at Disney | Pajama Party |
| --- | --- | --- | --- | --- |
| Control (TikTok Tutorial) | `control` | `0079b262-7575-4ae7-a377-60e21070106e` | `e525302b-2740-4e73-aa37-170bd8ceb8d1` | `917fe4e1-9590-44eb-a541-1cef13e4f1ea` |
| Video Walkthrough | `skeleton` | `02883b27-c152-4415-ae7a-1cb4c5f086e5` | `44e54afd-19c0-4342-b753-fb4ab123aaad` | `102d5dd7-f1f4-447d-9c0c-6e10a8afc4c3` |
| Sheetmotion Walkthrough | `sheetmotion` | `ec8fbc4c-bf9d-404d-a4ab-c626e23a4d2e` | `d6ad5749-50d4-4cc7-99b5-6b9ddecebbf4` | `00388bd7-d313-4ce1-89e5-c88091f25357` |

- **Video Walkthrough is `skeleton` in code.** Inferred from the data: all 675
  Study 1 recordings have a workflow id from this table, and every one matches
  the dance and the stored condition under that mapping. Observed 2026-11-20.
- **Ratings.** Where the ratings file gives a real condition, it agrees with
  the recording. However, 100 eligible Study 1 segment ratings are not in the
  review queue. Observed 2026-11-20:
  - 84 are labeled `unknown` in the ratings file. Each has exactly one
    recording for that participant, dance and clip, so a join without the
    condition would recover them.
  - 16 have no recording for that participant, dance and clip. Six of them use
    the label `sheet` rather than `sheetmotion`.

## Human-rating sources and how they compare (2026-11-20)

On 2026-11-20 Viona shared the collaborator's rating files. They are
access-controlled participant data: keep them out of git and out of project
files. A cloud session kept its copies in the git-ignored `local-data/`.

- `user2_segment_ratings.xlsx`: Study 2 per-segment ratings, one sheet per
  dance and rater, three raters, on a 1–3 scale. Missing videos are marked with
  variants of `no_video`.
- `user2_rescale_auto.csv`: Study 2 per-performance means. Dances are letters:
  A = last-christmas, B = mad-at-disney, C = pajama-party, D = bartender. The
  first three letters were identified by matching the means against the segment
  sheets (97%, 84% and 95% agreement). D was inferred by elimination, since its
  means match the bartender sheets only 22% of the time. The file also has
  `lesson` order, `aid`/`emoji`/`seg` condition flags, idle time, and the
  rescaled and auto ratings.
- `user1_human_new_scale.csv`: Study 1 whole-performance human and auto
  ratings, with condition.

What the comparison shows (observed unless marked):

- **Study 1.** All 130 whole ratings match the hosted `research_human_rating`
  rows exactly, both the value and the condition.
- **Study 2: missing segments in the hosted copy.** The collaborator sheets
  include segment 1 for every dance. The hosted ratings have no segment 1 for
  bartender, mad-at-disney or pajama-party, so 120 rated segments are missing
  there.
- **Study 2: last-christmas segment 1 in the hosted copy uses one rater.** Its
  value is rater 1's score alone, from the "brianna" sheet, while the
  collaborator file has all three raters. Every other hosted Study 2 segment
  matches the mean of the three sheets.
- **Study 2: segment numbering.** Segment numbers line up between the
  collaborator file and the hosted copy, with no offset.
- **Study 2 conditions.** The collaborator's `aid`/`emoji`/`seg` flags agree
  with the hosted ratings' conditions (147 of 147). Both disagree with the
  recordings for bartender, last-christmas and mad-at-disney. The recordings'
  conditions come from workflow ids embedded in each video's file name, e.g.
  `user…-lastchristmas-emoji____workflowid-9047…`, and every one matches
  Viona's workflow table above.
- **Likely cause, inferred.** The rotation is exactly what results if the
  condition columns of the workflow table, in the order Bartender, Last
  Christmas, Pajama Party, Mad at Disney, were assigned to the letters A–D,
  which are actually last-christmas, mad-at-disney, pajama-party, bartender.
  Column 3 is pajama-party under both orders, which explains why pajama-party
  agrees.
- **Implication, inferred and not verified.** Any Study 2 analysis by
  condition that used the collaborator's flags, including the CHI25 paper's,
  may have mis-assigned conditions for three of the four dances. Viona should
  confirm before anything is re-analyzed or reported.
