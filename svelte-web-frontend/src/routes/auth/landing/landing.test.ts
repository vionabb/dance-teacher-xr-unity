import { describe, expect, it } from 'vitest';
import { GET } from './+server';

function eventFor(userId: string | null, studies: string[]) {
	return {
		locals: {
			safeGetSession: async () => ({ user: userId ? { id: userId } : null }),
			supabase: {
				from: (table: string) => {
					expect(table).toBe('research_access');
					return {
						select: (column: string) => {
							expect(column).toBe('study');
							return {
								limit: (count: number) => {
									expect(count).toBe(1);
									return Promise.resolve({
										data: studies.map((study) => ({ study })),
										error: null
									});
								}
							};
						}
					};
				}
			}
		}
	} as unknown as Parameters<typeof GET>[0];
}

describe('post-login landing', () => {
	it('sends unauthenticated users back to login', async () => {
		await expect(GET(eventFor(null, []))).rejects.toMatchObject({
			status: 303,
			location: '/login'
		});
	});

	it('sends researchers to the study browser', async () => {
		await expect(GET(eventFor('researcher', ['chi25_study1']))).rejects.toMatchObject({
			status: 303,
			location: '/research/studies'
		});
	});

	it('keeps other accounts on the learner path', async () => {
		await expect(GET(eventFor('ordinary-user', []))).rejects.toMatchObject({
			status: 303,
			location: '/menu'
		});
	});
});
