import { lerp } from '$lib/utils/math';
import type { Pose3DLandmarkFrame, Pose2DPixelLandmarks } from '$lib/webcam/mediapipe-utils';
import {
	GetNormalized2DVector,
	QijiaMethodComparisionVectorNames,
	QijiaMethodComparisonVectors,
	GetArithmeticMean,
	getMagnitude2DVec
} from '../EvaluationCommonUtils';
import {
	aggregateSegmentedValues,
	type EvaluationMetricTimeSeriesContext,
	type EvaluationTrackHistory,
	type LiveEvaluationMetric,
	type MotionMetricTimeSeries
} from './MotionMetric';

export const QIJIA_SKELETON_SIMILARITY_MAX_SCORE = 5.0;

/**
 * Type definition for an array of 8 numbers.
 * Represents the scores for 8 upper body comparison vectors.
 */
type Vec8 = [
	number | null,
	number | null,
	number | null,
	number | null,
	number | null,
	number | null,
	number | null,
	number | null
];

/**
 * Compute the similarity of two poses based on a 2D projection, looking at a set of 8 upper body
 * comparison vectors, as described by our JLS paper. The similarity is computed by normalizing each
 * of these comparison vectors and computing the distance between the corresponding normalized vectors,
 * (a value between good=0 and bad=2), remaiing to 0=bad, 5=good, then taking the average across the
 * comparison vectors.
 * @param refLandmarks Reference landmarks (expert)
 * @param userLandmarks Evaluation landmarks (learner)
 * @returns Per-frame scores between 0 and 5, with null for the overall or any vector score that has no valid pair data.
 */
function computeSkeletonDissimilarityQijiaMethod(
	refLandmarks: Pose2DPixelLandmarks,
	userLandmarks: Pose2DPixelLandmarks
) {
	if (!refLandmarks || !userLandmarks) {
		return { overallScore: null, vectorByVectorScore: Array(8).fill(null) as Vec8 };
	}
	// From the paper:
	//     At each frame, we compute the absolute difference be-
	// tween the corresponding unit vectors of the learner and the
	// expert, and then sum them up as the per-frame dancing error.
	// The overall dancing error is calculated as the average of all
	// frames of the dance. Finally, we scale the score into the range
	// of [0, 5], where 0 denotes the poorest performance and 5 rep-
	// resents the best performance. This normalized score serves
	// as the final performance rating.
	// Compare 8 Vectors
	const vectorDissimilarityScores = QijiaMethodComparisonVectors.map((vecLandmarkIds) => {
		const [srcLandmark, destLandmark] = vecLandmarkIds;
		const refSrc = refLandmarks[srcLandmark];
		const refDest = refLandmarks[destLandmark];
		const userSrc = userLandmarks[srcLandmark];
		const userDest = userLandmarks[destLandmark];
		if (
			!refSrc ||
			!refDest ||
			!userSrc ||
			!userDest ||
			![
				refSrc.x,
				refSrc.y,
				refDest.x,
				refDest.y,
				userSrc.x,
				userSrc.y,
				userDest.x,
				userDest.y
			].every(Number.isFinite)
		)
			return null;
		if (
			Math.hypot(refDest.x - refSrc.x, refDest.y - refSrc.y) === 0 ||
			Math.hypot(userDest.x - userSrc.x, userDest.y - userSrc.y) === 0
		)
			return null;
		const [refX, refY] = GetNormalized2DVector(refLandmarks, srcLandmark, destLandmark);
		const [usrX, usrY] = GetNormalized2DVector(userLandmarks, srcLandmark, destLandmark);
		const [dx, dy] = [refX - usrX, refY - usrY];
		return Number.isFinite(dx) && Number.isFinite(dy) ? getMagnitude2DVec([dx, dy]) : null;
	});

	const validDissimilarities = vectorDissimilarityScores.filter(
		(value): value is number => value !== null
	);
	const rawOverallDisimilarityScore = validDissimilarities.length
		? GetArithmeticMean(validDissimilarities)
		: null;

	// According to Qijia, we used an upper bound of 2.0 for the dissimimlarity score (which would indicate all vectors
	// of the user faced the exact opposite directions of the expert), and the lower bound was zero (which would indicate
	// a perfect match with the expert)
	// If a user's dissimilarity score was closer to 0, they did well, and if it was closer
	// to 2.0, they did poorly. (These specific numbers are not mentioned in the paper).
	const SRC_DISSIMILARITY_WORST = 2.0;
	const SRC_DISSIMILARITY_BEST = 0.0;

	// We want to scale the score to a [0...5] range
	const TARGET_WORST = 0.0;

	function scaleScore(s: number): number {
		return lerp(
			s,
			SRC_DISSIMILARITY_BEST,
			SRC_DISSIMILARITY_WORST,
			QIJIA_SKELETON_SIMILARITY_MAX_SCORE,
			TARGET_WORST
		);
	}

	const overallScore =
		rawOverallDisimilarityScore === null ? null : scaleScore(rawOverallDisimilarityScore);
	const vectorByVectorScore = vectorDissimilarityScores.map((score) =>
		score === null ? null : scaleScore(score)
	) as Vec8;

	return {
		overallScore,
		vectorByVectorScore
	};
}

type QijiaMetricSingleFrameOutput = {
	overallScore: number | null;
	vectorByVectorScore: Vec8;
};

type QijiaMetricSummaryOutput = {
	minPossibleScore: number;
	maxPossibleScore: number;
	overallScore: number | null;
	vectorByVectorScore: Record<string, number | null>;
};

type QijiaMetricSummaryFormattedOutput = ReturnType<Qijia2DPoseEvaluationMetric['formatSummary']>;

/**
 * A metric that calculates the similarity between two poses using the Qijia method.
 * @see computeSkeletonDissimilarityQijiaMethod
 */
export default class Qijia2DPoseEvaluationMetric implements LiveEvaluationMetric<
	QijiaMetricSingleFrameOutput,
	QijiaMetricSummaryOutput,
	QijiaMetricSummaryFormattedOutput
> {
	computeMetric(
		_history: EvaluationTrackHistory,
		_metricHistory: QijiaMetricSingleFrameOutput[],
		_videoFrameTimeInSecs: number,
		_actualTimesInMs: number,
		user2dPose: Pose2DPixelLandmarks,
		_user3dPose: Pose3DLandmarkFrame,
		ref2dPose: Pose2DPixelLandmarks,
		_ref3dPose: Pose3DLandmarkFrame
	): QijiaMetricSingleFrameOutput {
		return computeSkeletonDissimilarityQijiaMethod(ref2dPose, user2dPose);
	}

	summarizeMetric(
		_history: EvaluationTrackHistory,
		metricHistory: QijiaMetricSingleFrameOutput[]
	): QijiaMetricSummaryOutput {
		const validFrameScores = metricHistory
			.map((m) => m.overallScore)
			.filter((score): score is number => score !== null);
		const qijiaOverallScore = validFrameScores.length ? GetArithmeticMean(validFrameScores) : null;
		const arrayOfVecScores = metricHistory.map((m) => m.vectorByVectorScore);

		const vectorScoreKeyValues = QijiaMethodComparisonVectors.map((_vec, i) => {
			const key = QijiaMethodComparisionVectorNames[i];
			const thisVecScores = arrayOfVecScores.map((vecbyVecScores) => vecbyVecScores[i]);
			const validScores = thisVecScores.filter((score): score is number => score !== null);
			const meanScore = validScores.length ? GetArithmeticMean(validScores) : null;
			return [key, meanScore] as [string, number | null];
		});
		const qijiaByVectorScores = Object.fromEntries(vectorScoreKeyValues);

		return {
			overallScore: qijiaOverallScore,
			vectorByVectorScore: qijiaByVectorScores,
			minPossibleScore: 0,
			maxPossibleScore: QIJIA_SKELETON_SIMILARITY_MAX_SCORE
		};
	}

	formatSummary(summary: QijiaMetricSummaryOutput): Record<string, string | number | null> {
		return {
			overall: summary.overallScore,
			...summary.vectorByVectorScore
		};
	}

	evaluateSegmented(
		_history: Readonly<EvaluationTrackHistory>,
		metricHistory: Readonly<QijiaMetricSingleFrameOutput[]>,
		segmentBoundaries: readonly number[]
	) {
		return aggregateSegmentedValues(
			metricHistory.map((frame) => frame.overallScore ?? Number.NaN),
			segmentBoundaries,
			(values) => (values.length > 0 ? GetArithmeticMean(values) : null)
		);
	}

	getTimeSeries(
		context: EvaluationMetricTimeSeriesContext<
			QijiaMetricSummaryOutput,
			QijiaMetricSingleFrameOutput
		>
	): MotionMetricTimeSeries[] {
		const metricHistory = context.metricHistory ?? [];
		const rows = metricHistory.map((frame, index) => {
			const vectorScores = Object.fromEntries(
				QijiaMethodComparisionVectorNames.map((name, vecIndex) => [
					name,
					frame.vectorByVectorScore[vecIndex]
				])
			);

			return {
				frameIndex: index,
				videoTimeSecs: context.track.videoFrameTimesInSecs[index] ?? null,
				overallScore: frame.overallScore,
				...vectorScores
			};
		});

		return [
			{
				seriesId: 'frame_scores',
				title: 'Qijia 2D frame scores',
				xKey: 'videoTimeSecs',
				yKeys: ['overallScore', ...QijiaMethodComparisionVectorNames],
				xLabel: 'Video time (s)',
				yLabel: 'Score',
				rows
			}
		];
	}
}
