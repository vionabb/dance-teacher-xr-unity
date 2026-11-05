import { describe, expect, it, vi } from 'vitest';
import { actions, load } from './+page.server';
import { loginDestination } from '$lib/server/login-redirect';

describe('login destination', () => {
	it('keeps the exact local research path, query and fragment', () => {
		expect(loginDestination('/metrics/qijia2d?performance=example&review=discrepancy#notes')).toBe(
			'/metrics/qijia2d?performance=example&review=discrepancy#notes'
		);
	});
	it.each([
		null,
		'https://outside.invalid',
		'//outside.invalid',
		'/\\outside.invalid',
		'/%2foutside.invalid',
		'/%5coutside.invalid',
		'/login',
		'/research/../login',
		'/%6cogin?next=/research',
		'/auth/landing',
		'/auth/callback',
		'/%zz'
	])('rejects external, malformed and authentication-loop targets: %s', (value) => {
		expect(loginDestination(value)).toBeNull();
	});
});

function signInEvent(
	next = '/research?dance=last-christmas',
	error: null | { message: string } = null
) {
	const values = new FormData();
	values.set('email', 'researcher@example.invalid');
	values.set('password', 'synthetic-password');
	values.set('next', next);
	const signInWithPassword = vi.fn(async () => ({ error }));
	return {
		event: {
			request: new Request('https://local.invalid/login?/signIn', { method: 'POST', body: values }),
			locals: { supabase: { auth: { signInWithPassword } } }
		} as unknown as Parameters<typeof actions.signIn>[0],
		signInWithPassword
	};
}

describe('server password sign-in', () => {
	it('awaits session creation before returning to the requested research URL', async () => {
		const { event, signInWithPassword } = signInEvent();
		await expect(actions.signIn(event)).rejects.toMatchObject({
			status: 303,
			location: '/research?dance=last-christmas'
		});
		expect(signInWithPassword).toHaveBeenCalledWith({
			email: 'researcher@example.invalid',
			password: 'synthetic-password'
		});
	});
	it('falls back to the role-aware landing for an unsafe target', async () => {
		await expect(actions.signIn(signInEvent('//outside.invalid').event)).rejects.toMatchObject({
			status: 303,
			location: '/auth/landing'
		});
	});
	it('keeps failed credentials on the form without echoing them', async () => {
		const result = await actions.signIn(
			signInEvent('/research', { message: 'Invalid login credentials' }).event
		);
		expect(result).toMatchObject({ status: 400, data: { message: 'Invalid login credentials' } });
		expect(JSON.stringify(result)).not.toContain('synthetic-password');
	});
	it('rejects missing fields before calling auth', async () => {
		const { event, signInWithPassword } = signInEvent();
		event.request = new Request('https://local.invalid/login?/signIn', {
			method: 'POST',
			body: new FormData()
		});
		expect(await actions.signIn(event)).toMatchObject({ status: 400 });
		expect(signInWithPassword).not.toHaveBeenCalled();
	});
	it('redirects an already signed-in visitor directly to the requested page', async () => {
		await expect(
			load({
				url: new URL('https://local.invalid/login?next=%2Fresearch'),
				locals: { session: {} },
				depends: vi.fn()
			} as unknown as Parameters<typeof load>[0])
		).rejects.toMatchObject({ status: 303, location: '/research' });
	});
});
