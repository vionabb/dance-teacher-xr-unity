# NAO Teleoperation Module Report

## Scope
This report describes how the NAO teleoperation module in this repository works at runtime, from video input to outbound NAO joint commands.

Primary module path:
- `motion_extraction/teleoperation`

Core files:
- `motion_extraction/teleoperation/__main__.py`
- `motion_extraction/teleoperation/teleoperation.py`
- `motion_extraction/teleoperation/NaoTeleoperationStreamer.py`
- `motion_extraction/motion_output_provider/NaoTrajectoryOutputProvider.py`

---

## High-Level Architecture
The module is structured as a real-time pipeline:

1. Capture frame from webcam or video/image sequence.
1. Run MediaPipe Pose Landmarker in VIDEO mode.
1. Convert pose output into the project "holistic row" format.
1. Convert human pose to humanoid skeleton transforms.
1. Retarget skeleton transforms to NAO upper-body joint angles.
1. Clamp to joint limits and apply per-joint velocity limiting.
1. Send resulting command packet over UDP to registered listeners.
1. Optionally visualize intermediate and final states in simulation mode.

---

## Entrypoint and Modes
Entrypoint is `python -m motion_extraction.teleoperation` (implemented in `__main__.py`).

Supported flags in the current implementation:
- `-sim` or `--simulation`: enables local visualization windows/plots and disables network listener registration.
- `-i` or `--input`: input source; default `webcam`. Can also be a media path / sequence pattern.
- `--listener_ip`: UDP destination host, default `localhost`.
- `--listener_port`: UDP destination port, default `8080`.
- `-br` or `--break_frame`: one or more frame numbers where plotting pauses.
- `--webcam-index`: intended camera index selector.

Behavior by mode:
- Normal mode (no `-sim`): creates a `NaoTeleoperationStreamer`, registers one UDP listener, shows webcam overlay window.
- Simulation mode (`-sim`): opens Matplotlib panels for live image, MediaPipe 3D pose, NAO URDF pose, and internal skeleton view; does not send UDP unless listeners are manually registered in code.

---

## Real-Time Pose Stream (`teleoperation.py`)
`stream_realtime(...)` is the loop orchestrator.

### Input and frame handling
- If `src_media == 'webcam'`, opens OpenCV capture and requests 1280x720.
- If not webcam, resolves provided path and opens it as a video/image sequence source.
- For webcam mode, frame is horizontally flipped (selfie view).

### MediaPipe setup
- Ensures `pose_landmarker_heavy.task` exists; downloads from the MediaPipe model URL if missing.
- Builds `PoseLandmarkerOptions` in VIDEO running mode.
- Uses timestamp from `time.monotonic_ns()` converted to ms for `detect_for_video`.

### Per-frame processing
For each successful frame:
- Convert BGR -> RGB for MediaPipe.
- Run pose inference.
- Draw normalized landmarks onto display image.
- Convert inference output into a "holistic" row (`transform_to_holistic_csvrow`).
- If world landmarks are absent, invoke callback with `None`.
- Otherwise invoke callback with the pandas Series containing pose/world landmark fields.

### Visualization and loop control
- Optional OpenCV window (`MediaPipe Pose`) for webcam feed.
- Optional 3D pose plotting on provided axis.
- Optional breakpoint frame pauses.
- Exits on keypress or stream end.

---

## Teleoperation Adapter (`NaoTeleoperationStreamer.py`)
`NaoTeleoperationStreamer` bridges pose rows to outbound robot-control packets.

### Key responsibilities
- Hold `NaoTrajectoryOutputProvider` instance (the NAO retargeting logic).
- Maintain UDP socket and listener list.
- Optionally maintain URDF transform manager for visualization.
- Process each frame callback from `stream_realtime`.

### Frame callback flow (`on_pose`)
Given a non-`None` holistic row:
1. Build `HumanoidPositionSkeleton` via `HumanoidPositionSkeleton.from_mp_pose(...)`.
1. Get skeleton transforms (`skel.get_transforms(...)`).
1. Compute NAO joint commands with `NaoTrajectoryOutputProvider.process_frame(...)`.
1. Forward JSON command payload via UDP to all listeners.
1. If enabled, update URDF and skeleton Matplotlib visualizations.

If the pose row is `None`, callback returns immediately without sending updates.

### Network output
- Transport: UDP (`AF_INET`, `SOCK_DGRAM`), non-blocking socket.
- Payload: UTF-8 JSON object, produced from a pandas Series of joint values.
- One datagram per frame per registered listener.

---

## NAO Joint Retargeting Logic (`NaoTrajectoryOutputProvider.py`)
This class converts humanoid transforms into NAO motor commands.

### Current command surface
The active `NaoMotor` enum contains upper-body + head joints:
- `HeadYaw`, `HeadPitch`
- `LShoulderPitch`, `LShoulderRoll`, `LElbowYaw`, `LElbowRoll`
- `RShoulderPitch`, `RShoulderRoll`, `RElbowYaw`, `RElbowRoll`

Leg and wrist/hand joints are present as commented placeholders and are not currently emitted.

### Angle derivation approach
- Shoulders: computed from upper-arm direction vectors in chest-relative frames.
- Elbows: computed using vector projection/rejection and axis-angle relationships between upper-arm and lower-arm directions.
- Head: derived from head-to-chest gaze direction.

### Safety constraints
Each motor applies:
- Joint position clamping using hard min/max ranges.
- Velocity limiting per frame based on `velocity_max` with a 10% safety buffer and assumed FPS=30.

### Stateful smoothing behavior
- The provider stores previously emitted values in an internal dataframe.
- Velocity limiting compares current target against last emitted command.
- In teleoperation mode, `record_to_dataframe=False` is used, so this smoothing history may not evolve as expected in live use. This is a noteworthy behavior to validate for production teleop.

---

## Coordinate Conventions
When constructing the holistic row (`transform_to_holistic_csvrow`):
- MediaPipe world coordinates are remapped as:
  - `x <- x`
  - `y <- -y`
  - `z <- -z`

This aligns the internal convention to "y up" and "z forward toward camera" for downstream skeleton/retargeting logic.

---

## Typical Runtime Data Flow (Concrete)
1. Open webcam.
1. Infer 3D pose world landmarks with MediaPipe heavy pose model.
1. Build holistic pandas Series with named landmark fields.
1. Convert to humanoid skeleton object.
1. Extract transforms and compute 10 NAO joint angles.
1. Clamp and velocity-limit per joint.
1. Serialize to JSON and transmit to listener endpoint (for example `localhost:8080`).

Example outgoing packet shape:

```json
{
  "HeadYaw": 0.12,
  "HeadPitch": -0.08,
  "LShoulderPitch": 1.01,
  "LShoulderRoll": 0.17,
  "LElbowYaw": -1.22,
  "LElbowRoll": -0.41,
  "RShoulderPitch": 0.94,
  "RShoulderRoll": -0.15,
  "RElbowYaw": 1.30,
  "RElbowRoll": 0.37
}
```

---

## Known Constraints and Implementation Notes
1. `--webcam-index` is parsed but not currently applied in `stream_realtime`; webcam capture is opened with index `0`.
1. Listener registration is skipped in simulation mode by default.
1. UDP transport is connectionless and non-blocking, so packet loss/reordering is possible.
1. The model file is downloaded on demand if absent, which requires network access on first run.
1. The emitted control set is upper-body only in current code.
1. Real-time loop has no explicit frame pacing; effective rate is driven by capture + inference speed.

---

## How to Run (Current Project Convention)
From repository root:

```bash
python -m motion_extraction.teleoperation --input=webcam --listener_ip=localhost --listener_port=8080
```

Simulation mode (visual debug):

```bash
python -m motion_extraction.teleoperation -sim -i="data/pose-test-photos/nao-test-%d.jpg" -br 8
```

The repository also includes corresponding VS Code launch configurations named:
- `Nao Teleoperation`
- `Nao Teleoperation (Simulation)`

---

## Running From a Pre-Defined Dance File
The teleoperation module does not have a separate choreography interpreter. Instead, a pre-defined dance is supplied as the `--input` source, and the same MediaPipe-to-NAO pipeline replays that source frame by frame.

### Supported source shapes
The `stream_realtime(...)` function accepts either:
- `webcam`, which captures live video from a camera.
- A path to a video file.
- A path pattern for an image sequence, such as `data/pose-test-photos/nao-test-%d.jpg`.

### What happens for file-based playback
When `--input` points to a file or image pattern:
1. OpenCV reads the source frames instead of a live camera.
1. Each frame is passed through MediaPipe Pose Landmarker in VIDEO mode.
1. The resulting pose is converted into the same holistic row used in live teleoperation.
1. The pose is retargeted into NAO joint commands.
1. The generated joint packet is sent to the configured UDP listener.

### Example: bundled pose test sequence
The repository includes a numbered image sequence in [data/pose-test-photos](data/pose-test-photos) that can be replayed with the simulation launch config. The pattern uses Python-style frame substitution, so OpenCV can advance through `nao-test-1.jpg`, `nao-test-2.jpg`, and so on.

In practice, this means a "dance file" is just the prerecorded frame source that drives the teleoperation loop. The downstream NAO output is still computed live, but from the prerecorded input instead of from a webcam.

---

## Dependencies Involved in This Module
- OpenCV (`cv2`) for capture and display.
- MediaPipe Tasks vision Pose Landmarker for real-time pose inference.
- pandas / numpy for tabular and vector operations.
- pytransform3d for axis-angle / vector geometry during retargeting.
- matplotlib for optional simulation/debug visualization.
- Python `socket` + `json` for UDP command streaming.

---

## Summary
The NAO teleoperation module is a real-time retargeting bridge from human pose estimation to NAO joint commands. It combines MediaPipe-based 3D pose extraction with a custom skeleton-to-NAO mapping pipeline and streams per-frame JSON commands over UDP, with optional local simulation visualizations for debugging and calibration.
