import { lerp } from "$lib/utils/math";
import type { Pose3DLandmarkFrame, Pose2DPixelLandmarks } from "$lib/webcam/mediapipe-utils";
import { GetNormalized2DVector, QijiaMethodComparisionVectorNames, QijiaMethodComparisonVectors, GetArithmeticMean, getMagnitude2DVec } from "../EvaluationCommonUtils";
import type { LiveEvaluationMetric, TrackHistory } from "./MotionMetric";

export const QIJIA_SKELETON_SIMILARITY_MAX_SCORE = 5.0;

/**
 * Type definition for an array of 8 numbers.
 * Represents the scores for 8 upper body comparison vectors.
 */
type Vec8 = [number, number, number, number, number, number, number, number]

/**
 * Compute the similarity of two poses based on a 2D projection, looking at a set of 8 upper body
 * comparison vectors, as described by our JLS paper. The similarity is computed by normalizing each
 * of these comparison vectors and computing the distance between the corresponding normalized vectors,
 * (a value between good=0 and bad=2), remaiing to 0=bad, 5=good, then taking the average across the 
 * comparison vectors.
 * @param refLandmarks Reference landmarks (expert)
 * @param userLandmarks Evaluation landmarks (learner)
 * @returns Tuple of scores between 0 and 5, where 0 is the worst and 5 is the best. First is a scalar with the overall score, next is array of the scores of the 8 comparison vectors.
 */
function computeSkeletonDissimilarityQijiaMethod(
    refLandmarks: Pose2DPixelLandmarks, 
    userLandmarks: Pose2DPixelLandmarks
) {

    // From the paper: 
    //     At each frame, we compute the absolute difference be-
    // tween the corresponding unit vectors of the learner and the
    // expert, and then sum them up as the per-frame dancing error.
    // The overall dancing error is calculated as the average of all
    // frames of the dance. Finally, we scale the score into the range
    // of [0, 5], where 0 denotes the poorest performance and 5 rep-
    // resents the best performance. This normalized score serves
    // as the final performance rating.
    let rawOverallDisimilarityScore = 0

    // Compare 8 Vectors
    const vectorDissimilarityScores = QijiaMethodComparisonVectors.map((vecLandmarkIds) => {
        const [srcLandmark, destLandmark] = vecLandmarkIds
        const [refX, refY] = GetNormalized2DVector(refLandmarks, srcLandmark, destLandmark)
        const [usrX, usrY] = GetNormalized2DVector(userLandmarks, srcLandmark, destLandmark)
        const [dx, dy] = [refX - usrX, refY - usrY]
        return getMagnitude2DVec([dx, dy]) || 0;
    });


    rawOverallDisimilarityScore = GetArithmeticMean(vectorDissimilarityScores);

    // According to Qijia, we used an upper bound of 2.0 for the dissimimlarity score (which would indicate all vectors
    // of the user faced the exact opposite directions of the expert), and the lower bound was zero (which would indicate
    // a perfect match with the expert)
    // If a user's dissimilarity score was closer to 0, they did well, and if it was closer
    // to 2.0, they did poorly. (These specific numbers are not mentioned in the paper). 
    const SRC_DISSIMILARITY_WORST = 2.0
    const SRC_DISSIMILARITY_BEST = 0.0
    
    // We want to scale the score to a [0...5] range
    const TARGET_WORST = 0.0

    function scaleScore(s: number) {
        return lerp(s, 
            SRC_DISSIMILARITY_BEST, SRC_DISSIMILARITY_WORST, 
            QIJIA_SKELETON_SIMILARITY_MAX_SCORE, TARGET_WORST
        )
    }

    const overallScore = scaleScore(rawOverallDisimilarityScore)
    const vectorByVectorScore = vectorDissimilarityScores.map(scaleScore) as Vec8;

    return {
        overallScore,
        vectorByVectorScore
    };
}

type QijiaMetricSingleFrameOutput = {
    overallScore: number;
    vectorByVectorScore: Vec8;
}

type QijiaMetricSummaryOutput = {
    minPossibleScore: number;
    maxPossibleScore: number;
    overallScore: number;
    vectorByVectorScore: Record<string, number>;
}

type QijiaMetricSummaryFormattedOutput = ReturnType<Qijia2DSkeletonSimilarityMetric["formatSummary"]>;

/**
 * A metric that calculates the similarity between two poses using the Qijia method.
 * @see computeSkeletonDissimilarityQijiaMethod
 */
export default class Qijia2DSkeletonSimilarityMetric implements LiveEvaluationMetric<QijiaMetricSingleFrameOutput, QijiaMetricSummaryOutput, QijiaMetricSummaryFormattedOutput> {

    computeMetric(_history: TrackHistory, _metricHistory: QijiaMetricSingleFrameOutput[], _videoFrameTimeInSecs: number, _actualTimesInMs: number, user2dPose: Pose2DPixelLandmarks, _user3dPose: Pose3DLandmarkFrame, ref2dPose: Pose2DPixelLandmarks, _ref3dPose: Pose3DLandmarkFrame): QijiaMetricSingleFrameOutput {
        return computeSkeletonDissimilarityQijiaMethod(ref2dPose, user2dPose)
    }

    summarizeMetric(_history: TrackHistory, metricHistory: QijiaMetricSingleFrameOutput[]): QijiaMetricSummaryOutput {
        const qijiaOverallScore = GetArithmeticMean(metricHistory.map(m => m.overallScore));
        const arrayOfVecScores = metricHistory.map(m => m.vectorByVectorScore);

        const vectorScoreKeyValues = QijiaMethodComparisonVectors.map((_vec, i) => {
            const key = QijiaMethodComparisionVectorNames[i];
            const thisVecScores = arrayOfVecScores.map(vecbyVecScores => vecbyVecScores[i]);
            const meanScore = GetArithmeticMean(thisVecScores);
            return [key, meanScore] as [string, number];
        });
        const qijiaByVectorScores = Object.fromEntries(vectorScoreKeyValues) 

        return {
            overallScore: qijiaOverallScore,
            vectorByVectorScore: qijiaByVectorScores,
            minPossibleScore: 0,
            maxPossibleScore: QIJIA_SKELETON_SIMILARITY_MAX_SCORE,
        }
    }

    formatSummary(summary: QijiaMetricSummaryOutput): Record<string, string | number> {
        return {
            "overall": summary.overallScore,
            ...summary.vectorByVectorScore
        }
    }
}