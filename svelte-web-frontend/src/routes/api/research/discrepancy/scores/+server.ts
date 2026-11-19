import { json } from '@sveltejs/kit';
import { hostedSegmentScores, parseScoreIds, privateHeaders } from '$lib/server/hosted-analysis';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ locals, url }) =>
	json(await hostedSegmentScores(locals, parseScoreIds(url.searchParams.get('ids'))), {
		headers: privateHeaders
	});
