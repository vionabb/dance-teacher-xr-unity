import type { Pose2DPixelLandmarks, Pose3DLandmarkFrame } from '$lib/webcam/mediapipe-utils';
import {
	getMeanOfFiniteValues,
	getSegmentFrameRanges,
	type EvaluationTrackHistory,
	type SummaryEvaluationMetric
} from './MotionMetric';
import {
	calculateKinematicValues,
	calculateKinematicErrorDescriptors,
	type KinematicComputationOptions,
	type KinematicErrorDescriptorsOptions
} from './compute-kinematic-motion-descriptors';

function prependObjectKeys<T extends Record<string, any>, prefixT extends string>(
	obj: T,
	prefix: prefixT
): { [K in keyof T as `${prefixT}${Extract<K, string>}`]: T[K] } {
	return Object.keys(obj).reduce(
		(newObjSoFar, key) => ({
			...newObjSoFar,
			[prefix + key]: obj[key]
		}),
		{}
	) as {
		[K in keyof T as `${prefixT}${Extract<K, string>}`]: T[K];
	};
}

type KinematicErrorEvaluationMetricOutputForSomeDimension = {
	jerkMAE: number | null;
	jerkRMSE: number | null;
	accelMAE: number | null;
	accelRMSE: number | null;
	velMAE: number | null;
	velRMSE: number | null;
};

type KinematicErrorEvaluationMetricOutput = {
	summary2D: KinematicErrorEvaluationMetricOutputForSomeDimension;
	summary3D: KinematicErrorEvaluationMetricOutputForSomeDimension;
};

type KinematicErrorEvaluationMetricFormattedOutput = ReturnType<
	KinematicErrorEvaluationMetric['formatSummary']
>;

export default class KinematicErrorEvaluationMetric implements SummaryEvaluationMetric<
	KinematicErrorEvaluationMetricOutput,
	KinematicErrorEvaluationMetricFormattedOutput
> {
	constructor(
		public opts?: {
			calculateValues?: KinematicComputationOptions<Pose2DPixelLandmarks | Pose3DLandmarkFrame>;
			calculateDescriptors?: KinematicErrorDescriptorsOptions;
		}
	) {}

	summarizeMetric(history: EvaluationTrackHistory): KinematicErrorEvaluationMetricOutput {
		// Current issue: getting lots of NaN values for the
		//  kinematic values (due to releated frames with same tiemstamp,
		//  this might be fixed now). Also, some visibility things
		// appear to be undefined, which may cause issues as well.
		//
		// Next steps:
		//   * Define & document behavior for when frames are repeated or visbility is missing
		//       > repeated frames are ignored!
		//   * Report visibility in kinematic metric computations
		//   * ✅ Consider adopting "min-visibility" behavior when computing derivatives and/or when computing errors.
		//   * Add tests for these cases
		//   * Validate the test in the test track, make sure all visibilty values etc are importing correctly
		//   * Support output of the trends from the metric, perhaps by including the raw kinematic values in the
		//     non-formatted summary output. Create charts based on this and add to thesis document.
		//
		const vals3d = calculateKinematicValues(
			history.user3DFrameHistory,
			history.ref3DFrameHistory,
			history.videoFrameTimesInSecs,
			this.opts?.calculateValues
		);
		const summary3D = calculateKinematicErrorDescriptors(vals3d, this.opts?.calculateDescriptors);
		const vals2d = calculateKinematicValues(
			history.user2DFrameHistory,
			history.ref2DFrameHistory,
			history.videoFrameTimesInSecs,
			this.opts?.calculateValues
		);
		const summary2D = calculateKinematicErrorDescriptors(vals2d, this.opts?.calculateDescriptors);

		// Combine the 2D and 3D summaries into a single summary object
		const combinedSummary: KinematicErrorEvaluationMetricOutput = {
			summary2D,
			summary3D
		};

		return combinedSummary;
	}

	evaluateSegmented(
		history: Readonly<EvaluationTrackHistory>,
		segmentBoundaries: readonly number[]
	) {
		try {
			return getSegmentFrameRanges(history.videoFrameTimesInSecs.length, segmentBoundaries).map(
				(range) => {
					const segmentHistory: EvaluationTrackHistory = {
						videoFrameTimesInSecs: history.videoFrameTimesInSecs.slice(
							range.startFrame,
							range.endFrameExclusive
						),
						actualTimesInMs: history.actualTimesInMs.slice(
							range.startFrame,
							range.endFrameExclusive
						),
						ref3DFrameHistory: history.ref3DFrameHistory.slice(
							range.startFrame,
							range.endFrameExclusive
						),
						ref2DFrameHistory: history.ref2DFrameHistory.slice(
							range.startFrame,
							range.endFrameExclusive
						),
						user3DFrameHistory: history.user3DFrameHistory.slice(
							range.startFrame,
							range.endFrameExclusive
						),
						user2DFrameHistory: history.user2DFrameHistory.slice(
							range.startFrame,
							range.endFrameExclusive
						)
					};
					const summary = this.summarizeMetric(segmentHistory);
					return getMeanOfFiniteValues([
						summary.summary2D.velMAE ?? NaN,
						summary.summary2D.accelMAE ?? NaN,
						summary.summary2D.jerkMAE ?? NaN,
						summary.summary3D.velMAE ?? NaN,
						summary.summary3D.accelMAE ?? NaN,
						summary.summary3D.jerkMAE ?? NaN
					]);
				}
			);
		} catch {
			return new Array(segmentBoundaries.length + 1).fill(null);
		}
	}

	formatSummary(summary: Readonly<KinematicErrorEvaluationMetricOutput>) {
		return {
			...prependObjectKeys(summary.summary2D, 'd2_'),
			...prependObjectKeys(summary.summary3D, 'd3_')
		};
	}
}
