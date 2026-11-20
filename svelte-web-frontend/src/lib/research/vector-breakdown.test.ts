import { describe, expect, it } from 'vitest';
import { PoseLandmarkKeysUpperSnakeCase } from '$lib/webcam/mediapipe-utils';
import { qijiaSegmentSamples } from './segment-score';
import { qijiaVectorFrames } from './vector-breakdown';

const coords = (index: number, shift = 0) => [
	String(index * 10 + 5 + shift),
	String(index * 7 + 3)
];
const participantCsv = (frames: number[], shift = 0) =>
	[
		[
			'frame',
			...PoseLandmarkKeysUpperSnakeCase.flatMap((n) => [
				`${n}_x`,
				`${n}_y`,
				`${n}_distance`,
				`${n}_vis`
			])
		].join(','),
		...frames.map((frame) =>
			[
				frame,
				...PoseLandmarkKeysUpperSnakeCase.flatMap((_, i) => [
					...coords(i, i % 2 ? shift * (frame + 1) : 0),
					'0',
					String(0.5 + (i % 2) * 0.25)
				])
			].join(',')
		)
	].join('\n');
const referenceCsv = (count: number) =>
	[
		[
			'frame',
			'timestamp',
			...PoseLandmarkKeysUpperSnakeCase.flatMap((n) => [
				`${n}_x_2d`,
				`${n}_y_2d`,
				`${n}_z_2d`,
				`${n}_visibility_2d`
			])
		].join(','),
		...Array.from({ length: count }, (_, frame) =>
			[
				frame,
				frame * 30,
				...PoseLandmarkKeysUpperSnakeCase.flatMap((_, i) => [...coords(i), '0', '1'])
			].join(',')
		)
	].join('\n');

describe('qijiaVectorFrames', () => {
	it('reproduces the segment score frames and splits them per vector', () => {
		const participant = participantCsv([0, 1, 2, 3, 30], 7);
		const reference = referenceCsv(5);
		const frames = qijiaVectorFrames(participant, reference, 1);
		const samples = qijiaSegmentSamples(participant, reference, 1).filter((s) => s.time < 1);
		expect(frames.map((f) => f.time)).toEqual(samples.map((s) => s.time));
		expect(frames.map((f) => f.score)).toEqual(samples.map((s) => s.score));
		for (const frame of frames) {
			const valid = frame.errors.filter((e): e is number => e !== null);
			expect(valid).toHaveLength(8);
			expect(5 * (1 - valid.reduce((a, b) => a + b, 0) / valid.length / 2)).toBeCloseTo(
				frame.score!
			);
			expect(frame.referenceVisibility.every((v) => v === 1)).toBe(true);
			expect(frame.participantVisibility).toEqual(
				frame.participantVisibility.map((_, v) => (v === 1 || v === 4 || v === 5 ? 0.75 : 0.5))
			);
		}
		expect(frames.some((f) => f.errors.some((e) => e! > 0))).toBe(true);
	});
});
