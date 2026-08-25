# Repository data

This directory contains small, committed assets shared across the project.
Private datasets and generated outputs belong in the ignored durable cache
subdirectories below. The root `data/` tree is shared by the code and thesis
workspace, so durable research inputs do not live inside a subproject's
`temp/` directory.

- [`test-fixtures/`](test-fixtures/): shared smoke-test inputs.
- `reference_motions/`: reference videos, raw poses, the committed `db.csv`, and
  generated reference pipeline outputs.
- `participant_motions/<study>/`: participant videos, raw poses, and generated
  processed poses. Current study directories are `chi25_study1` and
  `chi25_study2`.
  This is access-controlled research data and is never committed.
- [`nao/urdf/`](nao/urdf/): the NAO robot URDF and its referenced Xacro files.
- [`motion-pipeline/data/`](../motion-pipeline/data/): assets owned specifically
  by the motion-pipeline project.
