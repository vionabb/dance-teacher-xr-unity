export function isLoopbackClientAddress(address: string): boolean {
	return (
		address === '127.0.0.1' ||
		address === '::1' ||
		address.startsWith('127.') ||
		address.startsWith('::ffff:127.')
	);
}

/** Gate dev-local media APIs against browser cross-site requests and non-loopback clients. */
export function isDevLocalRequestAllowed(
	request: Request,
	clientAddress: string,
	isDev: boolean
): boolean {
	if (!isDev || !isLoopbackClientAddress(clientAddress)) return false;
	const fetchSite = request.headers.get('sec-fetch-site');
	if (fetchSite !== null && !['same-origin', 'none'].includes(fetchSite.toLowerCase()))
		return false;
	const origin = request.headers.get('origin');
	if (!origin) return true;
	if (origin === 'null') return false;
	try {
		return new URL(origin).origin === new URL(request.url).origin;
	} catch {
		return false;
	}
}
