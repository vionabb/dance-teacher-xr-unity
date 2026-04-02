import type { Pose3DLandmarkFrame } from '$lib/webcam/mediapipe-utils';
import { getMagnitude3DVec } from '../EvaluationCommonUtils';
import {
	getSegmentFrameRanges,
	type EvaluationMetricTimeSeriesContext,
	type EvaluationTrackHistory,
	type MotionMetricTimeSeries,
	type SummaryEvaluationMetric
} from './MotionMetric';
let writeFileSync: typeof import('fs').writeFileSync;
let mkdirSync: typeof import('fs').mkdirSync;

function initializeFilesystemFns() {
	if (typeof process === 'undefined' || process.versions == null || process.versions.node == null) {
		return;
	}

	// Delay Node-only resolution so the browser bundle never tries to import fs.
	const loadNodeFs = new Function('return import("node:" + "fs")') as () => Promise<
		typeof import('fs')
	>;
	loadNodeFs()
		.then((fs) => {
			writeFileSync = fs.writeFileSync;
			mkdirSync = fs.mkdirSync;
		})
		.catch(() => {
			writeFileSync = () => {};
			mkdirSync = () => {};
		});
}

// Default to no-op functions until/unless we are running in Node.js.
if (writeFileSync === undefined || mkdirSync === undefined) {
	writeFileSync = () => {};
	mkdirSync = () => {};
}
initializeFilesystemFns();

type TemporalAlignmentEvaluationMetricOutput = ReturnType<
	TemporalAlignmentEvaluationMetric['summarizeMetric']
>;
type TemporalAlignmentEvaluationMetricFormattedOutput = ReturnType<
	TemporalAlignmentEvaluationMetric['formatSummary']
>;

function calculateImpactEnvelope(frameHistory: Pose3DLandmarkFrame[], debugFileRoot?: string) {
	// Step 1. Calculate pose flow -- direction that each body part is moving at each frame
	const poseFlow = frameHistory.map((frame, index, arr) => {
		const nextFrame = arr[index + 1];
		if (!nextFrame) {
			return null;
		}

		return frame.map((joint, jointIndex) => {
			const nextJoint = nextFrame[jointIndex];
			return {
				x: nextJoint.x - joint.x,
				y: nextJoint.y - joint.y,
				z: nextJoint.z - joint.z
			};
		});
	});

	// Step 2: Construct the Posegram -- bin each pose flow vector into a 2D histogram
	//      where the x-axis is the frame index and the y-axis is the directional bin (8 directions).
	const binDirections = 8;
	const posegram = poseFlow.map((frame, frameIndex) => {
		const bins = new Array<number>(binDirections).fill(0);
		if (!frame) {
			return bins;
		}

		frame.forEach((joint) => {
			// determine which bin the joint's flow vector belongs to in 3D space
			// and add the flow vector magnitude to the bin value
			const polarAngle = Math.atan2(joint.y, joint.x);
			const polarQuadrant = Math.floor(((polarAngle + Math.PI) % (2 * Math.PI)) / (Math.PI / 2));
			if (polarQuadrant < 0 || polarQuadrant >= 4) {
				throw new Error(
					'Something is wrong, calculated an invalid polar quadrant of ' + polarQuadrant
				);
			}
			const binIndex = joint.z > 0 ? polarQuadrant + 4 : polarQuadrant;
			bins[binIndex] += getMagnitude3DVec([joint.x, joint.y, joint.z]);
		});

		return bins;
	});

	// store posegram as csv
	if (debugFileRoot) {
		const csvContent = posegram.map((frame, index) => [index, ...frame].join(', ')).join('\n');
		const filepath = debugFileRoot + 'posegram.csv';
		mkdirSync(debugFileRoot, { recursive: true });
		writeFileSync(filepath, csvContent, 'utf8');
	}

	// Step 3: Calculate posegram flux - the derivative of the posegram at each bin
	const posegramFlux = posegram.map((posegramFrame, frameIndex, arr) => {
		const nextPosegramFrame = arr[frameIndex + 1];
		if (!nextPosegramFrame) {
			return new Array<number>(binDirections).fill(0);
		}
		return posegramFrame.map((binValue, binIndex) => {
			const nextBinvalue = nextPosegramFrame[binIndex];
			return nextBinvalue - binValue;
		});
	});

	// Step 4: Compute the impact envelope by summing the absolute value of prosegram flux for each frame
	const impactEnvelope = posegramFlux.map((frame) => {
		return frame.reduce((acc, binValue) => acc + Math.abs(binValue), 0);
	}, 0);

	// save the impact envelope as a csv
	if (debugFileRoot) {
		const csvContent = impactEnvelope.map((value, index) => [index, value].join(', ')).join('\n');
		const filepath = debugFileRoot + 'impact_envelope.csv';
		mkdirSync(debugFileRoot, { recursive: true });
		writeFileSync(filepath, csvContent, 'utf8');
	}

	return impactEnvelope;
}

function weighByGaussian(
	impactEnvelope: number[],
	envelopeCenterIndex: number,
	envelopeSegmentLength: number
) {
	return impactEnvelope.map((value, index) => {
		return (
			value *
			Math.exp(
				-Math.pow(index - envelopeCenterIndex, 2) / (2 * Math.pow(envelopeSegmentLength / 2, 2))
			)
		);
	});
}

function crossCorrelate(signalA: number[], signalB: number[]): number[] {
	const result = new Array(signalA.length).fill(0);

	for (let lag = -signalA.length + 1; lag < signalA.length; lag++) {
		let sum = 0;

		for (let i = 0; i < signalA.length; i++) {
			const j = i + lag;

			if (j >= 0 && j < signalB.length) {
				sum += signalA[i] * signalB[j];
			}
		}

		result[lag + signalA.length - 1] = sum;
	}

	return result;
}

type TemporalAlignmentSignals = {
	userImpactEnvelope: number[];
	referenceImpactEnvelope: number[];
	userWeightedEnvelope: number[];
	referenceWeightedEnvelope: number[];
	crossCorrelation: number[];
};

function calculateTemporalAlignmentSignals(
	history: EvaluationTrackHistory,
	debugFilepathRoot?: string
): TemporalAlignmentSignals {
	const userImpactEnvelope = calculateImpactEnvelope(
		history.user3DFrameHistory,
		debugFilepathRoot ? debugFilepathRoot + 'user_impact_envelope/' : undefined
	);
	const referenceImpactEnvelope = calculateImpactEnvelope(
		history.ref3DFrameHistory,
		debugFilepathRoot ? debugFilepathRoot + 'ref_impact_envelope/' : undefined
	);

	function saveTimeSeriesToCSV(data: number[][], filePath: string) {
		if (!debugFilepathRoot) return;
		const csvContent = data.map((value, index) => [index, ...value].join(', ')).join('\n');
		writeFileSync(filePath, csvContent, 'utf8');
	}

	if (debugFilepathRoot) {
		saveTimeSeriesToCSV(
			[userImpactEnvelope, referenceImpactEnvelope],
			debugFilepathRoot + 'impact_envelopes.csv'
		);
	}

	const envelopeLength = userImpactEnvelope.length;
	const envelopeCenter = Math.floor(envelopeLength / 2);
	const userWeightedEnvelope = weighByGaussian(userImpactEnvelope, envelopeCenter, envelopeLength);
	const referenceWeightedEnvelope = weighByGaussian(
		referenceImpactEnvelope,
		envelopeCenter,
		envelopeLength
	);
	const crossCorrelation = crossCorrelate(userWeightedEnvelope, referenceWeightedEnvelope);

	saveTimeSeriesToCSV([crossCorrelation], debugFilepathRoot + 'cross_correlation.csv');

	return {
		userImpactEnvelope,
		referenceImpactEnvelope,
		userWeightedEnvelope,
		referenceWeightedEnvelope,
		crossCorrelation
	};
}

// REFACTORING:: will need to support looking at adjacent segments in the future!
export default class TemporalAlignmentEvaluationMetric implements SummaryEvaluationMetric<
	TemporalAlignmentEvaluationMetricOutput,
	TemporalAlignmentEvaluationMetricFormattedOutput
> {
	summarizeMetric(history: EvaluationTrackHistory, debugFilepathRoot?: string) {
		if (history.user3DFrameHistory.length !== history.ref3DFrameHistory.length) {
			throw new Error(
				'Impact envelope calculation failed: user and reference impact envelopes are different lengths'
			);
		}
		if (history.user3DFrameHistory.length < 2) {
			throw new Error(
				'Impact envelope calculation failed: not enough frames to calculate impact envelope'
			);
		}

		const {
			userImpactEnvelope,
			referenceImpactEnvelope,
			userWeightedEnvelope,
			referenceWeightedEnvelope,
			crossCorrelation
		} = calculateTemporalAlignmentSignals(history, debugFilepathRoot);

		// Find the peak of the cross-correlation to determine the temporal alignment
		const maxCorrelation = Math.max(...crossCorrelation);
		const indexOfMaxCorrelation = crossCorrelation.indexOf(maxCorrelation);
		const correlationCenter = Math.floor(crossCorrelation.length / 2);
		const framesToCenter = indexOfMaxCorrelation - correlationCenter;
		const temporalOffsetFrames = framesToCenter;

		const timeOfFirstFrame = history.actualTimesInMs[0];
		const timeOfLastFrame = history.actualTimesInMs[history.actualTimesInMs.length - 1];
		const actualFrameRate =
			(timeOfLastFrame - timeOfFirstFrame) / (history.actualTimesInMs.length - 1);
		const temporalOffsetSecs = temporalOffsetFrames / actualFrameRate;

		return {
			temporalOffsetSecs,
			temporalOffsetFrames,
			userImpactEnvelope,
			referenceImpactEnvelope,
			userWeightedEnvelope,
			referenceWeightedEnvelope,
			crossCorrelation
		};
	}
	formatSummary(summary: Readonly<TemporalAlignmentEvaluationMetricOutput>) {
		return {
			temporalOffsetSecs: summary.temporalOffsetSecs,
			temporalOffsetFrames: summary.temporalOffsetFrames
		};
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
					if (segmentHistory.videoFrameTimesInSecs.length < 2) {
						return null;
					}
					return this.summarizeMetric(segmentHistory).temporalOffsetSecs;
				}
			);
		} catch {
			return new Array(segmentBoundaries.length + 1).fill(null);
		}
	}

	getTimeSeries(
		context: EvaluationMetricTimeSeriesContext<TemporalAlignmentEvaluationMetricOutput>
	): MotionMetricTimeSeries[] {
		const rows = context.summary.userImpactEnvelope.map((userImpact, index) => ({
			frameIndex: index,
			videoTimeSecs: context.track.videoFrameTimesInSecs[index] ?? null,
			userImpactEnvelope: userImpact,
			referenceImpactEnvelope: context.summary.referenceImpactEnvelope[index] ?? null,
			userWeightedEnvelope: context.summary.userWeightedEnvelope[index] ?? null,
			referenceWeightedEnvelope: context.summary.referenceWeightedEnvelope[index] ?? null
		}));
		const correlationRows = context.summary.crossCorrelation.map((value, index) => ({
			lagIndex: index,
			crossCorrelation: value
		}));

		return [
			{
				seriesId: 'impact_envelopes',
				title: 'Temporal alignment impact envelopes',
				xKey: 'videoTimeSecs',
				yKeys: [
					'userImpactEnvelope',
					'referenceImpactEnvelope',
					'userWeightedEnvelope',
					'referenceWeightedEnvelope'
				],
				xLabel: 'Video time (s)',
				yLabel: 'Envelope magnitude',
				rows
			},
			{
				seriesId: 'cross_correlation',
				title: 'Temporal alignment cross correlation',
				xKey: 'lagIndex',
				yKeys: ['crossCorrelation'],
				xLabel: 'Lag index',
				yLabel: 'Correlation',
				rows: correlationRows
			}
		];
	}
}
