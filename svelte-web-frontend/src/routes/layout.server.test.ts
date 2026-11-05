import { describe, expect, it, vi } from 'vitest';
import { load } from './+layout.server';

vi.mock('$app/environment', () => ({ dev: false }));

function event(
	studies: string[] = [],
	userId: string | null = 'viewer',
	failure: { code: string } | null = null
) {
	const eq = vi.fn(async () => ({ data: studies.map((study) => ({ study })), error: failure }));
	const from = vi.fn(() => ({ select: () => ({ eq }) }));
	return {
		locals: {
			safeGetSession: async () => ({
				session: userId ? { user: { id: userId } } : null,
				user: userId ? { id: userId } : null
			}),
			supabase: { from }
		},
		cookies: { getAll: () => [] },
		getClientAddress: () => '127.0.0.1',
		depends: vi.fn()
	};
}

describe('shared research navigation access', () => {
	it.each([['chi25_study1'], ['chi25_study2']])(
		'shows research tools for a member of %s',
		async (study) => {
			const input = event([study]);
			const result = await load(input as unknown as Parameters<typeof load>[0]);
			expect(result).toMatchObject({ hasResearchAccess: true, localResearchAccess: false });
			expect(input.locals.supabase.from).toHaveBeenCalledWith('research_access');
			expect(input.locals.supabase.from().select().eq).toHaveBeenCalledWith('user_id', 'viewer');
			expect(input.depends).toHaveBeenCalledWith('supabase:auth');
		}
	);

	it.each([{ studies: [] }, { studies: ['unrecognized-study'] }])(
		'hides tools without a supported membership: %j',
		async ({ studies }) => {
			expect(await load(event(studies) as unknown as Parameters<typeof load>[0])).toMatchObject({
				hasResearchAccess: false
			});
		}
	);

	it('does not query membership for anonymous visitors', async () => {
		const input = event([], null);
		expect(await load(input as unknown as Parameters<typeof load>[0])).toMatchObject({
			hasResearchAccess: false
		});
		expect(input.locals.supabase.from).not.toHaveBeenCalled();
	});

	it.each(['PGRST205', '42P01'])(
		'supports installations without research tables (%s)',
		async (code) => {
			expect(
				await load(event([], 'viewer', { code }) as unknown as Parameters<typeof load>[0])
			).toMatchObject({ hasResearchAccess: false });
		}
	);

	it('surfaces unexpected membership errors', async () => {
		await expect(
			load(event([], 'viewer', { code: '08006' }) as unknown as Parameters<typeof load>[0])
		).rejects.toEqual({ code: '08006' });
	});
});
