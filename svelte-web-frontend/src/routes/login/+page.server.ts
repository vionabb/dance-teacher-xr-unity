// src/routes/+page.server.ts
import { fail, redirect } from '@sveltejs/kit';
import { loginDestination } from '$lib/server/login-redirect';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals: { session }, depends }) => {
	depends('supabase:auth');
	const next = loginDestination(url.searchParams.get('next'));

	// if the user is already logged in return them to the account page
	if (session) {
		redirect(303, next ?? '/auth/landing');
	}

	return { server_url: url.origin, session, next };
};

export const actions: Actions = {
	signIn: async ({ request, locals }) => {
		const values = await request.formData();
		const email = values.get('email');
		const password = values.get('password');
		if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password)
			return fail(400, { message: 'Email and password are required.' });
		const { error } = await locals.supabase.auth.signInWithPassword({
			email: email.trim(),
			password
		});
		if (error) return fail(400, { message: error.message });
		// The server client writes the session cookies onto this same redirect response.
		redirect(303, loginDestination(values.get('next')) ?? '/auth/landing');
	}
};
