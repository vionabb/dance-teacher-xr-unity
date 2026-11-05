/** Accept only local destinations, excluding routes that would restart authentication. */
export function loginDestination(value: unknown): string | null {
	if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return null;
	try {
		const base = 'https://local.invalid';
		const destination = new URL(value, base);
		const decoded = new URL(decodeURIComponent(value), base);
		if (
			value.includes('\\') ||
			destination.origin !== base ||
			decoded.origin !== base ||
			/^\/(?:login|auth)(?:\/|$)/.test(decoded.pathname)
		)
			return null;
		return `${destination.pathname}${destination.search}${destination.hash}`;
	} catch {
		return null;
	}
}
