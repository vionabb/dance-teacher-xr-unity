---
date: 2026-07-30
tags: [motion-pipeline, google-drive, cloud-agents, research-artifacts]
artifacts: []
---

# Cloud-accessible dataset and artifact workflow

## User intent

"i want to allow the motion pipeline to use google-drive to process dataset files. the ultimate goal is to create a mechanism for cloud agents to access dataset files and write research artifact results -- the current local file paradigm doesn't work for this."

## Findings

- The DanceTree pipeline currently accepts only local filesystem paths for video input, pose-data input, temporary work, bundle output, and archived artifacts.
- It already supports timestamped local artifact-run folders through `--artifact_archive_root`, which can be staged and published without changing the analysis steps themselves.
- The repository contains an ignored local Google Drive service-account credential and a committed example credential filename; credential contents were not inspected or recorded.
- GitHub Copilot cloud agent exposes **Agents** secrets to its environment. Ordinary GitHub Actions, Codespaces, and Dependabot secrets are not made available to it. MCP-only secret delivery is a separate, explicitly configured option.
- The researcher has an existing read-only Drive dataset root with `reference-videos` and `user-performances-chi2025` subfolders, plus a distinct read/write agent-output root. The existing rclone configuration uses the same ignored service-account credential for both connections. Drive folder identifiers are intentionally not recorded in the repository.
- The chosen cloud workflow is rclone operations only: stage into local working directories, run the existing path-based pipeline, persist selected artifacts with `rclone copy`, and explicitly replace the latest processed-media cache only after validation.

## Proposed direction

- Add an explicit cloud adapter that downloads a versioned Drive input snapshot to a local temporary workspace, invokes the existing unmodified pipeline with local paths, then uploads a self-contained result/artifact folder to a designated Drive output folder.
- Keep source dataset, generated results, and credentials separated by Drive folder and permission boundary; use the existing distinct roots and a least-privilege service account shared only with the required folders.

## Next step

- Agree the Drive folder contract and credential injection contract before implementing the adapter.
- The three-remotes setup and explicit transfer CLI are now in place; the remaining integration work is to add pipeline-specific staging/publish invocation examples and validate the Copilot setup workflow in GitHub.

## Repository/data boundary and smoke testing (2026-08-05)

The testing and dataset cleanup clarified the boundary between what belongs in Git and what belongs in Drive:

- The full and private research dataset stays in Drive. It is not required for the deterministic motion-pipeline acceptance suite, so agents and CI should not download it merely to validate code changes.
- Git contains the pipeline code, documentation, small representative smoke inputs, and supporting assets that are needed to exercise the pipeline. The stage-first smoke corpus lives in [`data/test-fixtures/smoketest/`](../data/test-fixtures/smoketest/); its manifest allows the same corpus to support both acceptance testing and later metric iteration.
- `motion-pipeline/data/` is not an output sink. Generated pipeline results, temporary intermediate files, and exploratory metric outputs belong under the ignored `motion-pipeline/temp/` tree or in an explicitly chosen external artifact destination. This prevents local runs from silently changing the committed test corpus.
- A generated file may be added to the smoke corpus only through an explicit review and promotion step after the relevant contract has been validated. The promoted file then becomes a stable input fixture, rather than a generated output that tests overwrite.
- The smoke-test workflow is therefore the local/CI boundary for code-change validation, while Drive staging and artifact publication remain the boundary for full-dataset processing and research-result persistence.
