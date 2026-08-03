# Motion Pipeline Data Directory

This directory contains persistent data assets used by the motion-pipeline project.

- `nao/`: contains assets for the `nao` motion-retargeting and teleoperation code. This includes picture representations of test poses and a urdf description of the robot (used for visualization of retargeted poses).
- `smoketest/`: This directory contains files used for smoke testing of the motion pipeline. It contains artifacts for each stage of the pipeline which should be updated when the contract between the stages change. The output of each stages' smoke test, and of the smoke test of the pipeline as a whole, should be directed to a untracked / temporary directory