import { expect, test } from 'vitest';
import { validObservation } from './discrepancy';
const input = {
	start: 0,
	end: 1,
	note: 'Arm amplitude is different.',
	direction: 'Metric seems too generous',
	tags: ['Amplitude / scale'],
	metric: 'qijia2d',
	context: { visibility: 'none' }
};
test('accepts interval and point observations without forcing a discrepancy', () => {
	expect(validObservation(input)).toBe(true);
	expect(validObservation({ ...input, end: 0, direction: 'Agreement / comparison' })).toBe(true);
});
test('rejects invalid intervals and malformed observations', () => {
	for (const changes of [
		{ start: -1 },
		{ end: -1 },
		{ end: NaN },
		{ start: Infinity },
		{ note: ' ' },
		{ note: 'a'.repeat(4001) },
		{ tags: ['invented'] },
		{ direction: 'unknown' },
		{ metric: 'unknown' },
		{ context: [] }
	])
		expect(validObservation({ ...input, ...changes })).toBe(false);
});
