import { redirect } from '@sveltejs/kit';

export const load = async ({ locals }) => {
	const { session, supabase } = locals;
	if (!session) {
		redirect(303, '/');
	}
	const { data, error } = await supabase.from('research_access').select('study').limit(1);
	if (!error && data?.length) redirect(303, '/research/studies');
	if (error && !['PGRST205', '42P01'].includes(error.code)) throw error;

	return {
		session
	};
};
