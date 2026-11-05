import { error, type RequestEvent } from '@sveltejs/kit';

export const RESEARCH_STUDIES = ['chi25_study1', 'chi25_study2'] as const;
export type ResearchStudy = (typeof RESEARCH_STUDIES)[number];

export function isResearchStudy(value: string): value is ResearchStudy {
	return RESEARCH_STUDIES.includes(value as ResearchStudy);
}

/** Both route checks and Postgres RLS must agree before any media is served. */
export async function requireResearchStudies(locals: RequestEvent['locals']) {
	const user = locals.user ?? (await locals.safeGetSession()).user;
	if (!user) error(404);
	const { data, error: queryError } = await locals.supabase
		.from('research_access')
		.select('study')
		.eq('user_id', user.id);
	if (queryError) throw queryError;
	const studies = (data ?? []).map((row) => row.study).filter(isResearchStudy);
	if (studies.length === 0) error(404);
	return studies;
}
