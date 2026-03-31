import { PoseLandmarkIds, type Pose2DPixelLandmarks, type Pose3DLandmarkFrame } from "$lib/webcam/mediapipe-utils";
import type { SingleTrackMetricTrack } from "../MotionMetric";

export function createEmptyPose2D(): Pose2DPixelLandmarks {
    return new Array(33).fill(0).map(() => ({
        x: 0,
        y: 0,
        dist_from_camera: 0,
        visibility: 1,
    }));
}

export function createEmptyPose3D(): Pose3DLandmarkFrame {
    return new Array(33).fill(0).map(() => ({
        x: 0,
        y: 0,
        z: 0,
        visibility: 1,
    }));
}

export function createTrackFromFrames(frames: Array<{
    timeSecs: number,
    pose2d?: Pose2DPixelLandmarks,
    pose3d?: Pose3DLandmarkFrame,
}>): SingleTrackMetricTrack {
    return {
        id: "synthetic",
        danceRelativeStem: "synthetic",
        segmentDescription: "synthetic",
        creationDate: "",
        videoFrameTimesInSecs: frames.map((frame) => frame.timeSecs),
        actualTimesInMs: frames.map((frame) => frame.timeSecs * 1000),
        trackDescription: "synthetic",
        poses2d: frames.map((frame) => frame.pose2d ?? createEmptyPose2D()),
        poses3d: frames.map((frame) => frame.pose3d ?? createEmptyPose3D()),
    };
}

export function setBilateralTorsoPose2D(pose: Pose2DPixelLandmarks) {
    pose[PoseLandmarkIds.leftShoulder] = { x: -1, y: 2, dist_from_camera: 0, visibility: 1 };
    pose[PoseLandmarkIds.rightShoulder] = { x: 1, y: 2, dist_from_camera: 0, visibility: 1 };
    pose[PoseLandmarkIds.leftHip] = { x: -1, y: 0, dist_from_camera: 0, visibility: 1 };
    pose[PoseLandmarkIds.rightHip] = { x: 1, y: 0, dist_from_camera: 0, visibility: 1 };
    pose[PoseLandmarkIds.leftElbow] = { x: -2, y: 2, dist_from_camera: 0, visibility: 1 };
    pose[PoseLandmarkIds.rightElbow] = { x: 2, y: 2, dist_from_camera: 0, visibility: 1 };
    pose[PoseLandmarkIds.leftWrist] = { x: -3, y: 2, dist_from_camera: 0, visibility: 1 };
    pose[PoseLandmarkIds.rightWrist] = { x: 3, y: 2, dist_from_camera: 0, visibility: 1 };
    pose[PoseLandmarkIds.leftKnee] = { x: -1, y: -2, dist_from_camera: 0, visibility: 1 };
    pose[PoseLandmarkIds.rightKnee] = { x: 1, y: -2, dist_from_camera: 0, visibility: 1 };
    pose[PoseLandmarkIds.leftAnkle] = { x: -1, y: -4, dist_from_camera: 0, visibility: 1 };
    pose[PoseLandmarkIds.rightAnkle] = { x: 1, y: -4, dist_from_camera: 0, visibility: 1 };
    return pose;
}

export function setBilateralTorsoPose3D(pose: Pose3DLandmarkFrame) {
    pose[PoseLandmarkIds.leftShoulder] = { x: -1, y: 2, z: 0, visibility: 1 };
    pose[PoseLandmarkIds.rightShoulder] = { x: 1, y: 2, z: 0, visibility: 1 };
    pose[PoseLandmarkIds.leftHip] = { x: -1, y: 0, z: 0, visibility: 1 };
    pose[PoseLandmarkIds.rightHip] = { x: 1, y: 0, z: 0, visibility: 1 };
    pose[PoseLandmarkIds.leftElbow] = { x: -2, y: 2, z: 0, visibility: 1 };
    pose[PoseLandmarkIds.rightElbow] = { x: 2, y: 2, z: 0, visibility: 1 };
    pose[PoseLandmarkIds.leftWrist] = { x: -3, y: 2, z: 0, visibility: 1 };
    pose[PoseLandmarkIds.rightWrist] = { x: 3, y: 2, z: 0, visibility: 1 };
    pose[PoseLandmarkIds.leftKnee] = { x: -1, y: -2, z: 0, visibility: 1 };
    pose[PoseLandmarkIds.rightKnee] = { x: 1, y: -2, z: 0, visibility: 1 };
    pose[PoseLandmarkIds.leftAnkle] = { x: -1, y: -4, z: 0, visibility: 1 };
    pose[PoseLandmarkIds.rightAnkle] = { x: 1, y: -4, z: 0, visibility: 1 };
    return pose;
}
