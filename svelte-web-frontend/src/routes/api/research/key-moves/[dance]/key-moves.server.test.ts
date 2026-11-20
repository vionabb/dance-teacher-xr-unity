import { beforeEach, expect, test, vi } from 'vitest';
const state = vi.hoisted(() => ({
	role: 'editor',
	insertError: null as { code: string } | null,
	prior: null as Record<string, unknown> | null,
	inserted: null as Record<string, unknown> | null
}));
vi.mock('$lib/server/hosted-analysis', async (load) => ({
	...(await load<typeof import('$lib/server/hosted-analysis')>()),
	analysisAccess: async () => ({
		user: { id: 'verified-owner' },
		memberships: [{ study: 'chi25_study1', role: state.role }]
	})
}));
import { POST } from './+server';

const VIDEO = '97c46213ae243c6f1045c82a';
const SHA = '37f92d56e8e6b1c92025a039106ea35e100eb54043927c0d40232805e28a8ed0';
const mutationId = '1921d785-1bfb-4102-a889-0c4df550e75c';
const move = {
	id: '2921d785-1bfb-4102-a889-0c4df550e75c',
	trackId: 'moves',
	startFrame: 10,
	endFrame: 40,
	name: 'arm wave',
	description: 'both arms sweep up',
	viewMirrored: false
};
const body = (overrides: Record<string, unknown> = {}) => ({
	mutationId,
	baseRevisionId: null,
	videoMaterialId: VIDEO,
	tracks: [{ id: 'moves', label: ' Key moves ' }],
	moves: [move],
	owner_id: 'forged-owner',
	...overrides
});

function table(name: string) {
	const rows: Record<string, unknown[]> = {
		research_reference_segment: [
			{ dance: 'pajama-party', clip_number: 1, start_seconds: 0, video_material_id: VIDEO },
			{ dance: 'pajama-party', clip_number: 2, start_seconds: 2.682, video_material_id: VIDEO }
		],
		research_material: [{ id: VIDEO, label: 'pajamaparty-tutorial.mp4', sha256: SHA }]
	};
	const result = { data: rows[name] ?? [], error: null };
	const chain: Record<string, unknown> = {
		select: () => chain,
		eq: () => chain,
		in: () => chain,
		order: () => chain,
		limit: () => chain,
		then: (resolve: (value: unknown) => unknown) => resolve(result),
		maybeSingle: async () => ({ data: state.prior, error: null }),
		single: async () =>
			state.insertError
				? { data: null, error: state.insertError }
				: { data: { id: 7, created_at: '2026-11-20T02:00:00Z' }, error: null },
		insert: (row: Record<string, unknown>) => {
			state.inserted = row;
			return chain;
		}
	};
	return chain;
}

function event(payload: Record<string, unknown> = body(), dance = 'pajama-party') {
	return {
		params: { dance },
		request: new Request(`https://research.example/api/research/key-moves/${dance}`, {
			method: 'POST',
			headers: { origin: 'https://research.example', 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		}),
		locals: { supabase: { from: table } }
	} as never;
}

beforeEach(() => {
	state.role = 'editor';
	state.insertError = null;
	state.prior = null;
	state.inserted = null;
});

test('save binds the owner, verified frame rate and frame count, and returns a receipt', async () => {
	const response = await POST(event());
	expect(state.inserted).toMatchObject({
		owner_id: 'verified-owner',
		dance: 'pajama-party',
		video_material_id: VIDEO,
		fps: 30,
		frame_count: 419,
		base_revision_id: null,
		tracks: [{ id: 'moves', label: 'Key moves' }],
		moves: [move]
	});
	expect(await response.json()).toEqual({ id: 7, createdAt: '2026-11-20T02:00:00Z' });
	expect(response.headers.get('cache-control')).toBe('private, no-store');
});

test('viewers cannot save', async () => {
	state.role = 'viewer';
	await expect(POST(event())).rejects.toMatchObject({ status: 403 });
	expect(state.inserted).toBeNull();
});

test('moves past the last video frame are rejected before insert', async () => {
	await expect(POST(event(body({ moves: [{ ...move, endFrame: 419 }] })))).rejects.toMatchObject({
		status: 400
	});
	expect(state.inserted).toBeNull();
});

test('a stale video binding conflicts', async () => {
	await expect(POST(event(body({ videoMaterialId: 'f'.repeat(24) })))).rejects.toMatchObject({
		status: 409
	});
});

test('a lost-response retry returns the original receipt; a stale base conflicts', async () => {
	state.insertError = { code: '23505' };
	state.prior = {
		id: 5,
		created_at: '2026-11-20T01:00:00Z',
		dance: 'pajama-party',
		base_revision_id: null
	};
	expect(await (await POST(event())).json()).toEqual({ id: 5, createdAt: '2026-11-20T01:00:00Z' });
	state.prior = null;
	await expect(POST(event(body({ baseRevisionId: 3 })))).rejects.toMatchObject({ status: 409 });
});

test('unknown dances are not found', async () => {
	await expect(POST(event(body(), 'not-a-dance'))).rejects.toMatchObject({ status: 404 });
});
