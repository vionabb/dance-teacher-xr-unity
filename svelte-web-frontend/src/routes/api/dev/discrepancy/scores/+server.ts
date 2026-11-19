import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { isDevLocalRequestAllowed } from '$lib/server/client-address';
import { parseScoreIds } from '$lib/server/hosted-analysis';
import { localSegmentScores } from '$lib/server/research-discrepancy';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ request, getClientAddress, url }) => {
	if (!isDevLocalRequestAllowed(request, getClientAddress(), dev)) error(404);
	return json(await localSegmentScores(parseScoreIds(url.searchParams.get('ids'))), {
		headers: { 'Cache-Control': 'no-store' }
	});
};
