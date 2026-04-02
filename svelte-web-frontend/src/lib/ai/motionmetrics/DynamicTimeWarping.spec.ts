import { describe, test } from 'vitest';
import { DynamicTimeWarping } from './DynamicTimeWarping';

describe('DynamicTimeWarping', () => {
	// Test identical sequences should yield zero distance.
	test('should calculate 0 distance for identical sequences', ({ expect }) => {
		const series = [1, 2, 3];
		const dtw = new DynamicTimeWarping<number, number>(series, series, (a, b) => Math.abs(a - b));
		expect(dtw.getDistance()).toBe(0);
	});

	// Test different sequences.
	test('should calculate correct distance for different sequences', ({ expect }) => {
		const series1 = [1, 2, 3];
		const series2 = [2, 3, 4];
		// Cost function: absolute difference.
		const dtw = new DynamicTimeWarping<number, number>(series1, series2, (a, b) => Math.abs(a - b));
		expect(dtw.getDistance()).toBe(3);
	});

	// Test that the warping path is properly computed.
	test('should return a valid warping path', ({ expect }) => {
		const series1 = [1, 3, 4, 9];
		const series2 = [1, 3, 7, 8, 9];
		const dtw = new DynamicTimeWarping<number, number>(series1, series2, (a, b) => Math.abs(a - b));
		dtw.getDistance();
		const path = dtw.getPath();
		expect(path[0]).toEqual([0, 0]);
		expect(path[path.length - 1]).toEqual([series1.length - 1, series2.length - 1]);
	});
});
