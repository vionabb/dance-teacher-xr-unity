import { json } from '@sveltejs/kit';
import { hostedPerformance, privateHeaders } from '$lib/server/hosted-analysis';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ locals, params }) => {
	return json(await hostedPerformance(locals, params.id), { headers: privateHeaders });
};
