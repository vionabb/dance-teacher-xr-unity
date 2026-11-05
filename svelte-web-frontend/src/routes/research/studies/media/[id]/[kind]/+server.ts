import { error } from '@sveltejs/kit';
import { requireResearchStudies } from '$lib/server/research-hosted';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!/^[a-f0-9]{24}$/.test(params.id) || !['video', 'pose'].includes(params.kind)) error(404);
	const studies = await requireResearchStudies(locals);
	const { data: media, error: lookupError } = await locals.supabase
		.from('research_media')
		.select('study, video_path, pose_path')
		.eq('id', params.id)
		.maybeSingle();
	if (lookupError) throw lookupError;
	if (!media || !studies.includes(media.study as (typeof studies)[number])) error(404);
	const objectPath = params.kind === 'video' ? media.video_path : media.pose_path;
	if (params.kind === 'pose') {
		const { data, error: readError } = await locals.supabase.storage
			.from('research-chi25')
			.download(objectPath);
		if (readError || !data) error(404);
		return new Response(await data.arrayBuffer(), {
			headers: {
				'Cache-Control': 'private, no-store',
				'Content-Type': 'text/csv; charset=utf-8',
				'X-Content-Type-Options': 'nosniff'
			}
		});
	}
	const { data, error: signError } = await locals.supabase.storage
		.from('research-chi25')
		.createSignedUrl(objectPath, 600);
	if (signError || !data?.signedUrl) error(404);
	return new Response(null, {
		status: 302,
		headers: { Location: data.signedUrl, 'Cache-Control': 'private, no-store' }
	});
};
