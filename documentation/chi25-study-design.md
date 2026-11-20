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
