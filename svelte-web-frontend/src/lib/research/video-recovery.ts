export type VideoRecoveryState = 'idle' | 'error' | 'checking' | 'loading' | 'ready' | 'denied';
export type VideoSide = 'participant' | 'reference';
export type VideoRecovery = { state: VideoRecoveryState; message: string };

/** Check the authenticated stable endpoint before loading a fresh signed redirect. */
export async function checkVideoReload(
	url: string,
	request: typeof fetch = fetch
): Promise<{ allowed: true } | { allowed: false; message: string }> {
	try {
		const response = await request(url, {
			method: 'HEAD',
			cache: 'no-store',
			signal: AbortSignal.timeout(10_000)
		});
		if (response.status === 401 || response.headers.get('content-type')?.includes('text/html'))
			return {
				allowed: false,
				message: 'Sign in again to reload this video.'
			};
		if (response.status === 403)
			return {
				allowed: false,
				message:
					'Your account cannot access this video. Check your research access before retrying.'
			};
		if (!response.ok)
			return {
				allowed: false,
				message: 'Video unavailable. Check your connection and try reloading again.'
			};
		return { allowed: true };
	} catch {
		return {
			allowed: false,
			message: 'Could not check video access. Check your connection and try again.'
		};
	}
}

/** Bypass a cached redirect without changing the immutable recording/material identity. */
export function refreshedVideoUrl(url: string, origin: string, token: string) {
	const fresh = new URL(url, origin);
	if (fresh.origin !== origin || !['http:', 'https:'].includes(fresh.protocol))
		throw new Error('Video reload requires a stable same-origin media URL.');
	fresh.searchParams.set('__research_reload', token);
	return `${fresh.pathname}${fresh.search}`;
}
