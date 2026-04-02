// src/routes/+page.server.ts
import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from '../$types';

export const load: PageServerLoad = async ({ url, locals: { session }, depends }) => {
	depends('supabase:auth');

	// if the user is already logged in return them to the account page
	if (session) {
		redirect(302, '/menu');
	}

	return { server_url: url.origin, session };
};
