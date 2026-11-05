import { expect, test } from 'vitest';
import { clipReviewTime, reviewPlaybackBoundary } from './review-playback';
test('clip endpoints never select the next segment', () => {
	expect(clipReviewTime(4, 4)).toBe(3.999);
	expect(clipReviewTime(-1, 4)).toBe(0);
	expect(clipReviewTime(1, 0)).toBe(0);
});
test('replay stops or loops at the chosen out point', () => {
	const range = { start: 0.5, end: 1.5, loop: false };
	expect(reviewPlaybackBoundary(1, range, 4)).toBeNull();
	expect(reviewPlaybackBoundary(1.6, range, 4)).toEqual({ time: 1.5, pause: true });
	expect(reviewPlaybackBoundary(1.6, { ...range, loop: true }, 4)).toEqual({
		time: 0.5,
		pause: false
	});
	expect(reviewPlaybackBoundary(4, { start: 0, end: 4, loop: false }, 4)).toEqual({
		time: 3.999,
		pause: true
	});
});
