import { dev } from '$app/environment';
import { json } from '@sveltejs/kit';
import { getParticipantCatalog } from '$lib/server/participant-dataset-catalog';
import { isDevLocalRequestAllowed } from '$lib/server/client-address';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, getClientAddress }) => {
	if (!isDevLocalRequestAllowed(request, getClientAddress(), dev))
		return new Response(null, { status: 404 });
	const { performances } = await getParticipantCatalog();
	return json({ performances }, { headers: { 'Cache-Control': 'no-store' } });
};
