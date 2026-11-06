import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, test } from 'vitest';
import {
	importResearchSources,
	readHypothesisCatalog,
	readHypothesisState,
	recordHypothesisTurn,
	readResearchRecords,
	readUsabilityData,
	recordVideoUsabilityRating,
	readDiscrepancyObservations,
	readReferenceDanceSpans,
	recordReferenceDanceSpan,
	saveDiscrepancyObservation
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
	expect(migrated).toEqual([{ version: 5, task_id: 'existing-rating' }]);
});

test('a v3 research database keeps its hypothesis history after collection support is added', async () => {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'research-v3-migrate-'));
	folders.push(folder);
	const databasePath = path.join(folder, 'research.sqlite3');
	const { default: sqlite3 } = await import('sqlite3');
	await new Promise<void>((resolve, reject) => {
		const db = new sqlite3.Database(databasePath);
		db.exec(
			"CREATE TABLE schema_meta (version INTEGER NOT NULL); INSERT INTO schema_meta VALUES (3); CREATE TABLE hypothesis_events (event_id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, kind TEXT NOT NULL, value TEXT NOT NULL, created_at TEXT NOT NULL); INSERT INTO hypothesis_events (slug, kind, value, created_at) VALUES ('landmark-error-signals', 'status', 'investigating', '2026-10-03T00:00:00Z')",
			(error) =>
				db.close((closeError) => (error || closeError ? reject(error || closeError) : resolve()))
		);
	});
	await expect(readHypothesisCatalog(databasePath)).resolves.toMatchObject({
		definitions: [],
		metadata: []
	});
	expect((await readHypothesisState(databasePath, 'landmark-error-signals')).events).toMatchObject([
		{ kind: 'status', value: 'investigating' }
	]);
});

test('upgrading a main v2 database preserves discrepancy notes alongside hypothesis events', async () => {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'research-main-reconcile-'));
	folders.push(folder);
	const file = path.join(folder, 'research.sqlite3');
	const { default: sqlite3 } = await import('sqlite3');
	await new Promise<void>((resolve, reject) => {
		const db = new sqlite3.Database(file);
		db.exec(
			`CREATE TABLE schema_meta (version INTEGER NOT NULL); INSERT INTO schema_meta VALUES (2);
			CREATE TABLE discrepancy_observations (
			id INTEGER PRIMARY KEY AUTOINCREMENT, segment_id TEXT NOT NULL, annotator TEXT NOT NULL,
			created_at TEXT NOT NULL, start_seconds REAL NOT NULL, end_seconds REAL NOT NULL,
			note TEXT NOT NULL, direction TEXT NOT NULL, tags_json TEXT NOT NULL,
			metric TEXT NOT NULL, context_json TEXT NOT NULL);
			INSERT INTO discrepancy_observations VALUES
			(1, '${'a'.repeat(24)}', 'synthetic', '2026-11-05T00:00:00Z', 0, 1,
			'Existing discrepancy note.', 'Uncertain', '[]', 'qijia2d', '{}');`,
			(error) =>
				db.close((closeError) => (error || closeError ? reject(error || closeError) : resolve()))
		);
	});
	const receipt = await recordHypothesisTurn(file, {
		slug: 'segment-tracking-risk',
		userMessage: 'Mark this as investigating.',
		assistantReply: 'Marked investigating.',
		status: 'investigating',
		finding: null
	});
	expect(receipt.backupError).toBeNull();
	expect(await readDiscrepancyObservations(file)).toMatchObject([
		{ id: 1, note: 'Existing discrepancy note.' }
	]);
	const note = await saveDiscrepancyObservation(file, {
		segment_id: 'b'.repeat(24),
		annotator: 'synthetic',
		start_seconds: 1,
		end_seconds: 2,
		note: 'A new discrepancy note.',
		direction: 'Uncertain',
		tags: [],
		metric: 'qijia2d',
		context: {}
	});
	expect(note.backupError).toBeNull();
	expect(await readDiscrepancyObservations(file)).toHaveLength(2);
	expect((await readHypothesisState(file, 'segment-tracking-risk')).events).toMatchObject([
		{ kind: 'status', value: 'investigating' }
	]);
	expect(await readDiscrepancyObservations(receipt.snapshotPath!)).toMatchObject([
		{ id: 1, note: 'Existing discrepancy note.' }
	]);
});

test('a schema DDL failure rolls back the version marker and new tables together', async () => {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'research-schema-rollback-'));
	folders.push(folder);
	const databasePath = path.join(folder, 'research.sqlite3');
	const { default: sqlite3 } = await import('sqlite3');
	const exec = (sql: string) =>
		new Promise<void>((resolve, reject) => {
			const db = new sqlite3.Database(databasePath);
			db.exec(sql, (error) =>
				db.close((closeError) => (error || closeError ? reject(error || closeError) : resolve()))
			);
		});
	await exec(
		'CREATE TABLE schema_meta (version INTEGER NOT NULL); INSERT INTO schema_meta VALUES (3); CREATE TABLE local_video_usability_revisions (task_id TEXT)'
	);
	await expect(readHypothesisCatalog(databasePath)).rejects.toThrow('revision_id');
	const rows = await new Promise<{ version: number; new_tables: number }[]>((resolve, reject) => {
		const db = new sqlite3.Database(databasePath);
		db.all(
			"SELECT version, (SELECT COUNT(*) FROM sqlite_master WHERE name IN ('source_imports', 'manual_reviews', 'hypothesis_definitions')) AS new_tables FROM schema_meta",
			(error, rows) =>
				db.close((closeError) =>
					error || closeError
						? reject(error || closeError)
						: resolve(rows as { version: number; new_tables: number }[])
				)
		);
	});
	expect(rows).toEqual([{ version: 3, new_tables: 0 }]);
	await exec('DROP TABLE local_video_usability_revisions');
	await expect(readHypothesisCatalog(databasePath)).resolves.toEqual({
		definitions: [],
		metadata: []
	});
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

test('persists separate append-only discrepancy observations with verified backups', async () => {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'research-discrepancy-'));
	folders.push(folder);
	const file = path.join(folder, 'research.sqlite3');
	const input = {
		segment_id: 'a'.repeat(24),
		annotator: 'test',
		start_seconds: 0.5,
		end_seconds: 1.5,
		note: 'The pose lags the visible arm.',
		direction: 'Metric seems too harsh',
		tags: ['Timing / alignment'],
		metric: 'qijia2d' as const,
		context: { videoSha256: 'b'.repeat(64), configuration: { visibility: 'none' } }
	};
	const receipt = await saveDiscrepancyObservation(file, input);
	expect(receipt.backupError).toBeNull();
	await saveDiscrepancyObservation(file, { ...input, note: 'A comparison observation.' });
	const rows = await readDiscrepancyObservations(file, input.segment_id);
	expect(rows).toHaveLength(2);
	expect(rows[1]).toMatchObject(input);
	expect(await readDiscrepancyObservations(file, 'c'.repeat(24))).toEqual([]);
	expect((await readUsabilityData(file)).localRatings).toEqual([]);
	await expect(saveDiscrepancyObservation(file, { ...input, end_seconds: -1 })).rejects.toThrow(
		'Invalid discrepancy observation'
	);
	const { readdir } = await import('node:fs/promises');
	expect((await readdir(path.join(folder, 'backups'))).length).toBe(2);
});

test('reports a discrepancy backup failure without losing the saved observation', async () => {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'research-discrepancy-backup-'));
	folders.push(folder);
	const file = path.join(folder, 'research.sqlite3');
	// An ordinary file at the backup directory path simulates an unavailable backup destination.
	await writeFile(path.join(folder, 'backups'), 'blocked');
	const input = {
		segment_id: 'b'.repeat(24),
		annotator: 'test',
		start_seconds: 0,
		end_seconds: 0,
		note: 'A single-moment observation remains saved.',
		direction: 'Uncertain',
		tags: [],
		metric: 'viona2d' as const,
		context: {}
	};
	const receipt = await saveDiscrepancyObservation(file, input);
	expect(receipt.id).toBeGreaterThan(0);
	expect(receipt.backupError).toBeTruthy();
	expect(await readDiscrepancyObservations(file, input.segment_id)).toMatchObject([
		{ ...input, id: receipt.id }
	]);
});

test('a v4 database upgrades and keeps reference dance marks as append-only revisions', async () => {
	const folder = await mkdtemp(path.join(os.tmpdir(), 'research-reference-spans-'));
	folders.push(folder);
	const file = path.join(folder, 'research.sqlite3');
	const { default: sqlite3 } = await import('sqlite3');
	await new Promise<void>((resolve, reject) => {
		const db = new sqlite3.Database(file);
		db.exec(
			"CREATE TABLE schema_meta (version INTEGER NOT NULL); INSERT INTO schema_meta VALUES (4); CREATE TABLE hypothesis_events (event_id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('status', 'finding')), value TEXT NOT NULL, created_at TEXT NOT NULL); INSERT INTO hypothesis_events (slug, kind, value, created_at) VALUES ('segment-tracking-risk', 'finding', 'Synthetic v4 finding.', '2026-11-05T00:00:00Z')",
			(error) =>
				db.close((closeError) => (error || closeError ? reject(error || closeError) : resolve()))
		);
	});
	const base = {
		dance: 'bartender',
		videoFile: 'bartender.mp4',
		videoSha256: 'a'.repeat(64),
		durationSeconds: 18.867,
		annotator: 'synthetic',
		note: ''
	};
	await expect(
		recordReferenceDanceSpan(file, { ...base, startSeconds: 3, endSeconds: 2 })
	).rejects.toThrow('Invalid reference dance span');
	await expect(
		recordReferenceDanceSpan(file, { ...base, startSeconds: 0, endSeconds: 25 })
	).rejects.toThrow('Invalid reference dance span');
	const first = await recordReferenceDanceSpan(file, {
		...base,
		startSeconds: 0.5,
		endSeconds: 14.9
	});
	const second = await recordReferenceDanceSpan(file, {
		...base,
		startSeconds: 0.6,
		endSeconds: 14.8,
		note: 'Refined.'
	});
	await recordReferenceDanceSpan(file, {
		...base,
		dance: 'pajama-party',
		videoFile: 'pajamaparty-tutorial.mp4',
		durationSeconds: 13.967,
		startSeconds: 0,
		endSeconds: 13.5
	});
	expect(first.backupError).toBeNull();
	expect(first.snapshotPath).toContain('reference_dance_span_revisions');
	const spans = await readReferenceDanceSpans(file);
	expect(spans).toMatchObject([
		{ dance: 'bartender', start_seconds: 0.5, supersedes_revision_id: null },
		{
			dance: 'bartender',
			start_seconds: 0.6,
			note: 'Refined.',
			supersedes_revision_id: first.revisionId
		},
		{ dance: 'pajama-party', supersedes_revision_id: null }
	]);
	expect(second.revisionId).toBeGreaterThan(first.revisionId);
	expect((await readHypothesisState(file, 'segment-tracking-risk')).events).toMatchObject([
		{ kind: 'finding', value: 'Synthetic v4 finding.' }
	]);
});
