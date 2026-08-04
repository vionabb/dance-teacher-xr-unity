# Motion Pipeline Data Directory

This directory contains persistent data assets used by the motion-pipeline project.

- `nao/`: contains assets for the `nao` motion-retargeting and teleoperation code. This includes picture representations of test poses and a urdf description of the robot (used for visualization of retargeted poses).
- `smoketest/`: committed, small inputs for smoke testing the motion pipeline without the full dataset. Its hierarchy is organized by stage; files for the same smoke-test case share a filename stem across stage directories. See [`smoketest/README.md`](smoketest/README.md) and [`smoketest/manifest.json`](smoketest/manifest.json). Generated outputs must go to the untracked `temp/` directory. When a stage contract changes, validate generated outputs first, then explicitly promote reviewed files into the appropriate stage directory.
