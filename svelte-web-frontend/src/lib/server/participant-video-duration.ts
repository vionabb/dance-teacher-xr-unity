import { spawn } from 'node:child_process';
import type { EventEmitter } from 'node:events';

const DEFAULT_TIMEOUT_MS = 6000;
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_OUTPUT_BYTES = 1024;
const durationCache = new Map<string, { value: number | null; expiresAt: number }>();
const durationInflight = new Map<string, Promise<number | null>>();

export function parseFfprobeDuration(output: string): number | null {
	const value = Number(output.trim());
	return Number.isFinite(value) && value >= 0 ? value : null;
}

/** Read only container duration; cache a small scalar in process memory for repeated selections. */
export function getParticipantVideoDuration(
	segmentId: string,
	videoPath: string,
	options: { timeoutMs?: number; ffprobePath?: string } = {}
): Promise<number | null> {
	if (!/^[a-f0-9]{24}$/.test(segmentId)) return Promise.resolve(null);
	const cached = durationCache.get(segmentId);
	if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
	const pending = durationInflight.get(segmentId);
	if (pending) return pending;

	const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
	const ffprobePath = options.ffprobePath ?? 'ffprobe';
	const result = new Promise<number | null>((resolve) => {
		let child: ReturnType<typeof spawn>;
		try {
			child = spawn(
				ffprobePath,
				[
					'-v',
					'error',
					'-show_entries',
					'format=duration',
					'-of',
					'default=noprint_wrappers=1:nokey=1',
					videoPath
				],
				{ stdio: ['ignore', 'pipe', 'ignore'] }
			);
		} catch {
			resolve(null);
			return;
		}
		let output = '';
		let settled = false;
		const finish = (value: number | null) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			resolve(value);
		};
		const timeout = setTimeout(() => {
			child.kill('SIGKILL');
			finish(null);
		}, timeoutMs);
		const childEvents = child as unknown as EventEmitter;
		child.stdout?.on('data', (chunk: Buffer | string) => {
			output += chunk.toString();
			if (output.length > MAX_OUTPUT_BYTES) {
				child.kill('SIGKILL');
				finish(null);
			}
		});
		childEvents.once('error', () => finish(null));
		childEvents.once('close', (code: number | null) => {
			finish(code === 0 ? parseFfprobeDuration(output) : null);
		});
	});
	durationInflight.set(segmentId, result);
	void result.then((value) => {
		durationInflight.delete(segmentId);
		durationCache.set(segmentId, { value, expiresAt: Date.now() + CACHE_TTL_MS });
		if (durationCache.size > 256) {
			const now = Date.now();
			for (const [key, entry] of durationCache) {
				if (entry.expiresAt <= now || durationCache.size > 256) durationCache.delete(key);
			}
		}
	});
	return result;
}

export function clearParticipantVideoDurationCacheForTests() {
	durationCache.clear();
	durationInflight.clear();
}
