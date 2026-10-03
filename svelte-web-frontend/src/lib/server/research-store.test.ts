import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
	importResearchSources,
	readHypothesisState,
	readResearchRecords,
	readUsabilityData,
	recordVideoUsabilityRating
} from './research-store';

const folders: string[] = [];
afterEach(async () => {
	await Promise.all(
		folders.splice(0).map((folder) => rm(folder, { recursive: true, force: true }))
	);
});

test('concurrent first reads initialize one usable research schema', async () => {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'research-schema-'));
	folders.push(folder);
	const databasePath = path.join(folder, 'research.sqlite3');
	await Promise.all([readResearchRecords(databasePath), readResearchRecords(databasePath)]);
	await expect(readResearchRecords(databasePath)).resolves.toMatchObject({
		sources: [],
		reviews: [],
		humanRatings: []
	});
});

test('concurrent reads migrate an existing v1 database only once', async () => {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'research-migrate-'));
	folders.push(folder);
	const databasePath = path.join(folder, 'research.sqlite3');
	const { default: sqlite3 } = await import('sqlite3');
	await new Promise<void>((resolve, reject) => {
		const db = new sqlite3.Database(databasePath);
		db.exec(
			'CREATE TABLE schema_meta (version INTEGER NOT NULL); INSERT INTO schema_meta VALUES (1); CREATE TABLE human_similarity_ratings (study TEXT NOT NULL, dance TEXT NOT NULL, user_id TEXT NOT NULL, segment_id TEXT NOT NULL, condition TEXT NOT NULL, human_rating REAL, human_rating_percentile REAL, PRIMARY KEY (study, dance, user_id, segment_id))',
			(error) =>
				db.close((closeError) => (error || closeError ? reject(error || closeError) : resolve()))
		);
	});
	await Promise.all([readResearchRecords(databasePath), readResearchRecords(databasePath)]);
	await expect(readResearchRecords(databasePath)).resolves.toMatchObject({ humanRatings: [] });
});

test('a v2 research database gains hypothesis records without losing its existing ratings', async () => {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'research-v2-migrate-'));
	folders.push(folder);
	const databasePath = path.join(folder, 'research.sqlite3');
	const { default: sqlite3 } = await import('sqlite3');
	await new Promise<void>((resolve, reject) => {
		const db = new sqlite3.Database(databasePath);
		db.exec(
			"CREATE TABLE schema_meta (version INTEGER NOT NULL); INSERT INTO schema_meta VALUES (2); CREATE TABLE local_video_usability_revisions (revision_id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT); INSERT INTO local_video_usability_revisions (task_id) VALUES ('existing-rating')",
			(error) =>
				db.close((closeError) => (error || closeError ? reject(error || closeError) : resolve()))
		);
	});
	await expect(readHypothesisState(databasePath, 'landmark-error-signals')).resolves.toMatchObject({
		events: [],
		messages: []
	});
	const migrated = await new Promise<{ version: number; task_id: string }[]>((resolve, reject) => {
		const db = new sqlite3.Database(databasePath);
		db.all(
			'SELECT schema_meta.version, local_video_usability_revisions.task_id FROM schema_meta CROSS JOIN local_video_usability_revisions',
			(error, rows) =>
				db.close((closeError) =>
					error || closeError
						? reject(error || closeError)
						: resolve(rows as { version: number; task_id: string }[])
				)
		);
	});
	expect(migrated).toEqual([{ version: 3, task_id: 'existing-rating' }]);
});

test('rejects out-of-scale human ratings before registering a source', async () => {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'research-ratings-'));
	folders.push(folder);
	const releaseManifestPath = path.join(folder, 'release.json');
	const humanRatingsPath = path.join(folder, 'ratings.csv');
	const databasePath = path.join(folder, 'research.sqlite3');
	await writeFile(
		releaseManifestPath,
		JSON.stringify({
			schema_version: '1.0',
			release_id: 'release-1',
			video_reviews: [],
			reviewed_segments: []
		})
	);
	for (const [rating, percentile] of [
		['0', '0.5'],
		['6', '0.5'],
		['4', '-0.1'],
		['4', '1.2']
	]) {
		await writeFile(
			humanRatingsPath,
			`study,dance,userId,segmentId,condition,humanRating,humanRatingPercentile,rating1,rating2,rating3\n1,dance,42,1,segmented,${rating},${percentile},2,3,3\n`
		);
		await expect(
			importResearchSources({ databasePath, releaseManifestPath, humanRatingsPath })
		).rejects.toThrow('Invalid human similarity rating row');
	}
	await expect(readResearchRecords(databasePath)).resolves.toMatchObject({ sources: [] });
});

test('new usability ratings require an exact human-rated segment and create a verified snapshot', async () => {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'research-review-'));
	folders.push(folder);
	const releaseManifestPath = path.join(folder, 'release.json');
	const humanRatingsPath = path.join(folder, 'ratings.csv');
	const databasePath = path.join(folder, 'research.sqlite3');
	await writeFile(
		releaseManifestPath,
		JSON.stringify({
			schema_version: '1.0',
			release_id: 'release-1',
			video_reviews: [],
			reviewed_segments: []
		})
	);
	await writeFile(
		humanRatingsPath,
		'study,dance,userId,segmentId,condition,humanRating,humanRatingPercentile,rating1,rating2,rating3\n2,bartender,42,2,segmented,4,0.75,2,3,3\n2,bartender,42,3,segmented,4,0.75,,,\n1,bartender,43,2,sheet,4,0.75,2,3,3\n'
	);
	await importResearchSources({ databasePath, releaseManifestPath, humanRatingsPath });
	const input = {
		manifestSha256: 'a'.repeat(64),
		taskId: 'video-usability-200',
		sourceCorpus: 'chi25_study2',
		sourceStem: 'stem-2',
		sourceFrameStart: 0,
		sourceFrameEndExclusive: 100,
		sourceVideoSha256: 'b'.repeat(64),
		landmarksSha256: 'c'.repeat(64),
		study: '2',
		dance: 'bartender',
		userId: '42',
		segmentNumber: 2,
		condition: 'segmented',
		annotator: 'researcher',
		rating: 'correctable' as const,
		note: 'One brief tracking jump.'
	};
	await expect(
		recordVideoUsabilityRating(databasePath, { ...input, segmentNumber: 3 })
	).rejects.toThrow('No exact CHI25');
	const receipt = await recordVideoUsabilityRating(databasePath, input);
	expect(receipt).toMatchObject({ revisionId: 1, backupError: null });
	expect(receipt.snapshotPath).toBeTruthy();
	expect((await readFile(receipt.snapshotPath!)).length).toBeGreaterThan(0);
	expect((await readUsabilityData(databasePath)).localRatings).toMatchObject([
		{
			task_id: 'video-usability-200',
			rating: 'correctable',
			annotator: 'researcher'
		}
	]);
	await expect(recordVideoUsabilityRating(databasePath, input)).rejects.toThrow('already has');
	await expect(
		recordVideoUsabilityRating(databasePath, {
			...input,
			taskId: 'video-usability-201',
			sourceCorpus: 'chi25_study1',
			sourceStem: 'sheet-stem',
			study: '1',
			userId: '43',
			condition: 'sheetmotion'
		})
	).resolves.toMatchObject({ revisionId: 2, backupError: null });
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
		'study,dance,userId,segmentId,condition,humanRating,humanRatingPercentile,rating1,rating2,rating3\n1,dance,42,1,segmented,4,0.75,2,3,3\n'
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
	expect(records.humanRatings).toMatchObject([
		{
			human_rating: 4,
			human_rating_percentile: 0.75,
			rating_1: 2,
			rating_2: 3,
			rating_3: 3
		}
	]);
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
		'study,dance,userId,segmentId,condition,humanRating,humanRatingPercentile,rating1,rating2,rating3\n1,dance,42,1,segmented,5,1,3,3,3\n'
	);
	await expect(importResearchSources(input)).rejects.toThrow('changed');
	expect((await readResearchRecords(databasePath)).humanRatings[0].human_rating).toBe(4);
});
