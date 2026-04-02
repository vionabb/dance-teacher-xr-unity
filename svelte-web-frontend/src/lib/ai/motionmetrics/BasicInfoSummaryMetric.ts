import {
	getSegmentFrameRanges,
	type EvaluationTrackHistory,
	type SummaryEvaluationMetric
} from './MotionMetric';

type BasicInfoSummaryOutput = ReturnType<BasicInfoSummaryMetric['summarizeMetric']>;

export default class BasicInfoSummaryMetric implements SummaryEvaluationMetric<
	BasicInfoSummaryOutput,
	BasicInfoSummaryOutput
> {
	summarizeMetric(history: EvaluationTrackHistory) {
		const poseFrameCount = history.videoFrameTimesInSecs.length;
		const realtimeStartMs = history.actualTimesInMs[0] ?? 0;
		const realtimeEndMs = history.actualTimesInMs[history.actualTimesInMs.length - 1] ?? 0;
		const realTimeDurationSecs = (realtimeEndMs - realtimeStartMs) / 1000;
		const danceStartSecs = history.videoFrameTimesInSecs[0] ?? 0;
		const danceEndSecs =
			history.videoFrameTimesInSecs[history.videoFrameTimesInSecs.length - 1] ?? 0;
		const videoTimeDurationSecs = danceEndSecs - danceStartSecs;
		const duplicateFrameTimeCount =
			history.videoFrameTimesInSecs.length - new Set(history.videoFrameTimesInSecs).size;

		return {
			poseFrameCount,
			realTimeDurationSecs,
			duplicateFrameTimeCount,
			realTimeFps: poseFrameCount / realTimeDurationSecs,
			videoTimeDurationSecs,
			videoTimeFps: poseFrameCount / videoTimeDurationSecs
		};
	}

	formatSummary(summary: BasicInfoSummaryOutput) {
		return summary; // no formatting needed
	}

	evaluateSegmented(
		history: Readonly<EvaluationTrackHistory>,
		segmentBoundaries: readonly number[]
	) {
		const frameCount = history.videoFrameTimesInSecs.length;
		try {
			return getSegmentFrameRanges(frameCount, segmentBoundaries).map(
				(range) => range.endFrameExclusive - range.startFrame
			);
		} catch {
			return new Array(segmentBoundaries.length + 1).fill(null);
		}
	}
}
