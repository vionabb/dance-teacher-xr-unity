export function isLoopbackClientAddress(address: string): boolean {
	return (
		address === '127.0.0.1' ||
		address === '::1' ||
		address.startsWith('127.') ||
		address.startsWith('::ffff:127.')
	);
}
