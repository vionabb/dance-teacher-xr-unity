import { error } from '@sveltejs/kit';
import { isResearchStudy, requireResearchStudies } from '$lib/server/research-hosted';
import type { PageServerLoad } from './$types';

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ locals, url, setHeaders }) => {
	setHeaders({ 'Cache-Control': 'private, no-store' });
	const studies = await requireResearchStudies(locals);
	const requested = url.searchParams.get('study');
	const study =
		requested && isResearchStudy(requested) && studies.includes(requested) ? requested : studies[0];
	const pageParam = url.searchParams.get('page') ?? '1';
	const page = /^[1-9]\d{0,5}$/.test(pageParam) ? Number(pageParam) : 1;
	const {
		data,
		count,
		error: queryError
	} = await locals.supabase
		.from('research_media')
		.select('id, study, source_stem, video_bytes, pose_bytes', { count: 'exact' })
		.eq('study', study)
		.order('source_stem')
		.range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
	if (queryError) throw queryError;
	if (page > 1 && (count ?? 0) <= (page - 1) * PAGE_SIZE) error(404);
	return {
		studies,
		study,
		page,
		pages: Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE)),
		media: data ?? []
	};
};
