import { beforeEach, expect, test, vi } from 'vitest';
const state = vi.hoisted(() => ({
	canAnnotate: true,
	duplicate: false,
	prior: null as Record<string, unknown> | null,
	inserted: null as Record<string, unknown> | null
}));
vi.mock('$lib/server/hosted-analysis', async (load) => ({
	...(await load<typeof import('$lib/server/hosted-analysis')>()),
	analysisAccess: async () => ({ user: { id: 'verified-owner' } }),
	hostedTask: async () => ({
		canAnnotate: state.canAnnotate,
		inputVersion: 'a'.repeat(64),
		task: { study: 'study1' }
	})
}));
import { POST } from './+server';
const mutationId = '1921d785-1bfb-4102-a889-0c4df550e75c';
const body = () => ({
	start: 0,
	end: 1,
	note: ' A note ',
	direction: 'Uncertain',
	tags: [],
	metric: 'qijia2d',
	context: { selectedView: 'audit' },
	mutationId,
	inputVersion: 'a'.repeat(64),
	owner_id: 'forged-owner'
});
function event(payload = body()) {
	const chain = {
		select: () => chain,
		eq: () => chain,
		order: async () => ({ data: [], error: null }),
		maybeSingle: async () => ({ data: state.prior, error: null }),
		single: async () =>
			state.duplicate
				? { data: null, error: { code: '23505' } }
				: { data: { ...state.inserted, id: '1' }, error: null }
	};
	return {
		params: { segmentId: 'b'.repeat(24) },
		request: new Request('https://research.example/api/research/discrepancy/recording', {
			method: 'POST',
			headers: { origin: 'https://research.example', 'content-type': 'application/json' },
			body: JSON.stringify(payload)
		}),
		locals: {
			supabase: {
				from: () => ({
					...chain,
					insert: (row: Record<string, unknown>) => {
						state.inserted = row;
						return chain;
					}
				})
			}
		}
	} as never;
}
beforeEach(() => {
	state.canAnnotate = true;
	state.duplicate = false;
	state.prior = null;
	state.inserted = null;
});
test('save binds owner and study to the authenticated review and returns a hosted receipt', async () => {
	const response = await POST(event());
	expect(state.inserted).toMatchObject({
		owner_id: 'verified-owner',
		study: 'chi25_study1',
		note: 'A note'
	});
	expect(await response.json()).toMatchObject({ id: '1', backend: 'hosted', observations: [] });
	expect(response.headers.get('cache-control')).toBe('private, no-store');
});
test('lost-response retries return the original ID but changed payloads conflict', async () => {
	await POST(event());
	state.prior = { ...state.inserted, id: 'original-id' };
	state.duplicate = true;
	expect(await (await POST(event())).json()).toMatchObject({ id: 'original-id' });
	await expect(POST(event({ ...body(), note: 'Changed note' }))).rejects.toMatchObject({
		status: 409
	});
});
test('viewers and stale inputs cannot insert', async () => {
	state.canAnnotate = false;
	await expect(POST(event())).rejects.toMatchObject({ status: 403 });
	expect(state.inserted).toBeNull();
	state.canAnnotate = true;
	await expect(POST(event({ ...body(), inputVersion: 'c'.repeat(64) }))).rejects.toMatchObject({
		status: 409
	});
	expect(state.inserted).toBeNull();
});
