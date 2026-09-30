import { dev } from '$app/environment';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { isDevLocalRequestAllowed } from '$lib/server/client-address';
import {
	parseByteRange,
	referenceClipInfo,
	referenceVideoRoot,
	validateCatalogFile
} from '$lib/server/participant-dataset-catalog';
import type { RequestHandler } from './$types';

const headers = {
	'Accept-Ranges': 'bytes',
	'Cache-Control': 'no-store',
	'Content-Type': 'video/mp4',
	'X-Content-Type-Options': 'nosniff'
};

async function selectedVideo(dance: string, request: Request, getClientAddress: () => string) {
	if (!isDevLocalRequestAllowed(request, getClientAddress(), dev)) return null;
	const info = referenceClipInfo(dance, 1);
	if (!info) return null;
	return validateCatalogFile(`${referenceVideoRoot()}/${info.fileName}`, referenceVideoRoot());
}

export const GET: RequestHandler = async ({ params, request, getClientAddress }) => {
	const file = await selectedVideo(params.dance, request, getClientAddress);
	if (!file) return new Response(null, { status: 404 });
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

export const HEAD: RequestHandler = async ({ params, request, getClientAddress }) => {
	const file = await selectedVideo(params.dance, request, getClientAddress);
	if (!file) return new Response(null, { status: 404 });
	const { size } = await stat(file);
	return new Response(null, { headers: { ...headers, 'Content-Length': String(size) } });
};
