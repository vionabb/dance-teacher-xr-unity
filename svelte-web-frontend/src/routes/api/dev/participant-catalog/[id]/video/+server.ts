import { dev } from '$app/environment';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import {
	findParticipantRecord,
	isLoopbackClientAddress,
	parseByteRange,
	participantDataRoot,
	validateCatalogFile
} from '$lib/server/participant-dataset-catalog';
import type { RequestHandler } from './$types';

const headers = {
	'Accept-Ranges': 'bytes',
	'Cache-Control': 'no-store',
	'Content-Type': 'video/mp4',
	'X-Content-Type-Options': 'nosniff'
};

export const GET: RequestHandler = async ({ params, request, getClientAddress }) => {
	if (!dev || !isLoopbackClientAddress(getClientAddress())) error(404);
	const record = await findParticipantRecord(params.id);
	if (!record) error(404);
	const file = await validateCatalogFile(record.videoPath, participantDataRoot());
	if (!file) error(404);
	const { size } = await stat(file);
	const rangeHeader = request.headers.get('range');
	if (rangeHeader) {
		const range = parseByteRange(rangeHeader, size);
		if (!range)
			return new Response(null, {
				status: 416,
				headers: { ...headers, 'Content-Range': `bytes */${size}` }
			});
		const stream = createReadStream(file, range);
		return new Response(Readable.toWeb(stream) as ReadableStream, {
			status: 206,
			headers: {
				...headers,
				'Content-Length': String(range.end - range.start + 1),
				'Content-Range': `bytes ${range.start}-${range.end}/${size}`
			}
		});
	}
	const stream = createReadStream(file);
	return new Response(Readable.toWeb(stream) as ReadableStream, {
		headers: { ...headers, 'Content-Length': String(size) }
	});
};

export const HEAD: RequestHandler = async ({ params, getClientAddress }) => {
	if (!dev || !isLoopbackClientAddress(getClientAddress())) error(404);
	const record = await findParticipantRecord(params.id);
	if (!record) error(404);
	const file = await validateCatalogFile(record.videoPath, participantDataRoot());
	if (!file) error(404);
	const { size } = await stat(file);
	return new Response(null, { headers: { ...headers, 'Content-Length': String(size) } });
};
