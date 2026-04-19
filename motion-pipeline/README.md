# Motion Pipeline

This is a python module for performing a host of processing tasks on dance videos. This package performs tasks such as:

* Keeping track of a database of dance videos and their metadata (in `data/db.csv`).
* Running offline pose-estimation on videos using mediapipe, and storing the results in CSV for further analysis.
* Analyzing the audio of videos to extract signals (beats, bpm, cross-similarities, etc.) that may be useful for structuring teaching.
* Calculating metrics for dance complexity (e.g. plots of the accumulated complexity over time, typically base on kinematic features).
* Preparing data bundles for the web frontend (incorporates several components already mentioned)
  * Running pose-estimation
  * Running audio analysis, generating recurisve tree-like decompositions of dances
  * Calculating complexity metrics for the dance /
  * Incorporating complexity into the dance trees.
  * Creating symbolic links from the web frontend to the static media files (pose, holistic data, videos).
  * Packaging dance and dancetree information into JSON files for the web frontend.
* Inferring joint angles from 3D landmark data (mediapipe) and storing the results in BVH format for use in animation software.
* Retargeting motions present in dance videos for performance by the Nao robot

## Getting Started

While working on the motion-pipeline,your working directory should be in this folder (`motion-pipeline`).

1. Install python >= 3.8
1. Install ffmpeg (for video transcoding, audio extraction, etc.). Ensure it's available in commmand line (added to PATH).
1. Create a virtual environment: `python -m venv .env`
1. Activate the virtual environment: `source .env/bin/activate` (or similar, depending on your shell).active
1. Install dependencies: `pip install -r requirements.txt`
1. If you're on windows, ensure that Developer Mode is enabled (so that symlinks can be created).

## Running the pipeline

There are numerous tasks that can be run within this module, and they're all defined in the VSCode launch file (`.vscode/launch.json`). To run a script, select it from the dropdown in the top left of the VSCode window, and click the green play button.
* The single most important task is `Run DanceTree Pipeline`. This consolidates several processing steps into a single script, making it easy to run the entire pipeline, and bundles the output for use for the frontend. Data is cached along the way, meaning that the pipeline will run faster the 2nd and subsequent times it's run (you can force a full re-run by altering the `launch.json` arguments for this task, or by deleting the temp folders).
* Pipeline artifact capture is optional. Set `--artifact_archive_root` on the main pipeline to create one timestamped run folder under `artifact-archive/`; by default, each step writes artifacts unless its corresponding `--suppress_*_artifacts` flag is set.
* Holistic debug frames are no longer controlled by a boolean. Use `--holistic_debug_frames_dir` to enable them, and optionally repeat `--debug_frame_whitelist` to limit which input files emit frames. If no whitelist is provided, all files match.
* Complexity plotting can be filtered independently from complexity calculation. Use repeated `--complexity_plot_whitelist` on the main pipeline or `--plot_whitelist` on `calculate_cumulative_complexity` to match relative stems such as `study2/*`; unmatched files still contribute to normalization and CSV outputs, but are omitted from generated plots.

## Video -> BVH Process

To get a usable 3d motion animation from video, we process mediapipe output with existing knowledge of human skeleton and joints to generate a bvh file.

The process is as follows:
1. Using mediapipe, get world-frame 3d pose coordinates and normalized 3d hand coordinates from the video.
1. Recenter and re-orient the pose so that it's centered at the origin.
    * Alternative: use joint rotations directly at this point (would lose some 3d positional accuracy).
1. Using knowledge of human hand anatomy, merge the hand coordinates with the 3d pose coordinates to get fully defined joint positions for the entire skeleton. 
1. Using knowledge of joint DOF, infer joint angles from the joint positions.
1. Generate a bvh file

## BVH Writer

Documentation for the BVH format: <https://research.cs.wisc.edu/graphics/Courses/cs-838-1999/Jeff/BVH.html>

In BVH, the following relationship holds between child $j$ and parent $P(j)$ - the position of joint $j$ is then given by:

$$pos_j = R_{P(j)}offset_j + pos_{P(j)}$$

Therefore, the orientation of a joint affects the position of it's children.

## NAO Teleoperation

1. Start listener from the nao6-experiments repo.
1. Select Nao Teleoperation debug config and run it.
    * On windows, you can see available webcams in settings > cameras. The indexes should line up with what's visible there. Change the webcam index in the launch file.

## USEFUL SH COMMANDS

```sh
for file in ./*; do ffmpeg -i $file -vcodec copy -acodec copy -tag:v hvc1 ./redone/$file -y; done
```
