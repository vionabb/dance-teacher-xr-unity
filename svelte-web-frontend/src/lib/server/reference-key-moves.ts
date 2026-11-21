import { error, type RequestEvent } from '@sveltejs/kit';
import {
	DEFAULT_TRACKS,
	KEY_MOVE_SCHEMA_VERSION,
	REFERENCE_VIDEO_TIMING,
	draftProblem,
	isUuid,
	type KeyMove,
	type KeyMoveTrack,
	type ReferenceClip
} from '$lib/research/key-moves';
import { analysisAccess } from './hosted-analysis';

type Locals = RequestEvent['locals'];
type Segment = {
	dance: string;
	clip_number: number;
	start_seconds: number;
	video_material_id: string;
};
type Material = { id: string; label: string; sha256: string };
export type KeyMoveRevision = {
	id: number;
	base_revision_id: number | null;
	created_at: string;
	tracks: KeyMoveTrack[];
	moves: KeyMove[];
	fps: number;
	frame_count: number;
	video_sha256: string;
};
const revisionColumns =
	'id,base_revision_id,created_at,tracks,moves,fps,frame_count,video_sha256,dance,owner_id,mutation_id';
const TABLE = 'research_reference_key_move_revision';

export const DANCE_LABELS: Record<string, string> = {
	bartender: 'Bartender',
	'last-christmas': 'Last Christmas',
	'mad-at-disney': 'Mad at Disney',
	'pajama-party': 'Pajama Party'
};

async function references(locals: Locals) {
	const { data: segments, error: segmentError } = await locals.supabase
		.from('research_reference_segment')
		.select('dance,clip_number,start_seconds,video_material_id')
		.order('dance')
		.order('clip_number');
	if (segmentError) throw segmentError;
	const ids = [...new Set((segments ?? []).map((row) => row.video_material_id))];
	const { data: materials, error: materialError } = ids.length
		? await locals.supabase.from('research_material').select('id,label,sha256').in('id', ids)
		: { data: [], error: null };
	if (materialError) throw materialError;
	const byDance = new Map<string, { video: Material; clips: ReferenceClip[] }>();
	for (const row of (segments ?? []) as Segment[]) {
		const video = (materials ?? []).find((m) => m.id === row.video_material_id) as
			| Material
			| undefined;
		if (!video) continue;
		const entry = byDance.get(row.dance) ?? { video, clips: [] };
		// One dance has one tutorial video; ignore any segment registered against another.
		if (entry.video.id !== video.id) continue;
		entry.clips.push({ clipNumber: row.clip_number, startSeconds: row.start_seconds });
		byDance.set(row.dance, entry);
	}
	return byDance;
}

function timing(sha256: string) {
	return REFERENCE_VIDEO_TIMING[sha256] ?? null;
}

async function latestRevision(locals: Locals, ownerId: string, dance: string) {
	const { data, error: failure } = await locals.supabase
		.from(TABLE)
		.select(revisionColumns)
		.eq('owner_id', ownerId)
		.eq('dance', dance)
		.order('id', { ascending: false })
		.limit(1)
		.maybeSingle();
	if (failure) throw failure;
	return (data as unknown as KeyMoveRevision | null) ?? null;
}

export async function keyMoveDances(locals: Locals) {
	const access = await analysisAccess(locals);
	const [byDance, revisions] = await Promise.all([
		references(locals),
		locals.supabase
			.from(TABLE)
			.select('id,dance,created_at,moves')
			.eq('owner_id', access.user.id)
			.order('id', { ascending: false })
			.limit(2000)
	]);
	if (revisions.error) throw revisions.error;
	return [...byDance.entries()].map(([dance, { video, clips }]) => {
		const latest = (revisions.data ?? []).find((row) => row.dance === dance);
		const moves = (latest?.moves ?? []) as KeyMove[];
		return {
			dance,
			label: DANCE_LABELS[dance] ?? dance,
			videoLabel: video.label,
			clipCount: clips.length,
			timingKnown: !!timing(video.sha256),
			moveCount: moves.length,
			describedCount: moves.filter((m) => m.name.trim() || m.description.trim()).length,
			updatedAt: latest?.created_at ?? null
		};
	});
}

export async function keyMoveDance(locals: Locals, dance: string) {
	const access = await analysisAccess(locals);
	const reference = (await references(locals)).get(dance);
	if (!reference) error(404);
	const known = timing(reference.video.sha256);
	if (!known || known.dance !== dance)
		error(409, 'This reference video has no verified frame rate yet. Ask for it to be registered.');
	const latest = await latestRevision(locals, access.user.id, dance);
	return {
		dance,
		label: DANCE_LABELS[dance] ?? dance,
		videoUrl: `/research/materials/file/${reference.video.id}?reference`,
		videoLabel: reference.video.label,
		videoMaterialId: reference.video.id,
		fps: known.fps,
		frameCount: known.frameCount,
		clips: [...reference.clips].sort((a, b) => a.clipNumber - b.clipNumber),
		canEdit: access.memberships.some((row) => ['editor', 'admin'].includes(row.role)),
		revision: latest
			? {
					id: latest.id,
					createdAt: latest.created_at,
					tracks: latest.tracks,
					moves: latest.moves
				}
			: null,
		defaultTracks: DEFAULT_TRACKS
	};
}

export type KeyMoveSave = {
	mutationId: string;
	baseRevisionId: number | null;
	videoMaterialId: string;
	tracks: KeyMoveTrack[];
	moves: KeyMove[];
};

export async function saveKeyMoves(locals: Locals, dance: string, body: unknown) {
	if (!body || typeof body !== 'object') error(400);
	const save = body as Partial<KeyMoveSave>;
	if (
		!isUuid(save.mutationId) ||
		!(save.baseRevisionId === null || Number.isSafeInteger(save.baseRevisionId)) ||
		typeof save.videoMaterialId !== 'string'
	)
		error(400, 'Invalid save request.');
	const view = await keyMoveDance(locals, dance);
	if (!view.canEdit) error(403, 'Editor access is required to save key moves.');
	if (save.videoMaterialId !== view.videoMaterialId)
		error(409, 'The reference video changed. Reload this page before saving.');
	const problem = draftProblem({ tracks: save.tracks, moves: save.moves }, view.frameCount);
	if (problem) error(400, problem);
	const access = await analysisAccess(locals);
	const row = {
		owner_id: access.user.id,
		mutation_id: save.mutationId,
		base_revision_id: save.baseRevisionId,
		dance,
		video_material_id: view.videoMaterialId,
		// The database trigger replaces this with the catalog hash.
		video_sha256: '0'.repeat(64),
		fps: view.fps,
		frame_count: view.frameCount,
		schema_version: KEY_MOVE_SCHEMA_VERSION,
		tracks: (save.tracks ?? []).map((t) => ({ id: t.id, label: t.label.trim() })),
		moves: save.moves
	};
	const { data, error: failure } = await locals.supabase
		.from(TABLE)
		.insert(row)
		.select('id,created_at')
		.single();
	if (failure?.code === '23505') {
		const { data: prior, error: lookupError } = await locals.supabase
			.from(TABLE)
			.select('id,created_at,dance,base_revision_id')
			.eq('owner_id', access.user.id)
			.eq('mutation_id', save.mutationId)
			.maybeSingle();
		if (lookupError) throw lookupError;
		if (prior && prior.dance === dance && prior.base_revision_id === save.baseRevisionId)
			return { id: prior.id as number, createdAt: prior.created_at as string };
		error(
			409,
			'These key moves were changed in another tab or device. Reload to see the newest version.'
		);
	}
	if (failure) {
		if (failure.code === '42501') error(403, 'Research editing access is no longer available.');
		if (['23514', '23503', '22P02'].includes(failure.code))
			error(400, 'The key moves do not match the registered reference video.');
		throw failure;
	}
	return { id: data.id as number, createdAt: data.created_at as string };
}
