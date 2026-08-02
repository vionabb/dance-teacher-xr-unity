import { describe, it } from 'vitest';
import { adjustTimeArray } from './UserEvaluationTrackRecorder';

describe('adjustTimeArray', () => {
	it.concurrent('should return an empty array when given an empty array', ({ expect }) => {
		expect(adjustTimeArray([])).toEqual([]);
	});

	it.concurrent(
		'should return an array with the same values when given an array with no duplicates',
		({ expect }) => {
			expect(adjustTimeArray([0, 0.1, 0.2, 0.3])).toEqual([0, 0.1, 0.2, 0.3]);
		}
	);

	it.concurrent(
		'should return an array with linearly interpolated values when given an array with duplicates',
		({ expect }) => {
			expect(adjustTimeArray([0, 0, 0.2, 0.2, 0.2, 0.5, 0.5, 0.7])).toEqual([
				0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7
			]);
		}
	);
});
