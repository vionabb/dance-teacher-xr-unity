import { describe, expect, it } from 'vitest';
import { isDevLocalRequestAllowed } from './client-address';

describe('dev-local request gate', () => {
	const localAddress = '127.0.0.1';

	it('allows loopback direct requests without browser origin metadata', () => {
		expect(
			isDevLocalRequestAllowed(
				new Request('http://127.0.0.1:5173/api/dev/participant-catalog'),
				localAddress,
				true
			)
		).toBe(true);
	});

	it('allows requests with matching origin and same-origin fetch metadata', () => {
		expect(
			isDevLocalRequestAllowed(
				new Request('http://127.0.0.1:5173/api/dev/reference-clips/bartender/video', {
					headers: {
						Origin: 'http://127.0.0.1:5173',
						'Sec-Fetch-Site': 'same-origin'
					}
				}),
				localAddress,
				true
			)
		).toBe(true);
		expect(
			isDevLocalRequestAllowed(
				new Request('http://127.0.0.1:5173/api/dev/participant-catalog', {
					headers: { 'Sec-Fetch-Site': 'none' }
				}),
				localAddress,
				true
			)
		).toBe(true);
	});

	it('rejects same-site, cross-site, malformed fetch metadata, and mismatched origins', () => {
		const url = 'http://127.0.0.1:5173/api/dev/participant-catalog/performance/abc/thumbnail';
		for (const fetchSite of ['same-site', 'cross-site', 'invalid']) {
			expect(
				isDevLocalRequestAllowed(
					new Request(url, { headers: { 'Sec-Fetch-Site': fetchSite } }),
					localAddress,
					true
				)
			).toBe(false);
		}
		expect(
			isDevLocalRequestAllowed(
				new Request(url, { headers: { Origin: 'https://attacker.example' } }),
				localAddress,
				true
			)
		).toBe(false);
	});

	it('still rejects non-loopback clients and production requests', () => {
		const request = new Request('http://127.0.0.1:5173/api/dev/participant-catalog');
		expect(isDevLocalRequestAllowed(request, '192.168.1.7', true)).toBe(false);
		expect(isDevLocalRequestAllowed(request, localAddress, false)).toBe(false);
	});
});
