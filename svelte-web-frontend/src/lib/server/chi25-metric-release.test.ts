import { describe, expect, it } from 'vitest';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { METRIC_MODULES, lockedVersion, readMetricRelease } from './chi25-metric-release.js';

function copyInputs() {
	const root = mkdtempSync(path.join(tmpdir(), 'metric-release-'));
	for (const file of [...METRIC_MODULES, 'pnpm-lock.yaml'])
		cpSync(file, path.join(root, file), { recursive: true });
	return root;
}

describe('readMetricRelease', () => {
	it('pins the locked papaparse version, not the whole lockfile', () => {
		const lock = readFileSync('pnpm-lock.yaml', 'utf8');
		expect(lockedVersion(lock, 'papaparse')).toMatch(/^\d+\.\d+\.\d+/);
		expect(() => lockedVersion(lock, 'not-a-real-package')).toThrow();
		const root = copyInputs();
		try {
			const before = readMetricRelease(root).id;
			const lockPath = path.join(root, 'pnpm-lock.yaml');
			writeFileSync(
				lockPath,
				lock.replace(/@anthropic-ai\/sdk@[\d.]+/g, '@anthropic-ai/sdk@99.0.0')
			);
			expect(readMetricRelease(root).id).toBe(before);
			writeFileSync(
				lockPath,
				lock.replace(/(\n {6}papaparse:\n {8}specifier: .*\n {8}version: )\S+/, '$19.9.9')
			);
			expect(readMetricRelease(root).id).not.toBe(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});

	it('changes when metric source changes', () => {
		const root = copyInputs();
		try {
			const before = readMetricRelease(root).id;
			const file = path.join(root, METRIC_MODULES[0]);
			writeFileSync(file, readFileSync(file, 'utf8') + '\n// changed\n');
			expect(readMetricRelease(root).id).not.toBe(before);
		} finally {
			rmSync(root, { recursive: true, force: true });
		}
	});
});
