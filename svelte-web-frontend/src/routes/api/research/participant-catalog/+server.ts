import { json } from '@sveltejs/kit';
import { hostedCatalog, privateHeaders } from '$lib/server/hosted-analysis';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ locals }) => {
	const { performances } = await hostedCatalog(locals);
	return json({ performances }, { headers: privateHeaders });
};
