import { describe, expect, it, vi } from 'vitest';
import { checkVideoReload, refreshedVideoUrl } from './video-recovery';

describe('explicit research video recovery', () => {
	it('checks the stable endpoint without fetching the video body or retrying automatically', async () => {
		const request = vi.fn<typeof fetch>().mockResolvedValue(
			new Response(null, {
				status: 200,
				headers: { 'content-type': 'video/mp4' }
			})
		);
		expect(await checkVideoReload('/research/studies/media/record/video', request)).toEqual({
			allowed: true
		});
		expect(request).toHaveBeenCalledTimes(1);
		expect(request).toHaveBeenCalledWith(
			'/research/studies/media/record/video',
			expect.objectContaining({ method: 'HEAD', cache: 'no-store' })
		);
		const renewed = new URL(
			refreshedVideoUrl(
				'/research/studies/media/record/video?existing=1',
				'https://studio.example',
				'retry-1'
			),
			'https://studio.example'
		);
		expect(renewed.pathname).toBe('/research/studies/media/record/video');
		expect(renewed.searchParams.get('existing')).toBe('1');
		expect(renewed.searchParams.get('__research_reload')).toBe('retry-1');
		expect(() =>
			refreshedVideoUrl(
				'https://storage.example/signed?token=secret',
				'https://studio.example',
				'x'
			)
		).toThrow('stable same-origin');
	});
	it.each([
		[401, 'application/json', 'Sign in again'],
		[200, 'text/html', 'Sign in again'],
		[403, 'application/json', 'cannot access'],
		[404, 'application/json', 'Video unavailable']
	])('keeps the source paused on HTTP %s (%s)', async (status, contentType, message) => {
		const request = vi
			.fn<typeof fetch>()
			.mockResolvedValue(new Response(null, { status, headers: { 'content-type': contentType } }));
		const result = await checkVideoReload('/research/materials/file/material', request);
		expect(result.allowed).toBe(false);
		if (!result.allowed) expect(result.message).toContain(message);
		expect(request).toHaveBeenCalledTimes(1);
	});
	it('reports network failure without issuing a retry', async () => {
		const request = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));
		expect(await checkVideoReload('/video', request)).toMatchObject({ allowed: false });
		expect(request).toHaveBeenCalledTimes(1);
	});
});
