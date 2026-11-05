import { describe, expect, it } from 'vitest';
import { load } from './+page.server';

describe('app menu access', () => {
	it('keeps signed-in users on the menu', async () => {
		const session = { user: { id: 'signed-in-user' } };
		const result = await load({
			locals: { session }
		} as unknown as Parameters<typeof load>[0]);
		expect(result).toEqual({ session });
	});

	it('still redirects an anonymous visitor', async () => {
		await expect(
			load({ locals: { session: null } } as unknown as Parameters<typeof load>[0])
		).rejects.toMatchObject({ status: 303, location: '/' });
	});
});
