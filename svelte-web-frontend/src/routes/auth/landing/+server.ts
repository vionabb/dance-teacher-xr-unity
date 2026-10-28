import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const { user } = await locals.safeGetSession();
	if (!user) redirect(303, '/login');

	const { data, error } = await locals.supabase.from('research_access').select('study').limit(1);
	if (error) throw error;
	redirect(303, data?.length ? '/research/studies' : '/menu');
};
