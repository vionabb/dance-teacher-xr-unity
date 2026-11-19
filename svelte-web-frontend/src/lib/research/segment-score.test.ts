import { describe, expect, it } from 'vitest';
import { PoseLandmarkKeysUpperSnakeCase } from '$lib/webcam/mediapipe-utils';
import {
	formatGap,
	gapDirection,
	intervalScores,
	percentileRank,
	qijiaFrameScore,
	qijiaSegmentSamples,
	rankGaps,
	scoreGap
} from './segment-score';

const coords = (index: number, shift = 0) => [
	String(index * 10 + 5 + shift),
	String(index * 7 + 3)
];
function participantCsv(frames: number[], shift = 0) {
	const header = [
		'frame',
		...PoseLandmarkKeysUpperSnakeCase.flatMap((name) => [
			`${name}_x`,
			`${name}_y`,
			`${name}_distance`,
			`${name}_vis`
		])
	].join(',');
	const rows = frames.map((frame) =>
		[
			frame,
			...PoseLandmarkKeysUpperSnakeCase.flatMap((_, index) => [
				...coords(index, index % 2 ? shift : 0),
				'0',
				'1'
			])
		].join(',')
	);
	return [header, ...rows].join('\n');
}
function referenceCsv(count: number) {
	const header = [
		'frame',
		'timestamp',
		...PoseLandmarkKeysUpperSnakeCase.flatMap((name) => [
			`${name}_x_2d`,
			`${name}_y_2d`,
			`${name}_z_2d`,
			`${name}_visibility_2d`
		])
	].join(',');
	const rows = Array.from({ length: count }, (_, frame) =>
		[
			frame,
			frame * 33,
			...PoseLandmarkKeysUpperSnakeCase.flatMap((_, index) => [...coords(index), '0', '1'])
		].join(',')
	);
	return [header, ...rows].join('\n');
}

describe('segment score', () => {
	it('maps a frame error sum to the inspector 0–5 score', () => {
		expect(qijiaFrameScore(0, 8)).toBe(5);
		expect(qijiaFrameScore(8, 8)).toBe(2.5);
		expect(qijiaFrameScore(null, 8)).toBeNull();
		expect(qijiaFrameScore(1, 0)).toBeNull();
	});

	it('pairs rows like the inspector, keeps source-frame time, and stops at the segment duration', () => {
		const samples = qijiaSegmentSamples(participantCsv([0, 3, 30, 60]), referenceCsv(3), 1.5);
		expect(samples.map((sample) => sample.time)).toEqual([0, 0.1, 1]);
		expect(samples.every((sample) => sample.score === 5)).toBe(true);
		const cut = qijiaSegmentSamples(participantCsv([0, 30, 60]), referenceCsv(3), 1);
		expect(cut.map((sample) => sample.score)).toEqual([5, null, null]);
	});

	it('scores differing poses below 5', () => {
		const [sample] = qijiaSegmentSamples(participantCsv([0], 40), referenceCsv(1), 10);
		expect(sample.score).not.toBeNull();
		expect(sample.score!).toBeLessThan(5);
	});

	it('summarizes whole, interval and without-interval means over valid frames', () => {
		const samples = [
			{ time: 0, score: 4 },
			{ time: 1, score: 2 },
			{ time: 2, score: null },
			{ time: 3, score: 3 }
		];
		const result = intervalScores(samples, 0.5, 2);
		expect(result.whole).toEqual({ score: 3, valid: 3, total: 4 });
		expect(result.interval).toEqual({ score: 2, valid: 1, total: 2 });
		expect(result.without).toEqual({ score: 3.5, valid: 2, total: 2 });
		expect(intervalScores(samples, 0, 3).without.score).toBeNull();
	});

	it('computes gaps, mid-rank percentiles and rank gaps only when every score is known', () => {
		expect(scoreGap(2.1, 3.67)).toBeCloseTo(-1.57);
		expect(scoreGap(null, 3)).toBeNull();
		expect(formatGap(-1.567)).toBe('−1.57');
		expect(formatGap(0.5)).toBe('+0.50');
		expect(gapDirection(-1)).toBe('Metric harsher than raters');
		expect(gapDirection(0.1)).toBe('Roughly agrees');
		expect(percentileRank([1, 2, 2, 3], 2)).toBe(0.5);
		const gaps = rankGaps([
			{ id: 'a', human: 1, metric: 3 },
			{ id: 'b', human: 3, metric: 1 }
		]);
		expect(gaps.get('a')).toBe(50);
		expect(gaps.get('b')).toBe(-50);
		expect(rankGaps([{ id: 'a', human: 1, metric: null }]).size).toBe(0);
	});
});
