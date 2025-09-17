

import type { PoseReferenceData } from "$lib/data/dances-store";
import type { Pose2DPixelLandmarks, Pose3DLandmarkFrame } from "$lib/webcam/mediapipe-utils";
import UserDanceEvaluator from "./UserDanceEvaluator";
import type { PerformanceEvaluationTrack } from "./UserEvaluationTrackRecorder";
// import Jules2DSkeletonSimilarityMetric from "./motionmetrics/Jules2DSkeletonSimilarityMetric";
import Qijia2DSkeletonSimilarityMetric from "./motionmetrics/Qijia2DSkeletonSimilarityMetric";
import Skeleton3dVectorAngleSimilarityMetric from "./motionmetrics/Skeleton3dVectorAngleSimilarityMetric";
import BasicInfoSummaryMetric from "./motionmetrics/BasicInfoSummaryMetric";
import KinematicErrorMetric from "./motionmetrics/KinematicErrorMetric";

import frontendPerformanceHistory from "./frontendPerformanceHistory";
import TemporalAlignmentMetric from "./motionmetrics/TemporalAlignmentMetric";
import Skeleton3DAngleDistanceDTW from "./motionmetrics/Skeleton3DAngleDistanceDTW";

export const FrontendLiveMetrics = Object.freeze({
    qijia2DSkeletonSimilarity: new Qijia2DSkeletonSimilarityMetric(),
    // jules2DSkeletonSimilarity: new Jules2DSkeletonSimilarityMetric(),
    skeleton3DAngleSimilarity: new Skeleton3dVectorAngleSimilarityMetric(),
});

export const FrontendSummaryMetrics = Object.freeze({
    basicInfo: new BasicInfoSummaryMetric(),
    kinematicError: new KinematicErrorMetric(),
    temporalAlignment: new TemporalAlignmentMetric(),
    // skeleton3dSimilarityDtw: new Skeleton3DAngleDistanceDTW(),
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