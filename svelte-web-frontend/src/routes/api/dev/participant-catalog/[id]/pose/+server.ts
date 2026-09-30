import { dev } from '$app/environment';
import { readFile } from 'node:fs/promises';
import { error } from '@sveltejs/kit';
import { isDevLocalRequestAllowed } from '$lib/server/client-address';
import {
	findParticipantRecord,
	participantDataRoot,
	validateCatalogFile
} from '$lib/server/participant-dataset-catalog';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request, getClientAddress }) => {
	if (!isDevLocalRequestAllowed(request, getClientAddress(), dev)) error(404);
	const record = await findParticipantRecord(params.id);
	if (!record) error(404);
	const file = await validateCatalogFile(record.posePath, participantDataRoot());
	if (!file) error(404);
	return new Response(await readFile(file), {
		headers: {
			'Cache-Control': 'no-store',
			'Content-Type': 'text/csv; charset=utf-8',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
