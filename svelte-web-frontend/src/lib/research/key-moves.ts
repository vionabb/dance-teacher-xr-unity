/**
 * Key-move annotations on the CHI25 reference videos (stage 2 of the
 * rating-relevant time spans hypothesis, PR #414).
 *
 * Viona marks the recognizable moves in each reference video as frame spans on
 * free-form tracks and describes each move in her own words. Everything here is
 * qualitative: no pose-derived features and no metric or rating results.
 *
 * Times are stored as native video frame indices (inclusive) plus the video's
 * frame rate, never from the reference pose CSV `timestamp` column, which is
 * mislabeled (30 ms steps for 1/30 s rows).
 */

export const KEY_MOVE_SCHEMA_VERSION = 1;
export const KEY_MOVE_LIMITS = {
	moves: 200,
	tracks: 12,
	name: 120,
	description: 4000,
	trackLabel: 60,
	/** JSON body limit for one saved revision. */
	bodyBytes: 400_000
} as const;

export type KeyMoveTrack = { id: string; label: string };
export type KeyMove = {
	id: string;
	trackId: string;
	/** Inclusive native video frame indices. */
	startFrame: number;
	endFrame: number;
	name: string;
	description: string;
	/** Whether the video was shown mirrored when the description was last edited. */
	viewMirrored: boolean;
};
export type KeyMoveDraft = { tracks: KeyMoveTrack[]; moves: KeyMove[] };
export type ReferenceClip = { clipNumber: number; startSeconds: number };

/**
 * Frame rate and frame count of each hosted reference video, keyed by its SHA-256.
 * Observed with ffprobe on the `research-chi25` objects on 2026-11-20; the hosted
 * catalog records 30 fps for every reference segment, but Mad at Disney is 29.97.
 */
export const REFERENCE_VIDEO_TIMING: Record<
	string,
	{ dance: string; fps: number; frameCount: number }
> = {
	e1fb6934db91f063976b5916058f29a113c4d03c059843ea0653381428533d20: {
		dance: 'bartender',
		fps: 30,
		frameCount: 566
	},
	'4624788f7b57aed7d78090f280d8528c10970a397e917a0f7d5905c63811fed9': {
		dance: 'last-christmas',
		fps: 30,
		frameCount: 452
	},
	b52049d6059f5b9468f3a516db3a2989e904aa537c25bf077270749011449fcb: {
		dance: 'mad-at-disney',
		fps: 29.97,
		frameCount: 544
	},
	'37f92d56e8e6b1c92025a039106ea35e100eb54043927c0d40232805e28a8ed0': {
		dance: 'pajama-party',
		fps: 30,
		frameCount: 419
	}
};

export const DEFAULT_TRACKS: KeyMoveTrack[] = [{ id: 'moves', label: 'Key moves' }];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRACK_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function isUuid(value: unknown): value is string {
	return typeof value === 'string' && UUID.test(value);
}

/** The middle of a frame, so seeking lands on that frame in every browser. */
export function frameToSeekTime(frame: number, fps: number) {
	return (frame + 0.5) / fps;
}
export function timeToFrame(seconds: number, fps: number, frameCount: number) {
	return clampFrame(Math.floor(seconds * fps + 1e-6), frameCount);
}
export function clampFrame(frame: number, frameCount: number) {
	return Math.min(Math.max(Math.round(frame), 0), Math.max(frameCount - 1, 0));
}
/** Start of the first frame to the end of the last frame, in real video seconds. */
export function spanSeconds(move: Pick<KeyMove, 'startFrame' | 'endFrame'>, fps: number) {
	return { start: move.startFrame / fps, end: (move.endFrame + 1) / fps };
}

/** Clip N covers [start_N, start_N+1); the last clip runs to the end of the video. */
export function clipAtFrame(frame: number, fps: number, clips: ReferenceClip[]) {
	const t = (frame + 0.5) / fps;
	let found: number | null = null;
	for (const clip of [...clips].sort((a, b) => a.startSeconds - b.startSeconds))
		if (t >= clip.startSeconds) found = clip.clipNumber;
	return found;
}
export function clipsForMove(
	move: Pick<KeyMove, 'startFrame' | 'endFrame'>,
	fps: number,
	clips: ReferenceClip[]
) {
	const first = clipAtFrame(move.startFrame, fps, clips);
	const last = clipAtFrame(move.endFrame, fps, clips);
	if (first === null || last === null) return [];
	return clips
		.map((clip) => clip.clipNumber)
		.filter((n) => n >= first && n <= last)
		.sort((a, b) => a - b);
}

export function slugTrackId(label: string, existing: string[]) {
	const base =
		label
			.toLowerCase()
			.normalize('NFKD')
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '')
			.slice(0, 32) || 'track';
	let id = base;
	for (let n = 2; existing.includes(id); n++) id = `${base}-${n}`;
	return id;
}

/** Moves in one track never overlap; returns the free frame range around `frame`. */
export function freeRange(
	moves: KeyMove[],
	trackId: string,
	frame: number,
	frameCount: number,
	ignoreId?: string
) {
	let lo = 0;
	let hi = frameCount - 1;
	for (const move of moves) {
		if (move.trackId !== trackId || move.id === ignoreId) continue;
		if (frame >= move.startFrame && frame <= move.endFrame) return null;
		if (move.endFrame < frame) lo = Math.max(lo, move.endFrame + 1);
		if (move.startFrame > frame) hi = Math.min(hi, move.startFrame - 1);
	}
	return { lo, hi };
}

export function sortedMoves(moves: KeyMove[]) {
	return [...moves].sort(
		(a, b) => a.startFrame - b.startFrame || a.endFrame - b.endFrame || a.id.localeCompare(b.id)
	);
}

/** Validates a draft against the video's frame count. Returns an error message or null. */
export function draftProblem(value: unknown, frameCount: number): string | null {
	if (!value || typeof value !== 'object') return 'Missing key moves.';
	const draft = value as Record<string, unknown>;
	const { tracks, moves } = draft;
	if (!Array.isArray(tracks) || !tracks.length || tracks.length > KEY_MOVE_LIMITS.tracks)
		return `Use 1–${KEY_MOVE_LIMITS.tracks} tracks.`;
	const trackIds = new Set<string>();
	for (const track of tracks) {
		if (!track || typeof track !== 'object') return 'Invalid track.';
		const { id, label } = track as Record<string, unknown>;
		if (typeof id !== 'string' || !TRACK_ID.test(id) || trackIds.has(id)) return 'Invalid track.';
		if (
			typeof label !== 'string' ||
			!label.trim() ||
			label.length > KEY_MOVE_LIMITS.trackLabel ||
			Object.keys(track).length !== 2
		)
			return 'Track names need 1–60 characters.';
		trackIds.add(id);
	}
	if (!Array.isArray(moves) || moves.length > KEY_MOVE_LIMITS.moves)
		return `Save at most ${KEY_MOVE_LIMITS.moves} moves.`;
	const moveIds = new Set<string>();
	for (const move of moves) {
		if (!move || typeof move !== 'object') return 'Invalid move.';
		const m = move as Record<string, unknown>;
		const keys = Object.keys(m).sort().join();
		if (keys !== 'description,endFrame,id,name,startFrame,trackId,viewMirrored')
			return 'Invalid move.';
		if (!isUuid(m.id) || moveIds.has(m.id)) return 'Invalid move id.';
		moveIds.add(m.id);
		if (typeof m.trackId !== 'string' || !trackIds.has(m.trackId)) return 'Move has no track.';
		if (
			!Number.isInteger(m.startFrame) ||
			!Number.isInteger(m.endFrame) ||
			(m.startFrame as number) < 0 ||
			(m.endFrame as number) < (m.startFrame as number) ||
			(m.endFrame as number) >= frameCount
		)
			return 'A move lies outside the video.';
		if (typeof m.name !== 'string' || m.name.length > KEY_MOVE_LIMITS.name)
			return `Move names are limited to ${KEY_MOVE_LIMITS.name} characters.`;
		if (typeof m.description !== 'string' || m.description.length > KEY_MOVE_LIMITS.description)
			return `Descriptions are limited to ${KEY_MOVE_LIMITS.description} characters.`;
		if (typeof m.viewMirrored !== 'boolean') return 'Invalid move.';
	}
	const typed = moves as KeyMove[];
	for (const track of trackIds) {
		const inTrack = sortedMoves(typed.filter((m) => m.trackId === track));
		for (let i = 1; i < inTrack.length; i++)
			if (inTrack[i].startFrame <= inTrack[i - 1].endFrame)
				return 'Moves in the same track cannot overlap. Put overlapping moves on another track.';
	}
	return null;
}
