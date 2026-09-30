import { spawn } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import { stat } from 'node:fs/promises';

const MAX_THUMBNAIL_BYTES = 3 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_CACHE_ENTRIES = 64;
const MAX_CACHE_BYTES = 32 * 1024 * 1024;
export const MAX_CONCURRENT_THUMBNAIL_JOBS = 3;
const thumbnailCache = new Map<string, Buffer>();
const thumbnailInFlight = new Map<string, Promise<Buffer | null>>();
const thumbnailWaiters: Array<() => void> = [];
let thumbnailCacheBytes = 0;
let activeThumbnailJobs = 0;

async function withThumbnailSlot<T>(work: () => Promise<T>): Promise<T> {
	if (activeThumbnailJobs >= MAX_CONCURRENT_THUMBNAIL_JOBS)
		await new Promise<void>((resolve) => thumbnailWaiters.push(resolve));
	else activeThumbnailJobs++;
	try {
		return await work();
	} finally {
		const next = thumbnailWaiters.shift();
		if (next) next();
		else activeThumbnailJobs--;
	}
}

export function participantThumbnailCacheKey(filePath: string, size: number, mtimeMs: number) {
	return `${filePath}\0${size}\0${mtimeMs}`;
}

function rememberThumbnail(key: string, image: Buffer) {
	if (image.byteLength > MAX_CACHE_BYTES) return;
	const previous = thumbnailCache.get(key);
	if (previous) {
		thumbnailCacheBytes -= previous.byteLength;
		thumbnailCache.delete(key);
	}
	thumbnailCache.set(key, image);
	thumbnailCacheBytes += image.byteLength;
	while (thumbnailCache.size > MAX_CACHE_ENTRIES || thumbnailCacheBytes > MAX_CACHE_BYTES) {
		const oldest = thumbnailCache.entries().next().value as [string, Buffer] | undefined;
		if (!oldest) break;
		thumbnailCache.delete(oldest[0]);
		thumbnailCacheBytes -= oldest[1].byteLength;
	}
}

export function clearParticipantThumbnailCacheForTests() {
	thumbnailCache.clear();
	thumbnailInFlight.clear();
	thumbnailWaiters.splice(0);
	thumbnailCacheBytes = 0;
	activeThumbnailJobs = 0;
}

/** Produce a small JPEG directly from a validated video path without writing a frame to disk. */
export async function renderParticipantThumbnail(
	videoPath: string,
	options: {
		timeoutMs?: number;
		maxBytes?: number;
		ffmpegPath?: string;
		spawnProcess?: typeof spawn;
	} = {}
): Promise<Buffer | null> {
	try {
		const info = await stat(videoPath);
		if (!info.isFile()) return null;
		const key = participantThumbnailCacheKey(videoPath, info.size, info.mtimeMs);
		const cached = thumbnailCache.get(key);
		if (cached) {
			thumbnailCache.delete(key);
			thumbnailCache.set(key, cached);
			return cached;
		}
		const ongoing = thumbnailInFlight.get(key);
		if (ongoing) return ongoing;
		const work = withThumbnailSlot(() =>
			renderParticipantThumbnailUncached(videoPath, options)
		).then((image) => {
			if (image) rememberThumbnail(key, image);
			return image;
		});
		thumbnailInFlight.set(key, work);
		try {
			return await work;
		} finally {
			if (thumbnailInFlight.get(key) === work) thumbnailInFlight.delete(key);
		}
	} catch {
		return null;
	}
}

function renderParticipantThumbnailUncached(
	videoPath: string,
	options: {
		timeoutMs?: number;
		maxBytes?: number;
		ffmpegPath?: string;
		spawnProcess?: typeof spawn;
	} = {}
): Promise<Buffer | null> {
	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const maxBytes = options.maxBytes ?? MAX_THUMBNAIL_BYTES;
	const ffmpegPath = options.ffmpegPath ?? 'ffmpeg';
	const spawnProcess = options.spawnProcess ?? spawn;
	return new Promise((resolve) => {
		let child: ReturnType<typeof spawn>;
		try {
			child = spawnProcess(
				ffmpegPath,
				[
					'-hide_banner',
					'-loglevel',
					'error',
					'-ss',
					'0',
					'-i',
					videoPath,
					'-frames:v',
					'1',
					'-vf',
					'scale=480:-1',
					'-f',
					'image2pipe',
					'-vcodec',
					'mjpeg',
					'pipe:1'
				],
				{ stdio: ['ignore', 'pipe', 'ignore'] }
			);
		} catch {
			resolve(null);
			return;
		}

		const chunks: Buffer[] = [];
		let totalBytes = 0;
		let settled = false;
		let oversized = false;
		const finish = (result: Buffer | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			resolve(result);
		};
		const timeout = setTimeout(() => {
			child.kill('SIGKILL');
			finish(null);
		}, timeoutMs);
		const childEvents = child as unknown as EventEmitter;
		child.stdout?.on('data', (chunk: Buffer | string) => {
			const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			totalBytes += buffer.length;
			if (totalBytes > maxBytes) {
				oversized = true;
				child.kill('SIGKILL');
				finish(null);
				return;
			}
			chunks.push(buffer);
		});
		childEvents.once('error', () => finish(null));
		childEvents.once('close', (code: number | null) => {
			finish(code === 0 && !oversized && totalBytes > 0 ? Buffer.concat(chunks) : null);
		});
	});
}

export const PARTICIPANT_THUMBNAIL_PLACEHOLDER = Buffer.from(
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 270"><rect width="480" height="270" fill="#17212b"/><path d="M0 225h480v45H0z" fill="#233342"/><circle cx="240" cy="98" r="34" fill="#536779"/><path d="M155 225c8-62 41-96 85-96s77 34 85 96" fill="#536779"/><text x="240" y="250" fill="#d6e1e8" font-family="sans-serif" font-size="13" text-anchor="middle">Preview unavailable</text></svg>'
);
