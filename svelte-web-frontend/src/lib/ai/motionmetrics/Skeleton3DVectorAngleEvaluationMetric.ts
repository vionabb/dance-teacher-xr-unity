import type { ValueOf } from '$lib/data/dances-store';
import type { Pose3DLandmarkFrame, Pose2DPixelLandmarks } from '$lib/webcam/mediapipe-utils';
import {
	BodyInnerAnglesComparisons,
	getInnerAngleFromFrame,
	GetHarmonicMean,
	getArraySD
} from '../EvaluationCommonUtils';
import {
	aggregateSegmentedValues,
	type EvaluationMetricTimeSeriesContext,
	type EvaluationTrackHistory,
	type LiveEvaluationMetric,
	type MotionMetricTimeSeries
} from './MotionMetric';

type AngleComparisonKey = keyof typeof BodyInnerAnglesComparisons;
type AngleComparisonValue = ValueOf<typeof BodyInnerAnglesComparisons>;

const comparisonWeights: Record<AngleComparisonKey, number> = {
	'left-shoulder-pitch': 1,
	'left-shoudler-yaw': 1,
	'left-elbow-bend': 2,
	'neck-shoulderline-angle': 1,
	'right-shoulder-pitch': 1,
	'right-shoulder-yaw': 1,
	'right-elbow-bend': 2
};

export function compute3dAngleSimilarity(
	refLandmarks: Pose3DLandmarkFrame,
	userLandmarks: Pose3DLandmarkFrame,
	comparison: AngleComparisonValue
) {
	const userInnerAngle = getInnerAngleFromFrame(userLandmarks, comparison.vec1, comparison.vec2);
	const refInnerAngle = getInnerAngleFromFrame(refLandmarks, comparison.vec1, comparison.vec2);
	const angleDiff = Math.abs(userInnerAngle - refInnerAngle);

	// get the angle difference as a percentage of the range of motion
	const scaledAngleDiff = angleDiff / comparison.rangeOfMotion;
	const rawScore = 1 - scaledAngleDiff;

	// clamp the score to be between 0 and 1,
	// as it's possible for the user to bend beyond the expected range of motion
	return {
		user: userInnerAngle,
		ref: refInnerAngle,
		diff: angleDiff,
		diffDegrees: (angleDiff * 180) / Math.PI,
		rawScore,
		score: Math.max(0, Math.min(1, rawScore))
	};
}

/**
 * Calculate the similarity of two 3D poses, based on inner angle between preset pairs of
 * body comparison vectors (as opposed to Qijia's method, which directly compares the orientation of
 * vectors to the camera reference frame).
 * @param refLandmarks 3D pose of the expert
 * @param userLandmarks 3D pose of the user
 * @returns An object containing the overall similarity score, and an array of the similarity scores for each vector
 */
export function computeSkeleton3DVectorAngleSimilarity(
	refLandmarks: Pose3DLandmarkFrame,
	userLandmarks: Pose3DLandmarkFrame
) {
	const results = Object.fromEntries(
		(
			Object.entries(BodyInnerAnglesComparisons) as [AngleComparisonKey, AngleComparisonValue][]
		).map((v) => {
			const [key, comparison] = v;
			return [key, compute3dAngleSimilarity(refLandmarks, userLandmarks, comparison)];
		})
	) as Record<AngleComparisonKey, ReturnType<typeof compute3dAngleSimilarity>>;

	const scores = Object.values(results).map((res) => res.score);
	const weights = Object.keys(results).map((key) => comparisonWeights[key as AngleComparisonKey]);

	const meanScore = GetHarmonicMean(Object.values(scores), weights);

	return {
		overallScore: meanScore,
		individualScores: results
	};
}

type Angle3DMetricSingleFrameOutput = ReturnType<typeof computeSkeleton3DVectorAngleSimilarity>;

export type Angle3DMetricSummaryOutput = ReturnType<
	Skeleton3DVectorAngleEvaluationMetric['summarizeMetric']
>;

type Angle3DMetricSummaryFormattedOutput = ReturnType<
	Skeleton3DVectorAngleEvaluationMetric['formatSummary']
>;

export default class Skeleton3DVectorAngleEvaluationMetric implements LiveEvaluationMetric<
	Angle3DMetricSingleFrameOutput,
	Angle3DMetricSummaryOutput,
	Angle3DMetricSummaryFormattedOutput
> {
	computeMetric(
		_history: EvaluationTrackHistory,
		_metricHistory: Angle3DMetricSingleFrameOutput[],
		_videoFrameTimeInSecs: number,
		_actualTimesInMs: number,
		_user2dPose: Pose2DPixelLandmarks,
		user3dPose: Pose3DLandmarkFrame,
		_ref2dPose: Pose2DPixelLandmarks,
		ref3dPose: Pose3DLandmarkFrame
	): Angle3DMetricSingleFrameOutput {
		return computeSkeleton3DVectorAngleSimilarity(ref3dPose, user3dPose);
	}

	summarizeMetric(
		_history: EvaluationTrackHistory,
		metricHistory: Angle3DMetricSingleFrameOutput[]
	) {
		const overallScores = metricHistory.map((m) => m.overallScore).filter((n) => !isNaN(n));
		const overallMeanScore = GetHarmonicMean(overallScores);
		const overallScoreStdDeviation = getArraySD(overallScores);

		const angleSimilarityVectorScoreKeyValues = (
			Object.keys(BodyInnerAnglesComparisons) as AngleComparisonKey[]
		).map((key) => {
			const vecScores = metricHistory
				.map((scores) => scores.individualScores[key].score)
				.filter((n) => !isNaN(n));
			const meanScore = GetHarmonicMean(vecScores);
			return [key, meanScore] as const;
		});

		const angleSimilarityIndividualScores = Object.fromEntries(
			angleSimilarityVectorScoreKeyValues
		) as Record<AngleComparisonKey, number>;

		return {
			overallScore: overallMeanScore,
			overallScoreSD: overallScoreStdDeviation,
			individualScores: angleSimilarityIndividualScores,
			minPossibleScore: 0,
			maxPossibleScore: 1.0
		};
	}

	formatSummary(summary: Angle3DMetricSummaryOutput) {
		return {
			overall: summary.overallScore,
			overallSD: summary.overallScoreSD,
			...summary.individualScores
		} as const;
	}

	evaluateSegmented(
		_history: Readonly<EvaluationTrackHistory>,
		metricHistory: Readonly<Angle3DMetricSingleFrameOutput[]>,
		segmentBoundaries: readonly number[]
	) {
		return aggregateSegmentedValues(
			metricHistory.map((frame) => frame.overallScore),
			segmentBoundaries,
			(values) => (values.length > 0 ? GetHarmonicMean(values) : null)
		);
	}

	getTimeSeries(
		context: EvaluationMetricTimeSeriesContext<
			Angle3DMetricSummaryOutput,
			Angle3DMetricSingleFrameOutput
		>
	): MotionMetricTimeSeries[] {
		const metricHistory = context.metricHistory ?? [];
		const rows = metricHistory.map((frame, index) => {
			const individualScores = Object.fromEntries(
				(Object.keys(BodyInnerAnglesComparisons) as AngleComparisonKey[]).map((key) => [
					key,
					frame.individualScores[key].score
				])
			);

			return {
				frameIndex: index,
				videoTimeSecs: context.track.videoFrameTimesInSecs[index] ?? null,
				overallScore: frame.overallScore,
				...individualScores
			};
		});

		return [
			{
				seriesId: 'frame_scores',
				title: '3D vector-angle frame scores',
				xKey: 'videoTimeSecs',
				yKeys: [
					'overallScore',
					...(Object.keys(BodyInnerAnglesComparisons) as AngleComparisonKey[])
				],
				xLabel: 'Video time (s)',
				yLabel: 'Score',
				rows
			}
		];
	}
}
