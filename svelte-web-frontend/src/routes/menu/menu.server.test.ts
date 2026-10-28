import { describe, expect, it, vi } from 'vitest';
import { load } from './+page.server';

describe('app menu access', () => {
	it.each([true, false])(
		'keeps signed-in users on the menu (research access: %s)',
		async (member) => {
			const session = { user: { id: 'signed-in-user' } };
			const from = vi.fn(() => ({
				select: () => ({
					limit: async () => ({ data: member ? [{ study: 'chi25_study1' }] : [], error: null })
				})
			}));
			const result = await load({
				locals: { session, supabase: { from } }
			} as unknown as Parameters<typeof load>[0]);
			expect(result).toEqual({ session, hasResearchAccess: member });
			expect(from).toHaveBeenCalledWith('research_access');
		}
	);

	it('still redirects an anonymous visitor', async () => {
		await expect(
			load({ locals: { session: null } } as unknown as Parameters<typeof load>[0])
		).rejects.toMatchObject({ status: 303, location: '/' });
	});
});
