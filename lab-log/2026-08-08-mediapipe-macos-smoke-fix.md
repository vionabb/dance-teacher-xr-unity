---
date: 2026-08-08
tags: [motion-pipeline, mediapipe, macos, smoke-tests]
artifacts: []
---

# MediaPipe macOS smoke-gate fix

## Findings

- MediaPipe 1.0.0's `HolisticLandmarker` aborts during graph creation on this
  macOS environment with `DrishtiMetalHelper` reporting that its graph service
  is unavailable. Selecting the CPU delegate and setting
  `MEDIAPIPE_DISABLE_GPU=1` did not prevent that native path.
- MediaPipe 0.10.21 remains Tasks-API compatible and creates the Holistic task
  successfully. Its task detector still aborts on an empty output packet for
  the smoke input, so it is not safe to use for this batch extractor yet.
- The 0.10.21 `mediapipe.python.solutions.holistic.Holistic` implementation
  completes the pose-extraction and full-pipeline smoke tests in the desktop
  execution context. Its graph uses the macOS OpenGL service even though the
  inference graph is the CPU variant.
- A direct 0.10.21 Tasks GPU probe successfully created the Metal delegate but
  then aborted on an empty landmark packet. GPU inference is therefore not
  enabled by default until a task-runtime/model combination handles missing
  landmarks safely.

## Decision

Pin the motion pipeline to `mediapipe==0.10.21`, preserve the Tasks-compatible
runtime and helper APIs, and use the stable Holistic batch path for extraction.
The full smoke gate passes 11/11 in the desktop execution context. GPU support
remains an explicit follow-up rather than a default that can terminate a
research-data run.
