import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const { session, supabase } = locals;
	if (!session) {
		redirect(303, '/');
	}
	const { data, error } = await supabase.from('research_access').select('study').limit(1);
	if (error && !['PGRST205', '42P01'].includes(error.code)) throw error;

	return {
		session,
		hasResearchAccess: !error && Boolean(data?.length)
	};
};
