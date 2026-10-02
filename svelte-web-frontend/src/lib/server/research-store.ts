import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import sqlite3 from 'sqlite3';
import Papa from 'papaparse';
import { humanSimilarityCondition } from './research-identity.js';

export const RESEARCH_SCHEMA_VERSION = 2;

export type SourceRecord = {
	kind: string;
	source_sha256: string;
	source_version: string;
	imported_at: string;
};
export type ManualReviewRecord = {
	release_id: string;
	scope: string;
	segment_id: string;
	source_corpus: string;
	source_stem: string;
	source_frame_start: number;
	source_frame_end_exclusive: number;
	video_usability_rating: string | null;
	video_usability_rating_override: string | null;
	correction_count: number;
	source_id: string;
	source_manifest_sha256: string;
	experiment_id: string;
	task_id: string;
	annotator: string;
	revision_id: number;
	source_video_sha256: string;
	reviewed_pose_sha256: string | null;
};
export type HumanRatingRecord = {
	study: string;
	dance: string;
	user_id: string;
	segment_id: string;
	condition: string;
	human_rating: number | null;
	human_rating_percentile: number | null;
	rating_1: number | null;
	rating_2: number | null;
	rating_3: number | null;
};

export type LocalVideoUsabilityRating = {
	revision_id: number;
	manifest_sha256: string;
	task_id: string;
	source_corpus: string;
	source_stem: string;
	source_frame_start: number;
	source_frame_end_exclusive: number;
	source_video_sha256: string;
	landmarks_sha256: string;
	annotator: string;
	rating: string;
	note: string;
	created_at: string;
};

type Review = {
	segment_id: string;
	recording_id: string;
	source_id: string;
	source_manifest_sha256: string;
	experiment_id: string;
	task_id: string;
	annotator: string;
	revision_id: number;
	source_corpus: string;
	source_stem: string;
	source_video_sha256: string;
	source_frame_start: number;
	source_frame_end_exclusive: number;
	video_usability_rating: string | null;
	video_usability_rating_override: string | null;
	correction_count: number;
	reviewed_pose_sha256: string | null;
};

type Release = {
	schema_version: string;
	release_id: string;
	video_reviews: Review[];
	reviewed_segments: Review[];
};

function sha256(bytes: Buffer): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function assertReview(review: Review): void {
	for (const key of [
		'segment_id',
		'recording_id',
		'source_id',
		'source_manifest_sha256',
		'experiment_id',
		'task_id',
		'annotator',
		'source_corpus',
		'source_stem',
		'source_video_sha256'
	] as const) {
		if (typeof review[key] !== 'string' || !review[key]) throw new Error(`Review has no ${key}`);
	}
	for (const hash of [review.source_manifest_sha256, review.source_video_sha256]) {
		if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Review has an invalid source SHA-256');
	}
	if (review.reviewed_pose_sha256 && !/^[a-f0-9]{64}$/.test(review.reviewed_pose_sha256))
		throw new Error('Review has an invalid reviewed-pose SHA-256');
	if (!Number.isSafeInteger(review.revision_id) || review.revision_id < 0)
		throw new Error('Review has an invalid revision');
	if (
		!Number.isSafeInteger(review.source_frame_start) ||
		!Number.isSafeInteger(review.source_frame_end_exclusive) ||
		review.source_frame_start < 0 ||
		review.source_frame_end_exclusive <= review.source_frame_start
	)
		throw new Error('Review has an invalid source-frame interval');
}

function openDatabase(file: string): Promise<sqlite3.Database> {
	return new Promise((resolve, reject) => {
		const db = new sqlite3.Database(file, (error) => (error ? reject(error) : resolve(db)));
	});
}

function run(db: sqlite3.Database, sql: string, values: unknown[] = []): Promise<void> {
	return new Promise((resolve, reject) => {
		db.run(sql, values, (error) => (error ? reject(error) : resolve()));
	});
}

function all<T>(db: sqlite3.Database, sql: string, values: unknown[] = []): Promise<T[]> {
	return new Promise((resolve, reject) => {
		db.all(sql, values, (error, rows) => (error ? reject(error) : resolve(rows as T[])));
	});
}

function close(db: sqlite3.Database): Promise<void> {
	return new Promise((resolve, reject) => db.close((error) => (error ? reject(error) : resolve())));
}

async function snapshotAfterRating(
	db: sqlite3.Database,
	databaseFile: string,
	revisionId: number
): Promise<string> {
	const folder = path.join(path.dirname(databaseFile), 'backups');
	await mkdir(folder, { recursive: true });
	const snapshot = path.join(folder, `research-after-revision-${revisionId}-${Date.now()}.sqlite3`);
	await run(db, 'VACUUM INTO ?', [snapshot]);
	const copy = await openDatabase(snapshot);
	try {
		const integrity = await all<{ integrity_check: string }>(copy, 'PRAGMA integrity_check');
		const revision = await all(
			copy,
			'SELECT 1 FROM local_video_usability_revisions WHERE revision_id = ?',
			[revisionId]
		);
		if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok' || revision.length !== 1)
			throw new Error('Research database snapshot failed verification');
	} finally {
		await close(copy);
	}
	return snapshot;
}

export function researchDatabasePath(): string {
	return path.resolve(
		process.env.RESEARCH_SQLITE_PATH ??
			path.resolve(process.cwd(), '..', 'local-data', 'research.sqlite3')
	);
}

async function withDatabase<T>(
	file: string,
	action: (db: sqlite3.Database) => Promise<T>
): Promise<T> {
	await mkdir(path.dirname(file), { recursive: true });
	const db = await openDatabase(file);
	try {
		await run(db, 'PRAGMA foreign_keys = ON');
		await run(db, 'PRAGMA busy_timeout = 5000');
		await run(db, `CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER NOT NULL)`);
		const versions = await all<{ version: number }>(db, 'SELECT version FROM schema_meta');
		if (versions.length === 0)
			await run(db, 'INSERT INTO schema_meta VALUES (?)', [RESEARCH_SCHEMA_VERSION]);
		else if (versions.length === 1 && versions[0].version === 1) {
			await run(db, 'BEGIN IMMEDIATE');
			try {
				for (const column of ['rating_1', 'rating_2', 'rating_3'])
					await run(db, `ALTER TABLE human_similarity_ratings ADD COLUMN ${column} INTEGER`);
				await run(db, 'UPDATE schema_meta SET version = ?', [RESEARCH_SCHEMA_VERSION]);
				await run(db, 'COMMIT');
			} catch (migrationError) {
				await run(db, 'ROLLBACK');
				throw migrationError;
			}
		} else if (versions.length !== 1 || versions[0].version !== RESEARCH_SCHEMA_VERSION)
			throw new Error(
				`Unsupported research database schema version: ${versions.map((row) => row.version).join(', ')}`
			);
		await run(
			db,
			`CREATE TABLE IF NOT EXISTS source_imports (
			kind TEXT PRIMARY KEY, source_path TEXT NOT NULL, source_sha256 TEXT NOT NULL,
			source_version TEXT NOT NULL, imported_at TEXT NOT NULL)`
		);
		await run(
			db,
			`CREATE TABLE IF NOT EXISTS manual_reviews (
			release_id TEXT NOT NULL, scope TEXT NOT NULL, segment_id TEXT NOT NULL,
			recording_id TEXT NOT NULL, source_id TEXT NOT NULL, source_manifest_sha256 TEXT NOT NULL,
			experiment_id TEXT NOT NULL, task_id TEXT NOT NULL, annotator TEXT NOT NULL,
			revision_id INTEGER NOT NULL, source_corpus TEXT NOT NULL, source_stem TEXT NOT NULL,
			source_video_sha256 TEXT NOT NULL, source_frame_start INTEGER NOT NULL,
			source_frame_end_exclusive INTEGER NOT NULL, video_usability_rating TEXT,
			video_usability_rating_override TEXT, correction_count INTEGER NOT NULL,
			reviewed_pose_sha256 TEXT,
			PRIMARY KEY (release_id, scope, segment_id))`
		);
		await run(
			db,
			`CREATE TABLE IF NOT EXISTS human_similarity_ratings (
			study TEXT NOT NULL, dance TEXT NOT NULL, user_id TEXT NOT NULL,
			segment_id TEXT NOT NULL, condition TEXT NOT NULL,
			human_rating REAL, human_rating_percentile REAL,
			rating_1 INTEGER, rating_2 INTEGER, rating_3 INTEGER,
			PRIMARY KEY (study, dance, user_id, segment_id))`
		);
		await run(
			db,
			`CREATE TABLE IF NOT EXISTS local_video_usability_revisions (
			revision_id INTEGER PRIMARY KEY AUTOINCREMENT,
			manifest_sha256 TEXT NOT NULL, task_id TEXT NOT NULL,
			source_corpus TEXT NOT NULL, source_stem TEXT NOT NULL,
			source_frame_start INTEGER NOT NULL, source_frame_end_exclusive INTEGER NOT NULL,
			source_video_sha256 TEXT NOT NULL, landmarks_sha256 TEXT NOT NULL,
			annotator TEXT NOT NULL, rating TEXT NOT NULL, note TEXT NOT NULL,
			created_at TEXT NOT NULL, supersedes_revision_id INTEGER)`
		);
		await run(
			db,
			`CREATE INDEX IF NOT EXISTS local_video_usability_task
			ON local_video_usability_revisions(task_id, revision_id DESC)`
		);
		return await action(db);
	} finally {
		await close(db);
	}
}

export async function importResearchSources(input: {
	databasePath: string;
	releaseManifestPath: string;
	humanRatingsPath: string;
}): Promise<{
	releaseId: string;
	videoReviews: number;
	frameReviews: number;
	humanRatings: number;
}> {
	const [manifestBytes, ratingsBytes] = await Promise.all([
		readFile(input.releaseManifestPath),
		readFile(input.humanRatingsPath)
	]);
	const release = JSON.parse(manifestBytes.toString('utf8')) as Release;
	if (
		release.schema_version !== '1.0' ||
		typeof release.release_id !== 'string' ||
		!release.release_id ||
		!Array.isArray(release.video_reviews) ||
		!Array.isArray(release.reviewed_segments)
	)
		throw new Error('Unsupported manual-review release manifest');
	for (const review of [...release.video_reviews, ...release.reviewed_segments])
		assertReview(review);
	const parsed = Papa.parse<Record<string, string>>(
		ratingsBytes.toString('utf8').replace(/^\uFEFF/, ''),
		{
			header: true,
			skipEmptyLines: true
		}
	);
	if (
		parsed.errors.length ||
		![
			'study',
			'dance',
			'userId',
			'segmentId',
			'condition',
			'humanRating',
			'humanRatingPercentile',
			'rating1',
			'rating2',
			'rating3'
		].every((key) => parsed.meta.fields?.includes(key))
	)
		throw new Error('Invalid human similarity ratings CSV');
	const ratings = parsed.data;
	for (const row of ratings) {
		if (
			!row.study ||
			!row.dance ||
			!row.userId ||
			!row.segmentId ||
			!row.condition ||
			(row.humanRating && !Number.isFinite(Number(row.humanRating))) ||
			(row.humanRatingPercentile && !Number.isFinite(Number(row.humanRatingPercentile))) ||
			['rating1', 'rating2', 'rating3'].some(
				(key) =>
					row[key] &&
					(!Number.isInteger(Number(row[key])) || Number(row[key]) < 1 || Number(row[key]) > 3)
			)
		)
			throw new Error('Invalid human similarity rating row');
	}
	return withDatabase(input.databasePath, async (db) => {
		await run(db, 'BEGIN IMMEDIATE');
		try {
			const current = await all<{ kind: string; source_sha256: string }>(
				db,
				'SELECT kind, source_sha256 FROM source_imports'
			);
			for (const [kind, hash] of [
				['manual_review_release', sha256(manifestBytes)],
				['human_similarity_ratings', sha256(ratingsBytes)]
			]) {
				const prior = current.find((row) => row.kind === kind);
				if (prior && prior.source_sha256 !== hash)
					throw new Error(
						`${kind} changed; import into a new research database or migrate explicitly`
					);
			}
			if (!current.some((row) => row.kind === 'manual_review_release')) {
				const insert = `INSERT INTO manual_reviews VALUES (${Array(19).fill('?').join(',')})`;
				for (const [scope, reviews] of [
					['video', release.video_reviews],
					['frame', release.reviewed_segments]
				] as const) {
					for (const review of reviews)
						await run(db, insert, [
							release.release_id,
							scope,
							review.segment_id,
							review.recording_id,
							review.source_id,
							review.source_manifest_sha256,
							review.experiment_id,
							review.task_id,
							review.annotator,
							review.revision_id,
							review.source_corpus,
							review.source_stem,
							review.source_video_sha256,
							review.source_frame_start,
							review.source_frame_end_exclusive,
							review.video_usability_rating || null,
							review.video_usability_rating_override || null,
							review.correction_count ?? 0,
							review.reviewed_pose_sha256 || null
						]);
				}
				await run(db, 'INSERT INTO source_imports VALUES (?, ?, ?, ?, ?)', [
					'manual_review_release',
					path.resolve(input.releaseManifestPath),
					sha256(manifestBytes),
					release.schema_version,
					new Date().toISOString()
				]);
			}
			if (!current.some((row) => row.kind === 'human_similarity_ratings')) {
				for (const row of ratings)
					await run(
						db,
						'INSERT INTO human_similarity_ratings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
						[
							row.study,
							row.dance,
							row.userId,
							row.segmentId,
							row.condition,
							row.humanRating === '' ? null : Number(row.humanRating),
							row.humanRatingPercentile === '' ? null : Number(row.humanRatingPercentile),
							...['rating1', 'rating2', 'rating3'].map((key) =>
								row[key] === '' ? null : Number(row[key])
							)
						]
					);
				await run(db, 'INSERT INTO source_imports VALUES (?, ?, ?, ?, ?)', [
					'human_similarity_ratings',
					path.resolve(input.humanRatingsPath),
					sha256(ratingsBytes),
					'csv-v1',
					new Date().toISOString()
				]);
			} else {
				for (const row of ratings)
					await run(
						db,
						`UPDATE human_similarity_ratings
						SET rating_1 = ?, rating_2 = ?, rating_3 = ?
						WHERE study = ? AND dance = ? AND user_id = ? AND segment_id = ?`,
						[
							...['rating1', 'rating2', 'rating3'].map((key) =>
								row[key] === '' ? null : Number(row[key])
							),
							row.study,
							row.dance,
							row.userId,
							row.segmentId
						]
					);
			}
			await run(db, 'COMMIT');
		} catch (error) {
			await run(db, 'ROLLBACK');
			throw error;
		}
		return {
			releaseId: release.release_id,
			videoReviews: release.video_reviews.length,
			frameReviews: release.reviewed_segments.length,
			humanRatings: ratings.length
		};
	});
}

export async function readResearchRecords(file: string, limit = 100) {
	return withDatabase(file, async (db) => ({
		sources: await all<SourceRecord>(
			db,
			'SELECT kind, source_sha256, source_version, imported_at FROM source_imports ORDER BY kind'
		),
		reviews: await all<ManualReviewRecord>(
			db,
			`SELECT release_id, scope, segment_id, source_corpus, source_stem,
			source_frame_start, source_frame_end_exclusive, video_usability_rating,
			video_usability_rating_override, correction_count, source_id, source_manifest_sha256,
			experiment_id, task_id, annotator, revision_id, source_video_sha256, reviewed_pose_sha256
			FROM manual_reviews ORDER BY source_corpus, source_stem, source_frame_start, scope LIMIT ?`,
			[limit]
		),
		humanRatings: await all<HumanRatingRecord>(
			db,
			`SELECT study, dance, user_id, segment_id, condition,
			human_rating, human_rating_percentile, rating_1, rating_2, rating_3
			FROM human_similarity_ratings
			ORDER BY study, dance, user_id, segment_id LIMIT ?`,
			[limit]
		)
	}));
}

export async function readUsabilityData(file: string) {
	return withDatabase(file, async (db) => ({
		videoReviews: await all<ManualReviewRecord & { effective_rating: string | null }>(
			db,
			`
			SELECT video.release_id, video.scope, video.segment_id, video.source_corpus,
				video.source_stem, video.source_frame_start, video.source_frame_end_exclusive,
				video.video_usability_rating, frame.video_usability_rating_override,
				COALESCE(NULLIF(frame.video_usability_rating_override, ''), video.video_usability_rating) AS effective_rating,
				COALESCE(frame.correction_count, 0) AS correction_count,
				video.source_id, video.source_manifest_sha256, video.experiment_id,
				video.task_id, video.annotator, video.revision_id,
				video.source_video_sha256, frame.reviewed_pose_sha256
			FROM manual_reviews AS video
			LEFT JOIN manual_reviews AS frame ON frame.release_id = video.release_id
				AND frame.segment_id = video.segment_id AND frame.scope = 'frame'
			WHERE video.scope = 'video'
			ORDER BY video.source_corpus, video.source_stem, video.source_frame_start`
		),
		localRatings: await all<LocalVideoUsabilityRating>(
			db,
			`
			SELECT revision_id, manifest_sha256, task_id, source_corpus, source_stem,
				source_frame_start, source_frame_end_exclusive, source_video_sha256,
				landmarks_sha256, annotator, rating, note, created_at
			FROM local_video_usability_revisions
			WHERE revision_id IN (SELECT MAX(revision_id) FROM local_video_usability_revisions GROUP BY task_id)
			ORDER BY source_corpus, source_stem, source_frame_start`
		),
		humanRatings: await all<HumanRatingRecord>(
			db,
			`
			SELECT study, dance, user_id, segment_id, condition,
				human_rating, human_rating_percentile, rating_1, rating_2, rating_3
			FROM human_similarity_ratings`
		)
	}));
}

export const VIDEO_USABILITY_RATINGS = ['unusable', 'marginal', 'correctable', 'perfect'] as const;
export type VideoUsabilityRating = (typeof VIDEO_USABILITY_RATINGS)[number];

export async function recordVideoUsabilityRating(
	file: string,
	input: {
		manifestSha256: string;
		taskId: string;
		sourceCorpus: string;
		sourceStem: string;
		sourceFrameStart: number;
		sourceFrameEndExclusive: number;
		sourceVideoSha256: string;
		landmarksSha256: string;
		study: string;
		dance: string;
		userId: string;
		segmentNumber: number;
		condition: string;
		annotator: string;
		rating: VideoUsabilityRating;
		note: string;
	}
): Promise<{ revisionId: number; snapshotPath: string | null; backupError: string | null }> {
	for (const hash of [input.manifestSha256, input.sourceVideoSha256, input.landmarksSha256])
		if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error('Invalid source SHA-256');
	if (
		!VIDEO_USABILITY_RATINGS.includes(input.rating) ||
		!input.annotator.trim() ||
		input.note.length > 2000 ||
		!Number.isSafeInteger(input.segmentNumber) ||
		input.segmentNumber < 1
	)
		throw new Error('Invalid video usability response');
	return withDatabase(file, async (db) => {
		await run(db, 'BEGIN IMMEDIATE');
		try {
			const human = await all(
				db,
				`SELECT 1 FROM human_similarity_ratings
				WHERE study = ? AND dance = ? AND user_id = ? AND segment_id = ?
				AND condition = ? AND human_rating IS NOT NULL
				AND (rating_1 IS NOT NULL OR rating_2 IS NOT NULL OR rating_3 IS NOT NULL)`,
				[
					input.study,
					input.dance,
					input.userId,
					String(input.segmentNumber),
					humanSimilarityCondition(input.condition)
				]
			);
			if (human.length !== 1)
				throw new Error('No exact CHI25 human similarity rating for this segment');
			const prior = await all(
				db,
				`SELECT 1 FROM manual_reviews
				WHERE scope = 'video' AND source_corpus = ? AND source_stem = ?
				AND source_frame_start = ? AND source_frame_end_exclusive = ?
				AND video_usability_rating IS NOT NULL`,
				[
					input.sourceCorpus,
					input.sourceStem,
					input.sourceFrameStart,
					input.sourceFrameEndExclusive
				]
			);
			const local = await all(
				db,
				`SELECT 1 FROM local_video_usability_revisions
				WHERE task_id = ? OR (source_corpus = ? AND source_stem = ?
				AND source_frame_start = ? AND source_frame_end_exclusive = ?)`,
				[
					input.taskId,
					input.sourceCorpus,
					input.sourceStem,
					input.sourceFrameStart,
					input.sourceFrameEndExclusive
				]
			);
			if (prior.length || local.length)
				throw new Error('This segment already has a usability rating');
			await run(
				db,
				`INSERT INTO local_video_usability_revisions (
				manifest_sha256, task_id, source_corpus, source_stem,
				source_frame_start, source_frame_end_exclusive, source_video_sha256,
				landmarks_sha256, annotator, rating, note, created_at, supersedes_revision_id
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
				[
					input.manifestSha256,
					input.taskId,
					input.sourceCorpus,
					input.sourceStem,
					input.sourceFrameStart,
					input.sourceFrameEndExclusive,
					input.sourceVideoSha256,
					input.landmarksSha256,
					input.annotator.trim(),
					input.rating,
					input.note.trim(),
					new Date().toISOString()
				]
			);
			const [{ id }] = await all<{ id: number }>(db, 'SELECT last_insert_rowid() AS id');
			await run(db, 'COMMIT');
			try {
				return {
					revisionId: id,
					snapshotPath: await snapshotAfterRating(db, file, id),
					backupError: null
				};
			} catch (snapshotError) {
				return {
					revisionId: id,
					snapshotPath: null,
					backupError: snapshotError instanceof Error ? snapshotError.message : 'Snapshot failed'
				};
			}
		} catch (recordError) {
			await run(db, 'ROLLBACK');
			throw recordError;
		}
	});
}
