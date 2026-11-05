import { error } from '@sveltejs/kit';
import { requireResearchStudies } from '$lib/server/research-hosted';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, setHeaders }) => {
	setHeaders({ 'Cache-Control': 'private, no-store' });
	if (!/^[a-f0-9]{24}$/.test(params.id)) error(404);
	const studies = await requireResearchStudies(locals);
	const { data: media, error: queryError } = await locals.supabase
		.from('research_media')
		.select('id, study, source_stem')
		.eq('id', params.id)
		.maybeSingle();
	if (queryError) throw queryError;
	if (!media || !studies.includes(media.study as (typeof studies)[number])) error(404);
	return { media };
};
