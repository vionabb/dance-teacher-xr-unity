// Caching rules for the service worker (src/service-worker.ts). Pure helpers,
// kept here so they can be unit-tested. See "Caching" in documentation/pwa.md.

/** Reference media and poses: kept across deploys, cleared on sign-out. */
export const MEDIA_CACHE = 'reference-media-v1';
/** MediaPipe model and wasm (static/mediapipe): kept across deploys, refreshed in the background. */
export const MEDIAPIPE_CACHE = 'mediapipe-v1';
/** Hashed SvelteKit build files: entries not in the current build are dropped on activate. */
export const IMMUTABLE_CACHE = 'app-immutable';

/** Public Supabase Storage buckets holding the practice dances' reference data. */
const PUBLIC_REFERENCE_BUCKETS = ['sourcevideos', 'pose2ddata', 'holisticdata', 'thumbnails'];

export type CacheRule =
	| { kind: 'reference-media' }
	| { kind: 'mediapipe' }
	| { kind: 'immutable' }
	| { kind: 'none' };

/**
 * Decides how the worker handles a GET request. Participant recordings, raw
 * participant poses, ratings and every page stay uncached: they are study data
 * or private pages.
 */
export function cacheRule(url: URL, workerOrigin: string): CacheRule {
	if (url.origin === workerOrigin) {
		if (url.pathname.startsWith('/_app/immutable/')) return { kind: 'immutable' };
		if (url.pathname.startsWith('/mediapipe/')) return { kind: 'mediapipe' };
		// The server refuses `?reference` for anything that is not a reference
		// video or reference pose, so the marker cannot cache other materials.
		if (/^\/research\/materials\/file\/[a-f0-9]{24}$/.test(url.pathname))
			return url.searchParams.has('reference') ? { kind: 'reference-media' } : { kind: 'none' };
		return { kind: 'none' };
	}
	const match = /^\/storage\/v1\/object\/public\/([^/]+)\//.exec(url.pathname);
	if (match && PUBLIC_REFERENCE_BUCKETS.includes(match[1])) return { kind: 'reference-media' };
	return { kind: 'none' };
}

/** Parses a single `bytes=` range against a body size. Returns null when unsatisfiable. */
export function parseRange(header: string, size: number): { start: number; end: number } | null {
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match || (match[1] === '' && match[2] === '')) return null;
	let start: number;
	let end: number;
	if (match[1] === '') {
		// Suffix range: the last N bytes.
		start = Math.max(0, size - Number(match[2]));
		end = size - 1;
	} else {
		start = Number(match[1]);
		end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1);
	}
	if (start > end || start >= size) return null;
	return { start, end };
}

/** Serves a byte range of a cached full response, as video elements request (Safari always does). */
export async function rangeResponse(full: Response, header: string): Promise<Response> {
	const body = await full.blob();
	const range = parseRange(header, body.size);
	const type = full.headers.get('content-type') ?? body.type;
	if (!range)
		return new Response(null, {
			status: 416,
			headers: { 'Content-Range': `bytes */${body.size}` }
		});
	return new Response(body.slice(range.start, range.end + 1, type), {
		status: 206,
		headers: {
			'Accept-Ranges': 'bytes',
			'Content-Length': String(range.end - range.start + 1),
			'Content-Range': `bytes ${range.start}-${range.end}/${body.size}`,
			'Content-Type': type
		}
	});
}
