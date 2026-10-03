import { dev } from '$app/environment';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import { isDevLocalRequestAllowed } from '$lib/server/client-address';
import { parseByteRange } from '$lib/server/participant-dataset-catalog';
import { loadFrameSource } from '$lib/server/research-frame-review';
import { validatedReviewArtifact } from '$lib/server/research-video-manifest';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request, getClientAddress }) => {
	if (!isDevLocalRequestAllowed(request, getClientAddress(), dev)) error(404);
	if (params.artifact !== 'video' && params.artifact !== 'landmarks') error(404);
	const source = await loadFrameSource();
	const task = source?.manifest.tasksById.get(params.taskId);
	if (!source || !task) error(404);
	const { file, size } = await validatedReviewArtifact(source.manifest, task, params.artifact);
	const headers = {
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff',
		'Content-Type': params.artifact === 'video' ? 'video/mp4' : 'application/json'
	};
	if (params.artifact === 'landmarks') return new Response(await readFile(file), { headers });
	const requested = request.headers.get('range');
	if (requested) {
		const range = parseByteRange(requested, size);
		if (!range)
			return new Response(null, {
				status: 416,
				headers: { ...headers, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes */${size}` }
			});
		return new Response(Readable.toWeb(createReadStream(file, range)) as ReadableStream, {
			status: 206,
			headers: {
				...headers,
				'Accept-Ranges': 'bytes',
				'Content-Length': String(range.end - range.start + 1),
				'Content-Range': `bytes ${range.start}-${range.end}/${size}`
			}
		});
	}
	return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
		headers: { ...headers, 'Accept-Ranges': 'bytes', 'Content-Length': String(size) }
	});
};
