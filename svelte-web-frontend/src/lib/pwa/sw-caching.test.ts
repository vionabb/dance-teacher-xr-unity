import { describe, expect, it } from 'vitest';
import { cacheRule, parseRange, rangeResponse } from './sw-caching';

const origin = 'https://dancetutor.example';
const rule = (href: string) => cacheRule(new URL(href, origin), origin).kind;

describe('cacheRule', () => {
	it('caches reference media only when marked as reference', () => {
		const id = 'a'.repeat(24);
		expect(rule(`/research/materials/file/${id}?reference`)).toBe('reference-media');
		expect(rule(`/research/materials/file/${id}`)).toBe('none');
	});
	it('never caches participant recordings, poses or pages', () => {
		const id = 'b'.repeat(24);
		expect(rule(`/research/studies/media/${id}/video`)).toBe('none');
		expect(rule(`/research/studies/media/${id}/pose`)).toBe('none');
		expect(rule('/research/studies')).toBe('none');
		expect(rule('/api/research/participant-catalog')).toBe('none');
	});
	it('caches public reference buckets but not other storage', () => {
		const storage = 'https://project.supabase.co/storage/v1/object';
		expect(rule(`${storage}/public/sourcevideos/dance.mp4`)).toBe('reference-media');
		expect(rule(`${storage}/public/pose2ddata/dance.json`)).toBe('reference-media');
		expect(rule(`${storage}/sign/research-chi25/x.mp4?token=t`)).toBe('none');
		expect(rule(`${storage}/public/uservideos/x.webm`)).toBe('none');
	});
	it('caches the build and MediaPipe files', () => {
		expect(rule('/_app/immutable/chunks/app.abc123.js')).toBe('immutable');
		expect(rule('/mediapipe/pose_landmarker_lite.task')).toBe('mediapipe');
		expect(rule('https://elsewhere.example/_app/immutable/x.js')).toBe('none');
	});
});

describe('range responses', () => {
	it('parses open, closed and suffix ranges', () => {
		expect(parseRange('bytes=0-', 10)).toEqual({ start: 0, end: 9 });
		expect(parseRange('bytes=2-4', 10)).toEqual({ start: 2, end: 4 });
		expect(parseRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
		expect(parseRange('bytes=5-99', 10)).toEqual({ start: 5, end: 9 });
		expect(parseRange('bytes=10-', 10)).toBeNull();
		expect(parseRange('items=0-1', 10)).toBeNull();
	});
	it('serves a 206 slice of a cached body', async () => {
		const full = new Response('0123456789', { headers: { 'Content-Type': 'video/mp4' } });
		const partial = await rangeResponse(full, 'bytes=2-4');
		expect(partial.status).toBe(206);
		expect(partial.headers.get('Content-Range')).toBe('bytes 2-4/10');
		expect(partial.headers.get('Content-Type')).toBe('video/mp4');
		expect(await partial.text()).toBe('234');
	});
	it('answers an unsatisfiable range with 416', async () => {
		const partial = await rangeResponse(new Response('abc'), 'bytes=9-');
		expect(partial.status).toBe(416);
	});
});
