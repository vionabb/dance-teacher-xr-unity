import { existsSync } from 'node:fs';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	buildParticipantCatalog,
	isLoopbackClientAddress,
	parseByteRange,
	participantDataRoot,
	referenceClipInfo,
	toParticipantPerformanceResource,
	validateCatalogFile
} from './participant-dataset-catalog';

const roots: string[] = [];
async function fixture() {
	const base = await mkdtemp(path.join(os.tmpdir(), 'participant-catalog-'));
	roots.push(base);
	const data = path.join(base, 'participant_motions');
	const refs = path.join(base, 'references');
	await mkdir(refs);
	return { base, data, refs };
}

afterEach(async () => {
	await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('participant catalog', () => {
	it('maps reference dances to approved tutorial clips and segment timing', () => {
		expect(referenceClipInfo('last-christmas', 2)).toEqual({
			fileName: 'last-christmas-tutorial.mp4',
			clipStartSeconds: 4.352,
			mirrored: true
		});
		expect(referenceClipInfo('unmapped-dance', 1)).toBeNull();
		expect(referenceClipInfo('bartender', 0)).toBeNull();
	});

	it.skipIf(
		!existsSync(path.join(participantDataRoot(), 'chi25_study1')) &&
			!existsSync(path.join(participantDataRoot(), 'chi25_study2'))
	)(
		'discovers exact participant pairs in the local cache without returning filesystem paths',
		async () => {
			const { performances } = await buildParticipantCatalog();
			const segments = performances.flatMap((performance) => performance.segments);
			expect(segments.length).toBeGreaterThan(0);
			for (const segment of segments) {
				expect(segment.id).toMatch(/^[a-f0-9]{24}$/);
				expect(JSON.stringify(segment)).not.toContain(participantDataRoot());
			}
		},
		30_000
	);

	it('pairs exact stems and groups segments by performance metadata', async () => {
		const { data, refs } = await fixture();
		const study = path.join(data, 'chi25_study1');
		const videos = path.join(study, 'videos');
		const poses = path.join(study, 'pose-raw', 'canonical', 'study1-segmented', 'pose2d');
		await Promise.all([mkdir(videos, { recursive: true }), mkdir(poses, { recursive: true })]);
		const stem =
			'user4751____performance____userstudy1--last-christmas--control____workflowid-0079b262-7575-4ae7-a377-60e21070106e____clip';
		for (const clip of [2, 1]) {
			await writeFile(path.join(videos, `${stem}${clip}.mp4`), 'video');
			await writeFile(path.join(poses, `${stem}${clip}.pose2d.raw.csv`), 'frame,x');
		}
		await writeFile(path.join(videos, 'unpaired.mp4'), 'ignored');
		await writeFile(path.join(refs, 'last-christmas.clip-1.pose.csv'), 'frame,LEFT_SHOULDER_x_2d');

		const catalog = await buildParticipantCatalog({ dataRoot: data, referenceRoot: refs });
		expect(catalog.performances).toHaveLength(1);
		expect(catalog.performances[0]).toMatchObject({
			id: expect.stringMatching(/^[a-f0-9]{24}$/),
			danceName: 'last-christmas',
			condition: 'control',
			phase: 'performance'
		});
		expect(JSON.stringify(catalog.performances)).not.toMatch(
			/userId|workflowId|poseName|videoName/
		);
		expect(catalog.performances[0].segments.map((segment) => segment.clipNumber)).toEqual([1, 2]);
		expect(catalog.performances[0].segments[0].referencePoseAvailable).toBe(true);
		expect(catalog.performances[0].segments[1].referencePoseAvailable).toBe(false);
		expect([...catalog.records.keys()][0]).toMatch(/^[a-f0-9]{24}$/);

		const [first, second] = catalog.performances[0].segments;
		const resource = toParticipantPerformanceResource(
			catalog.performances[0],
			new Map([[first.id, 12.5]])
		);
		expect(resource).toMatchObject({
			id: expect.stringMatching(/^[a-f0-9]{24}$/),
			thumbnailUrl: `/api/dev/participant-catalog/performance/${catalog.performances[0].id}/thumbnail`,
			segments: [
				{
					id: first.id,
					clipNumber: 1,
					videoUrl: `/api/dev/participant-catalog/${first.id}/video`,
					poseUrl: `/api/dev/participant-catalog/${first.id}/pose`,
					referencePoseUrl: `/api/dev/participant-catalog/${first.id}/reference-pose`,
					durationSeconds: 12.5
				},
				{
					id: second.id,
					clipNumber: 2,
					referencePoseUrl: null,
					durationSeconds: null
				}
			]
		});
		expect(JSON.stringify(resource)).not.toMatch(/userId|workflowId|videoPath|posePath/);
	});

	it('rejects files reached through a symlink outside the allowed root', async () => {
		const { base, data } = await fixture();
		const allowed = path.join(base, 'allowed');
		const outside = path.join(base, 'outside.csv');
		await mkdir(allowed);
		await writeFile(outside, 'private');
		await symlink(outside, path.join(allowed, 'linked.csv'));
		expect(await validateCatalogFile(path.join(allowed, 'linked.csv'), allowed)).toBeNull();
		expect(data).toBe(path.join(base, 'participant_motions'));
	});
});

describe('parseByteRange', () => {
	it('supports open, bounded and suffix ranges with proper clamping', () => {
		expect(parseByteRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 });
		expect(parseByteRange('bytes=7-', 10)).toEqual({ start: 7, end: 9 });
		expect(parseByteRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
		expect(parseByteRange('bytes=2-50', 10)).toEqual({ start: 2, end: 9 });
	});

	it('rejects malformed, multiple, unsatisfiable and empty-file ranges', () => {
		for (const input of [
			'items=1-2',
			'bytes=10-',
			'bytes=4-2',
			'bytes=1-2,4-5',
			'bytes=-0',
			'bytes=-'
		]) {
			expect(parseByteRange(input, 10)).toBeNull();
		}
		expect(parseByteRange('bytes=0-', 0)).toBeNull();
	});
});

describe('isLoopbackClientAddress', () => {
	it('accepts local IPv4 and IPv6 clients and rejects LAN addresses', () => {
		for (const address of ['127.0.0.1', '127.0.1.2', '::1', '::ffff:127.0.0.1']) {
			expect(isLoopbackClientAddress(address)).toBe(true);
		}
		for (const address of ['192.168.1.21', '10.0.0.2', '::ffff:192.168.1.2', 'localhost']) {
			expect(isLoopbackClientAddress(address)).toBe(false);
		}
	});
});
