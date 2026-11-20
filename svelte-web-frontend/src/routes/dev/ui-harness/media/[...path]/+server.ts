import { dev } from '$app/environment';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { error } from '@sveltejs/kit';
import { isDevLocalRequestAllowed } from '$lib/server/client-address';
import { parseByteRange } from '$lib/server/byte-range';
import type { RequestHandler } from './$types';

/**
 * Serves media for the screenshot harness from the git-ignored `local-data/`
 * cache at the repository root, falling back to a synthetic video. Dev and
 * loopback only.
 */
const localData = path.resolve(process.cwd(), '..', 'local-data');
const roots = ['research-chi25', 'ui-harness'];
const synthetic = path.join(localData, 'ui-harness', 'synthetic.mp4');
const types: Record<string, string> = {
	'.mp4': 'video/mp4',
	'.csv': 'text/csv; charset=utf-8',
	'.json': 'application/json',
	'.png': 'image/png',
	'.jpg': 'image/jpeg'
};

async function resolveFile(requested: string) {
	const file = path.resolve(localData, requested);
	const inRoot = roots.some((root) => file.startsWith(path.join(localData, root) + path.sep));
	if (!inRoot) return null;
	for (const candidate of [file, path.extname(file) === '.mp4' ? synthetic : null]) {
		if (!candidate) continue;
		const info = await stat(candidate).catch(() => null);
		if (info?.isFile()) return { file: candidate, size: info.size };
	}
	return null;
}

export const GET: RequestHandler = async ({ params, request, getClientAddress }) => {
	if (!isDevLocalRequestAllowed(request, getClientAddress(), dev)) error(404);
	const found = await resolveFile(params.path);
	if (!found) error(404);
	const headers = {
		'Accept-Ranges': 'bytes',
		'Cache-Control': 'no-store',
		'Content-Type': types[path.extname(found.file)] ?? 'application/octet-stream',
		'X-Content-Type-Options': 'nosniff'
	};
	const rangeHeader = request.headers.get('range');
	if (rangeHeader) {
		const range = parseByteRange(rangeHeader, found.size);
		if (!range)
			return new Response(null, {
				status: 416,
				headers: { ...headers, 'Content-Range': `bytes */${found.size}` }
			});
		return new Response(Readable.toWeb(createReadStream(found.file, range)) as ReadableStream, {
			status: 206,
			headers: {
				...headers,
				'Content-Length': String(range.end - range.start + 1),
				'Content-Range': `bytes ${range.start}-${range.end}/${found.size}`
			}
		});
	}
	return new Response(Readable.toWeb(createReadStream(found.file)) as ReadableStream, {
		headers: { ...headers, 'Content-Length': String(found.size) }
	});
};
