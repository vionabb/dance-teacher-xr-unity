

import type { PoseReferenceData } from "$lib/data/dances-store";
import type { Pose2DPixelLandmarks, Pose3DLandmarkFrame } from "$lib/webcam/mediapipe-utils";
import UserDanceEvaluator from "./UserDanceEvaluator";
import type { PerformanceEvaluationTrack } from "./UserEvaluationTrackRecorder";
import Qijia2DPoseEvaluationMetric from "./motionmetrics/Qijia2DPoseEvaluationMetric";
import Skeleton3DVectorAngleEvaluationMetric from "./motionmetrics/Skeleton3DVectorAngleEvaluationMetric";
import BasicInfoSummaryMetric from "./motionmetrics/BasicInfoSummaryMetric";
import KinematicErrorEvaluationMetric from "./motionmetrics/KinematicErrorEvaluationMetric";

import frontendPerformanceHistory from "./frontendPerformanceHistory";
import TemporalAlignmentEvaluationMetric from "./motionmetrics/TemporalAlignmentEvaluationMetric";
import Skeleton3DAngleDistanceDTWEvaluationMetric from "./motionmetrics/Skeleton3DAngleDistanceDTWEvaluationMetric";

export const FrontendLiveMetrics = Object.freeze({
    qijia2DPoseEvaluation: new Qijia2DPoseEvaluationMetric(),
    skeleton3DVectorAngleEvaluation: new Skeleton3DVectorAngleEvaluationMetric(),
});

export const FrontendSummaryMetrics = Object.freeze({
    basicInfo: new BasicInfoSummaryMetric(),
    kinematicErrorEvaluation: new KinematicErrorEvaluationMetric(),
    temporalAlignmentEvaluation: new TemporalAlignmentEvaluationMetric(),
    // skeleton3DAngleDistanceDTWEvaluation: new Skeleton3DAngleDistanceDTWEvaluationMetric(),
});

export const FrontendMetrics = Object.freeze({
    ...FrontendLiveMetrics,
    ...FrontendSummaryMetrics
})

export type FrontendDanceEvaluator = UserDanceEvaluator<typeof FrontendLiveMetrics, typeof FrontendSummaryMetrics>;
export type FrontendPerformanceSummary = NonNullable<ReturnType<FrontendDanceEvaluator["generatePerformanceSummary"]>>;
export type FrontendLiveEvaluationResult = ReturnType<FrontendDanceEvaluator["evaluateFrame"]>;
export type FrontendEvaluationTrack = PerformanceEvaluationTrack<NonNullable<FrontendLiveEvaluationResult>>;

export function getFrontendDanceEvaluator(
    ref2dPoses: PoseReferenceData<Pose2DPixelLandmarks>,
    ref3dPoses: PoseReferenceData<Pose3DLandmarkFrame>
) {
    
    return new UserDanceEvaluator(
        ref2dPoses,
        ref3dPoses,
        FrontendLiveMetrics,
        FrontendSummaryMetrics,
        frontendPerformanceHistory,
    );
}
