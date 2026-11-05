import { error } from '@sveltejs/kit';
import { requireResearchStudies } from '$lib/server/research-hosted';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals, params }) => {
	if (!/^[a-f0-9]{24}$/.test(params.id)) error(404);
	const studies = await requireResearchStudies(locals);
	const { data: material, error: lookupError } = await locals.supabase
		.from('research_material')
		.select('scope, kind, object_path, content_type')
		.eq('id', params.id)
		.maybeSingle();
	if (lookupError) throw lookupError;
	if (!material || (material.scope !== 'shared' && !studies.includes(material.scope))) error(404);
	if (material.kind === 'reference_video') {
		const { data, error: signError } = await locals.supabase.storage
			.from('research-chi25')
			.createSignedUrl(material.object_path, 600);
		if (signError || !data?.signedUrl) error(404);
		return new Response(null, {
			status: 302,
			headers: { Location: data.signedUrl, 'Cache-Control': 'private, no-store' }
		});
	}
	if (material.content_type !== 'text/csv') error(404);
	const { data, error: readError } = await locals.supabase.storage
		.from('research-chi25')
		.download(material.object_path);
	if (readError || !data) error(404);
	return new Response(await data.arrayBuffer(), {
		headers: {
			'Cache-Control': 'private, no-store',
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': `attachment; filename="chi25-${material.kind}-${params.id}.csv"`,
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
