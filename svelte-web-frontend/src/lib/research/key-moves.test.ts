import { describe, expect, it } from 'vitest';
import {
	clipAtFrame,
	clipsForMove,
	draftProblem,
	frameToSeekTime,
	freeRange,
	slugTrackId,
	spanSeconds,
	timeToFrame,
	type KeyMove
} from './key-moves';

const clips = [
	{ clipNumber: 1, startSeconds: 0 },
	{ clipNumber: 2, startSeconds: 2.682 },
	{ clipNumber: 3, startSeconds: 5.364 }
];
const move = (overrides: Partial<KeyMove> = {}): KeyMove => ({
	id: '1921d785-1bfb-4102-a889-0c4df550e75c',
	trackId: 'moves',
	startFrame: 10,
	endFrame: 40,
	name: 'arm wave',
	description: 'both arms sweep up',
	viewMirrored: false,
	...overrides
});
const tracks = [{ id: 'moves', label: 'Key moves' }];

describe('frame timing', () => {
	it('round-trips frames through seek times at 30 and 29.97 fps', () => {
		for (const fps of [30, 29.97])
			for (const frame of [0, 1, 80, 543])
				expect(timeToFrame(frameToSeekTime(frame, fps), fps, 544)).toBe(frame);
	});
	it('reports inclusive spans in real video seconds', () => {
		expect(spanSeconds({ startFrame: 30, endFrame: 59 }, 30)).toEqual({ start: 1, end: 2 });
	});
	it('clamps to the video', () => {
		expect(timeToFrame(99, 30, 419)).toBe(418);
		expect(timeToFrame(-1, 30, 419)).toBe(0);
	});
});

describe('clip mapping', () => {
	it('uses the clip start times, not 30 ms pose timestamps', () => {
		// 2.682 s × 30 fps = frame 80.46: frame 80 is still clip 1, frame 81 is clip 2.
		expect(clipAtFrame(79, 30, clips)).toBe(1);
		expect(clipAtFrame(80, 30, clips)).toBe(2);
		expect(clipAtFrame(400, 30, clips)).toBe(3);
	});
	it('lists every clip a move overlaps', () => {
		expect(clipsForMove({ startFrame: 70, endFrame: 170 }, 30, clips)).toEqual([1, 2, 3]);
		expect(clipsForMove({ startFrame: 0, endFrame: 10 }, 30, clips)).toEqual([1]);
	});
});

describe('track editing', () => {
	it('finds the free range between neighbouring moves in one track', () => {
		const moves = [move(), move({ id: crypto.randomUUID(), startFrame: 60, endFrame: 70 })];
		expect(freeRange(moves, 'moves', 50, 100)).toEqual({ lo: 41, hi: 59 });
		expect(freeRange(moves, 'moves', 20, 100)).toBeNull();
		expect(freeRange(moves, 'other', 20, 100)).toEqual({ lo: 0, hi: 99 });
		expect(freeRange(moves, 'moves', 20, 100, moves[0].id)).toEqual({ lo: 0, hi: 59 });
	});
	it('makes unique track ids from free-text names', () => {
		expect(slugTrackId('Arms & hands', ['arms-hands'])).toBe('arms-hands-2');
		expect(slugTrackId('手', [])).toBe('track');
	});
});

describe('draftProblem', () => {
	it('accepts a valid draft and an empty one', () => {
		expect(draftProblem({ tracks, moves: [move()] }, 100)).toBeNull();
		expect(draftProblem({ tracks, moves: [] }, 100)).toBeNull();
	});
	it('rejects moves outside the video, on unknown tracks, or with extra fields', () => {
		expect(draftProblem({ tracks, moves: [move({ endFrame: 100 })] }, 100)).toMatch(/outside/);
		expect(draftProblem({ tracks, moves: [move({ trackId: 'x' })] }, 100)).toMatch(/track/);
		expect(draftProblem({ tracks, moves: [{ ...move(), extra: 1 }] }, 100)).toMatch(/Invalid/);
		expect(draftProblem({ tracks, moves: [move({ startFrame: 1.5 })] }, 100)).toMatch(/outside/);
	});
	it('rejects overlapping moves in one track but allows them across tracks', () => {
		const second = move({ id: crypto.randomUUID(), startFrame: 40, endFrame: 50 });
		expect(draftProblem({ tracks, moves: [move(), second] }, 100)).toMatch(/overlap/);
		expect(
			draftProblem(
				{
					tracks: [...tracks, { id: 'arms', label: 'Arms' }],
					moves: [move(), { ...second, trackId: 'arms' }]
				},
				100
			)
		).toBeNull();
	});
	it('rejects duplicate ids and over-long text', () => {
		expect(
			draftProblem({ tracks, moves: [move(), move({ startFrame: 50, endFrame: 60 })] }, 100)
		).toMatch(/id/);
		expect(draftProblem({ tracks, moves: [move({ name: 'x'.repeat(121) })] }, 100)).toMatch(
			/names/
		);
		expect(draftProblem({ tracks: [], moves: [] }, 100)).toMatch(/tracks/);
	});
});
