import {
	compareQijiaFrame,
	pairFramesByRowIndex,
	parseLegacyReferencePoseCsv,
	parseRawPoseCsv,
	participantVideoTimeForRow,
	reindexFramesByRowIndex,
	type InspectorFrame
} from '$lib/ai/motionmetrics/qijia2d-inspector';
import { qijiaFrameScore } from './segment-score';

/**
 * Per-vector view of the same frames `qijiaSegmentSamples` scores: identical row pairing,
 * duration cut-off and frame score, plus each vector's raw error and endpoint visibility.
 * Analysis-only; it does not change what the metric computes.
 */
export type VectorFrame = {
	row: number;
	time: number;
	score: number | null;
	/** |Δunit| per Qijia vector (0…2), null when either side has a degenerate vector. */
	errors: (number | null)[];
	/** Minimum visibility over the vector's four endpoints (participant and reference). */
	participantVisibility: (number | null)[];
	referenceVisibility: (number | null)[];
	/** Normalized 2D direction per vector, for offline lag or mirroring what-ifs. */
	participantVectors: ([number, number] | null)[];
	referenceVectors: ([number, number] | null)[];
	/** Lower-body directions the metric does not score (LEG_PAIRS order), for what-ifs only. */
	participantLegVectors: ([number, number] | null)[];
	referenceLegVectors: ([number, number] | null)[];
	participantLegVisibility: (number | null)[];
};

/** Hip→knee and knee→ankle, left then right (MediaPipe indices). Not part of Qijia2D. */
export const LEG_PAIRS = [
	[23, 25],
	[25, 27],
	[24, 26],
	[26, 28]
] as const;

function unitVector(frame: InspectorFrame, src: number, dest: number): [number, number] | null {
	const a = frame.landmarks[src];
	const b = frame.landmarks[dest];
	if (!a || !b) return null;
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const length = Math.hypot(dx, dy);
	return Number.isFinite(length) && length > 0 ? [dx / length, dy / length] : null;
}

function endpointVisibility(frame: InspectorFrame, src: number, dest: number) {
	const values = [frame.landmarks[src]?.visibility, frame.landmarks[dest]?.visibility];
	return values.every((value) => value !== undefined && Number.isFinite(value))
		? Math.min(...(values as number[]))
		: null;
}

export function qijiaVectorFrames(
	participantPoseCsv: string,
	referencePoseCsv: string,
	durationSeconds: number
): VectorFrame[] {
	const participantFrames = reindexFramesByRowIndex(parseRawPoseCsv(participantPoseCsv));
	const pair = pairFramesByRowIndex(
		participantFrames,
		parseLegacyReferencePoseCsv(referencePoseCsv)
	);
	const frames: VectorFrame[] = [];
	for (let row = 0; row < pair.frameCount; row++) {
		const participant = participantFrames.get(row);
		const reference = pair.referenceFrames.get(row);
		const time = participant ? participantVideoTimeForRow(participantFrames, row, 30) : 0;
		if (!participant || !reference || time >= durationSeconds) continue;
		const comparison = compareQijiaFrame(reference, participant);
		frames.push({
			row,
			time,
			score: qijiaFrameScore(comparison.sum, comparison.validCount),
			errors: comparison.vectors.map((vector) => vector.error),
			participantVisibility: comparison.vectors.map((vector) =>
				endpointVisibility(participant, vector.src, vector.dest)
			),
			referenceVisibility: comparison.vectors.map((vector) =>
				endpointVisibility(reference, vector.src, vector.dest)
			),
			participantVectors: comparison.vectors.map((vector) => vector.participant),
			referenceVectors: comparison.vectors.map((vector) => vector.ref),
			participantLegVectors: LEG_PAIRS.map(([a, b]) => unitVector(participant, a, b)),
			referenceLegVectors: LEG_PAIRS.map(([a, b]) => unitVector(reference, a, b)),
			participantLegVisibility: LEG_PAIRS.map(([a, b]) => endpointVisibility(participant, a, b))
		});
	}
	return frames;
}
