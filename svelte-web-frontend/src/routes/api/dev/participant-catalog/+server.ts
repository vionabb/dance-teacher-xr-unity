import { dev } from '$app/environment';
import { json } from '@sveltejs/kit';
import {
	getParticipantCatalog,
	isLoopbackClientAddress
} from '$lib/server/participant-dataset-catalog';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ getClientAddress }) => {
	if (!dev || !isLoopbackClientAddress(getClientAddress()))
		return new Response(null, { status: 404 });
	const { performances } = await getParticipantCatalog();
	return json({ performances }, { headers: { 'Cache-Control': 'no-store' } });
};
