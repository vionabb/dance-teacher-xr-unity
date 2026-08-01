# Dataset

## Overview

The dataset for this research project is stored in google drive.

The google drive is intended as the **source of truth** for dataset. Much of it is read-only.

The dataset is organized as such:

- root
  - `/archive`: read-only to agents. Where the user puts artifacts and files that are not relevant to the current state of the project.
  - `/agent-output`: full permissions to agent. A place for agent to store artifacts (such as charts, analysis-results) that should be persisted. Local runs will output to `artifact-archive` in the project -- be selective about what to copy into this folder, only persist results & artifacts that could make it into the paper, such as (but not limited to) fully-debugged analysis results. This folder should be organized by task -- give yourself (the agent) a name based on the initial prompt and create a date-stamped folder for your artifacts, then persist artifacts into a relevant subfolder. Example: `/agent-output/2026-04-13_motionpipeline-occlusion-analysis/` can then contain artifacts such as `2026-04-13T19-24-26-metric-fitting-output` and `2026-04-14T16-08-17-dancetree-pipeline-run`.
  - `processed-media-bundle`: read/write to agents. A location for the media bundle for consumption from the frontend. This is cached because it's resource intensive to recompute. Agents which are working on the web-frontend need to download this bundle to be able to serve the web resources. Agents which are developing motion preprocessing techniques can regenerate this bundle using the dancetree pipeline. The drive-persisted dataset version of the bundle should contain the latest *validated* media -- only overwrite this after testing it the frontend.
  - `referencevideos`: read-only to agents. The source videos of dances and other motions that we want to teach to the user.
  - `userstudydata`: read-only to agents. Data from previous user studies, such as the two conducted as part of the previous CHI 2025 paper. This data is available for use for technical validation of metrics & algorithms developed in this paper.  

## Accessing

The repository uses two access modes, but never an rclone mount:

- On a workstation, use the Google Drive desktop application's synchronized paths when `.github/localenvironment.json` is present. If that machine-specific file is absent, use the repository's standard local/rsync workflow where one exists.
- In cloud agents, use individual rclone operations with the `dataset`, `agentoutput`, and `processedmediabundle` remotes configured by `.github/setup-rclone.sh`.

Cloud-agent processing should always stage inputs and outputs in local working directories. Use `rclone copy dataset:<path> <local-dir>` for source data, run the pipeline against the local paths, and publish only completed work. Persist research artifacts with `rclone copy <local-dir> agentoutput:<task-path>`. Update the processed media bundle only after validation with an explicit `rclone sync <local-bundle> processedmediabundle:`; this is the one intentional operation that removes stale files from that cache.

The three remotes intentionally have different scopes and Drive roots:

- `dataset`: read-only access to the complete dataset root;
- `agentoutput`: read/write access to the nested `agent-output` folder;
- `processedmediabundle`: read/write access to the nested processed bundle folder.

The service-account JSON and folder IDs are supplied to cloud-agent setup as Agents secrets. They are materialized only into the runtime rclone configuration and must not be committed.

GitHub does not expose a documented environment marker that distinguishes a Copilot setup run from an ordinary Actions run. To make missing cloud credentials fail loudly, configure the non-secret repository Agents variable `RCLONE_REQUIRE_AUTH=1`. The setup script remains permissive when that variable is absent so normal push and pull-request validation cannot require unavailable Agents secrets.
