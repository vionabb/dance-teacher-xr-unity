import { describe, expect, it } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { requireResearchStudies } from './research-hosted';

function localsFor(studies: string[], userId: string | null) {
	return {
		user: userId ? { id: userId } : null,
		safeGetSession: async () => ({ user: null, session: null }),
		supabase: {
			from: () => ({
				select: () => ({
					eq: (field: string, value: string) => {
						expect(field).toBe('user_id');
						expect(value).toBe(userId);
						return Promise.resolve({ data: studies.map((study) => ({ study })), error: null });
					}
				})
			})
		}
	} as unknown as RequestEvent['locals'];
}

describe('hosted research route gate', () => {
	it('rejects anonymous and nonmember users', async () => {
		await expect(requireResearchStudies(localsFor([], null))).rejects.toMatchObject({
			status: 404
		});
		await expect(requireResearchStudies(localsFor([], 'ordinary-user'))).rejects.toMatchObject({
			status: 404
		});
	});

	it('returns only the studies recorded for the signed-in member', async () => {
		await expect(
			requireResearchStudies(localsFor(['chi25_study1'], 'researcher'))
		).resolves.toEqual(['chi25_study1']);
	});
});
