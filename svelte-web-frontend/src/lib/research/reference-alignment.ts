import type { InspectorFrame } from '$lib/ai/motionmetrics/qijia2d-inspector';

/**
 * Display-only helpers for the discrepancy review. The metrics pair participant and reference
 * rows by index; when the reference rows are spaced differently in time (e.g. 30 ms against
 * the participant's 1/30 s), the paired reference drifts. These helpers expose that drift and
 * find the reference row at the same elapsed time. Nothing here feeds a score.
 */
const frameSeconds = (frame: InspectorFrame, fps: number) =>
	frame.timestampMs !== undefined && Number.isFinite(frame.timestampMs)
		? frame.timestampMs / 1000
		: (frame.csvFrame ?? frame.frame) / fps;

/** Seconds the paired reference row lags the participant row (positive = reference behind). */
export function pairingDriftSeconds(
	participant: InspectorFrame | null | undefined,
	reference: InspectorFrame | null | undefined,
	participantFps = 30,
	referenceFps = 30
) {
	if (!participant || !reference) return null;
	const drift =
		(participant.csvFrame ?? participant.frame) / participantFps -
		frameSeconds(reference, referenceFps);
	return Number.isFinite(drift) ? drift : null;
}

/** The reference row whose time is nearest to `seconds` into the clip. */
export function timeAlignedReferenceFrame(
	frames: Iterable<InspectorFrame>,
	seconds: number,
	referenceFps = 30
) {
	let best: InspectorFrame | null = null;
	let bestDistance = Infinity;
	for (const frame of frames) {
		const distance = Math.abs(frameSeconds(frame, referenceFps) - seconds);
		if (distance < bestDistance) {
			best = frame;
			bestDistance = distance;
		}
	}
	return best;
}

/** Elapsed participant time for a row, as the participant video shows it. */
export const participantRowSeconds = (frame: InspectorFrame, fps = 30) =>
	(frame.csvFrame ?? frame.frame) / fps;
