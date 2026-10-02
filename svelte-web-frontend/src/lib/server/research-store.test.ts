import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import { importResearchSources, readResearchRecords } from './research-store';

const folders: string[] = [];
afterEach(async () => {
	await Promise.all(
		folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))
	);
});

test('frozen sources import repeatedly without changing files or duplicating records', async () => {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'research-store-'));
	folders.push(folder);
	const releaseManifestPath = path.join(folder, 'release.json');
	const humanRatingsPath = path.join(folder, 'ratings.csv');
	const databasePath = path.join(folder, 'research.sqlite3');
	const review = {
		segment_id: 'segment-1',
		recording_id: 'recording-1',
		source_id: 'source-1',
		source_manifest_sha256: 'a'.repeat(64),
		experiment_id: 'experiment-1',
		task_id: 'task-1',
		annotator: 'annotator-1',
		revision_id: 2,
		source_corpus: 'study-1',
		source_stem: 'clip-1',
		source_video_sha256: 'b'.repeat(64),
		source_frame_start: 0,
		source_frame_end_exclusive: 100,
		video_usability_rating: 'correctable',
		video_usability_rating_override: null,
		correction_count: 0,
		reviewed_pose_sha256: null
	};
	await writeFile(
		releaseManifestPath,
		JSON.stringify({
			schema_version: '1.0',
			release_id: 'release-1',
			video_reviews: [review],
			reviewed_segments: [
				{
					...review,
					task_id: 'frame-task-1',
					revision_id: 3,
					video_usability_rating: '',
					video_usability_rating_override: 'unusable',
					correction_count: 4,
					reviewed_pose_sha256: 'c'.repeat(64)
				}
			]
		})
	);
	await writeFile(
		humanRatingsPath,
		'study,dance,userId,segmentId,condition,humanRating,humanRatingPercentile\n1,dance,42,1,segmented,4,0.75\n'
	);
	const input = { databasePath, releaseManifestPath, humanRatingsPath };
	const before = await Promise.all(
		[releaseManifestPath, humanRatingsPath].map(async (file) =>
			createHash('sha256')
				.update(await readFile(file))
				.digest('hex')
		)
	);
	expect(await importResearchSources(input)).toEqual({
		releaseId: 'release-1',
		videoReviews: 1,
		frameReviews: 1,
		humanRatings: 1
	});
	expect(await importResearchSources(input)).toEqual({
		releaseId: 'release-1',
		videoReviews: 1,
		frameReviews: 1,
		humanRatings: 1
	});
	const records = await readResearchRecords(databasePath);
	expect(records.sources).toHaveLength(2);
	expect(records.reviews).toHaveLength(2);
	expect(records.reviews.find((row) => row.scope === 'frame')).toMatchObject({
		video_usability_rating_override: 'unusable',
		correction_count: 4
	});
	expect(records.humanRatings).toMatchObject([{ human_rating: 4, human_rating_percentile: 0.75 }]);
	expect(
		await Promise.all(
			[releaseManifestPath, humanRatingsPath].map(async (file) =>
				createHash('sha256')
					.update(await readFile(file))
					.digest('hex')
			)
		)
	).toEqual(before);

	await writeFile(
		humanRatingsPath,
		'study,dance,userId,segmentId,condition,humanRating,humanRatingPercentile\n1,dance,42,1,segmented,5,1\n'
	);
	await expect(importResearchSources(input)).rejects.toThrow('changed');
	expect((await readResearchRecords(databasePath)).humanRatings[0].human_rating).toBe(4);
});
