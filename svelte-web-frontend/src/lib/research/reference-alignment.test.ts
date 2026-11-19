import { describe, expect, it } from 'vitest';
import type { InspectorFrame } from '$lib/ai/motionmetrics/qijia2d-inspector';
import {
	pairingDriftSeconds,
	participantRowSeconds,
	timeAlignedReferenceFrame
} from './reference-alignment';

const frame = (row: number, extra: Partial<InspectorFrame> = {}): InspectorFrame => ({
	frame: row,
	landmarks: [],
	...extra
});

describe('reference alignment', () => {
	it('measures how far a 30 ms reference row lags a 1/30 s participant row', () => {
		const drift = pairingDriftSeconds(
			frame(47, { csvFrame: 47 }),
			frame(47, { csvFrame: 47, timestampMs: 1410 })
		);
		expect(drift).toBeCloseTo(47 / 30 - 1.41, 5);
		expect(pairingDriftSeconds(frame(1), null)).toBeNull();
	});

	it('falls back to the reference csv frame when there is no timestamp', () => {
		expect(pairingDriftSeconds(frame(3, { csvFrame: 6 }), frame(3, { csvFrame: 3 }))).toBeCloseTo(
			0.1,
			5
		);
	});

	it('finds the reference row at the same elapsed time', () => {
		const reference = Array.from({ length: 90 }, (_, row) =>
			frame(row, { csvFrame: row, timestampMs: row * 30 })
		);
		const participant = frame(47, { csvFrame: 47 });
		const aligned = timeAlignedReferenceFrame(reference, participantRowSeconds(participant));
		expect(aligned?.frame).toBe(52);
		expect(timeAlignedReferenceFrame([], 1)).toBeNull();
	});
});
