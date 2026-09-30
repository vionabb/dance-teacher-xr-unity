import { EventEmitter } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import {
	clearParticipantThumbnailCacheForTests,
	MAX_CONCURRENT_THUMBNAIL_JOBS,
	PARTICIPANT_THUMBNAIL_PLACEHOLDER,
	renderParticipantThumbnail
} from './participant-thumbnail';
import type { spawn } from 'node:child_process';
import {
	clearParticipantVideoDurationCacheForTests,
	getParticipantVideoDuration,
	parseFfprobeDuration
} from './participant-video-duration';

describe('participant video duration parsing', () => {
	it('accepts finite nonnegative ffprobe output only', () => {
		expect(parseFfprobeDuration('12.500000\n')).toBe(12.5);
		expect(parseFfprobeDuration('0')).toBe(0);
		expect(parseFfprobeDuration('N/A')).toBeNull();
		expect(parseFfprobeDuration('-1')).toBeNull();
	});
});

describe('local participant media previews', () => {
	it('uses a static placeholder when ffmpeg is unavailable', async () => {
		const thumbnail = await renderParticipantThumbnail('/unreadable/video.mp4', {
			ffmpegPath: 'missing-ffmpeg-binary-for-test'
		});
		expect(thumbnail).toBeNull();
		expect(PARTICIPANT_THUMBNAIL_PLACEHOLDER.toString()).toContain('Preview unavailable');
	});

	it('deduplicates concurrent previews and bounds the cache to file identity', async () => {
		clearParticipantThumbnailCacheForTests();
		const directory = await mkdtemp(path.join(tmpdir(), 'qijia-thumb-'));
		const videoPath = path.join(directory, 'video.mp4');
		await writeFile(videoPath, 'fixture');
		let calls = 0;
		const spawnProcess = (() => {
			calls++;
			const child = new EventEmitter() as EventEmitter & {
				stdout: PassThrough;
				kill: () => void;
			};
			child.stdout = new PassThrough();
			child.kill = () => {};
			setTimeout(() => {
				child.stdout.end(Buffer.from('jpeg-fixture'));
				child.emit('close', 0);
			}, 5);
			return child;
		}) as unknown as typeof spawn;
		try {
			const options = { spawnProcess };
			const [first, second] = await Promise.all([
				renderParticipantThumbnail(videoPath, options),
				renderParticipantThumbnail(videoPath, options)
			]);
			expect(first?.toString()).toBe('jpeg-fixture');
			expect(second).toEqual(first);
			await renderParticipantThumbnail(videoPath, options);
			expect(calls).toBe(1);
		} finally {
			clearParticipantThumbnailCacheForTests();
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('caps simultaneous ffmpeg jobs when many distinct previews arrive together', async () => {
		clearParticipantThumbnailCacheForTests();
		const directory = await mkdtemp(path.join(tmpdir(), 'qijia-thumb-burst-'));
		const videoPaths = await Promise.all(
			Array.from({ length: 8 }, async (_, index) => {
				const videoPath = path.join(directory, `${index}.mp4`);
				await writeFile(videoPath, `fixture-${index}`);
				return videoPath;
			})
		);
		let active = 0;
		let maximumActive = 0;
		let calls = 0;
		const spawnProcess = (() => {
			calls++;
			active++;
			maximumActive = Math.max(maximumActive, active);
			const child = new EventEmitter() as EventEmitter & {
				stdout: PassThrough;
				kill: () => void;
			};
			child.stdout = new PassThrough();
			child.kill = () => {};
			setTimeout(() => {
				child.stdout.end(Buffer.from('jpeg-fixture'));
				active--;
				child.emit('close', 0);
			}, 12);
			return child;
		}) as unknown as typeof spawn;
		try {
			const results = await Promise.all(
				videoPaths.map((videoPath) => renderParticipantThumbnail(videoPath, { spawnProcess }))
			);
			expect(results.every(Boolean)).toBe(true);
			expect(calls).toBe(videoPaths.length);
			expect(maximumActive).toBeLessThanOrEqual(MAX_CONCURRENT_THUMBNAIL_JOBS);
		} finally {
			clearParticipantThumbnailCacheForTests();
			await rm(directory, { recursive: true, force: true });
		}
	});

	it('uses a static placeholder when ffprobe is unavailable and caches only the scalar result', async () => {
		clearParticipantVideoDurationCacheForTests();
		const segmentId = 'a'.repeat(24);
		const first = await getParticipantVideoDuration(segmentId, '/unreadable/video.mp4', {
			ffprobePath: 'missing-ffprobe-binary-for-test'
		});
		const second = await getParticipantVideoDuration(segmentId, '/different/path.mp4', {
			ffprobePath: 'ffprobe'
		});
		expect(first).toBeNull();
		expect(second).toBeNull();
		clearParticipantVideoDurationCacheForTests();
	});
});
