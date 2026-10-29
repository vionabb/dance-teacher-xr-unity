export type ReviewPlaybackRange = { start: number; end: number; loop: boolean };

/** Stay inside the selected clip even when its end is also a performance boundary. */
export function clipReviewTime(time: number, duration: number) {
	return Math.max(0, Math.min(Math.max(0, duration - 0.001), time));
}

export function reviewPlaybackBoundary(time: number, range: ReviewPlaybackRange, duration: number) {
	if (time < range.end - 0.01) return null;
	return range.loop && range.end > range.start
		? { time: clipReviewTime(range.start, duration), pause: false }
		: { time: clipReviewTime(range.end, duration), pause: true };
}
