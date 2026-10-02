import { createHash } from 'node:crypto';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import type sqlite3 from 'sqlite3';
import Papa from 'papaparse';

export const RESEARCH_SCHEMA_VERSION = 1;

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

async function openDatabase(file: string): Promise<sqlite3.Database> {
	const { default: sqlite3 } = await import('sqlite3');
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
		else if (versions.length !== 1 || versions[0].version !== RESEARCH_SCHEMA_VERSION)
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
			PRIMARY KEY (study, dance, user_id, segment_id))`
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
			'humanRatingPercentile'
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
			(row.humanRatingPercentile && !Number.isFinite(Number(row.humanRatingPercentile)))
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
					await run(db, 'INSERT INTO human_similarity_ratings VALUES (?, ?, ?, ?, ?, ?, ?)', [
						row.study,
						row.dance,
						row.userId,
						row.segmentId,
						row.condition,
						row.humanRating === '' ? null : Number(row.humanRating),
						row.humanRatingPercentile === '' ? null : Number(row.humanRatingPercentile)
					]);
				await run(db, 'INSERT INTO source_imports VALUES (?, ?, ?, ?, ?)', [
					'human_similarity_ratings',
					path.resolve(input.humanRatingsPath),
					sha256(ratingsBytes),
					'csv-v1',
					new Date().toISOString()
				]);
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
			human_rating, human_rating_percentile FROM human_similarity_ratings
			ORDER BY study, dance, user_id, segment_id LIMIT ?`,
			[limit]
		)
	}));
}
