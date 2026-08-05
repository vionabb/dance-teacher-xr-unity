# Motion Pipeline Data Directory

This directory contains persistent data assets used by the motion-pipeline project.
It is for committed assets only; private datasets and generated pipeline outputs
must be stored elsewhere. Use the untracked `temp/` directory for local outputs.

- `nao/`: contains assets for the `nao` motion-retargeting and teleoperation code, including the numbered test-pose image sequence. The shared robot URDF is stored at [`../../data/nao/urdf/`](../../data/nao/urdf/).
