import { requireResearchStudies } from '$lib/server/research-hosted';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	setHeaders({ 'Cache-Control': 'private, no-store' });
	const studies = await requireResearchStudies(locals);
	const { data, error } = await locals.supabase
		.from('research_material')
		.select('id, scope, kind, label, bytes, source_description')
		.in('scope', ['shared', ...studies])
		.order('kind')
		.order('label');
	if (error) throw error;
	return { studies, materials: data ?? [] };
};
