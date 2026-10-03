import { dev } from '$app/environment';
import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import { isDevLocalRequestAllowed } from '$lib/server/client-address';
import { parseByteRange } from '$lib/server/participant-dataset-catalog';
import {
	loadVideoReviewManifest,
	validatedReviewArtifact
} from '$lib/server/research-video-manifest';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request, getClientAddress }) => {
	if (!isDevLocalRequestAllowed(request, getClientAddress(), dev)) error(404);
	if (params.artifact !== 'video' && params.artifact !== 'landmarks') error(404);
	const manifest = await loadVideoReviewManifest();
	const task = manifest?.tasksById.get(params.taskId);
	if (!manifest || !task || !['chi25_study1', 'chi25_study2'].includes(task.source_corpus))
		error(404);
	const { file, size } = await validatedReviewArtifact(manifest, task, params.artifact);
	const baseHeaders = {
		'Cache-Control': 'no-store',
		'X-Content-Type-Options': 'nosniff',
		'Content-Type': params.artifact === 'video' ? 'video/mp4' : 'application/json'
	};
	if (params.artifact === 'landmarks')
		return new Response(await readFile(file), { headers: baseHeaders });
	const rangeHeader = request.headers.get('range');
	if (rangeHeader) {
		const range = parseByteRange(rangeHeader, size);
		if (!range)
			return new Response(null, {
				status: 416,
				headers: { ...baseHeaders, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes */${size}` }
			});
		return new Response(Readable.toWeb(createReadStream(file, range)) as ReadableStream, {
			status: 206,
			headers: {
				...baseHeaders,
				'Accept-Ranges': 'bytes',
				'Content-Length': String(range.end - range.start + 1),
				'Content-Range': `bytes ${range.start}-${range.end}/${size}`
			}
		});
	}
	return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
		headers: { ...baseHeaders, 'Accept-Ranges': 'bytes', 'Content-Length': String(size) }
	});
};
