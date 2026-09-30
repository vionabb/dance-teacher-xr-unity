import { dev } from '$app/environment';
import { readFile } from 'node:fs/promises';
import { error } from '@sveltejs/kit';
import {
	findParticipantRecord,
	isLoopbackClientAddress,
	referencePoseRoot,
	validateCatalogFile
} from '$lib/server/participant-dataset-catalog';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, getClientAddress }) => {
	if (!dev || !isLoopbackClientAddress(getClientAddress())) error(404);
	const record = await findParticipantRecord(params.id);
	if (!record?.referencePosePath) error(404);
	const file = await validateCatalogFile(record.referencePosePath, referencePoseRoot());
	if (!file) error(404);
	return new Response(await readFile(file), {
		headers: {
			'Cache-Control': 'no-store',
			'Content-Type': 'text/csv; charset=utf-8',
			'X-Content-Type-Options': 'nosniff'
		}
	});
};
