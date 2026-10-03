import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import type sqlite3 from 'sqlite3';
import { getClipInfo, Study } from '$lib/ai/motionmetrics/PoseDataTestFile';
import { humanSimilarityCondition } from './research-identity.js';

export type ReviewTask = {
	task_id: string;
	task_type: string;
	display_label?: string;
	source_corpus: string;
	source_stem: string;
	source_frame_start: number;
	source_frame_end_exclusive: number;
	source_artifact: string;
	landmarks_artifact: string;
	frame_count: number;
	fps: number;
	source_dimensions: { width: number; height: number };
};

export type ReviewIdentity = {
	paper: 'chi25';
	study: 'study1' | 'study2';
	userId: string;
	dance: string;
	condition: string;
	segmentNumber: number;
};

export type VideoReviewManifest = {
	schema_version: string;
	experiment_id: string;
	tasks: ReviewTask[];
	artifact_sha256: Record<string, string>;
};

export type LoadedVideoReviewManifest = {
	file: string;
	root: string;
	sha256: string;
	experimentId: string;
	tasks: ReviewTask[];
	tasksById: Map<string, ReviewTask>;
	artifactSha256: Record<string, string>;
};

let cachedManifest: {
	file: string;
	mtimeMs: number;
	size: number;
	value: LoadedVideoReviewManifest;
} | null = null;

export function reviewManifestPath(): string | null {
	return process.env.RESEARCH_VIDEO_MANIFEST_PATH
		? path.resolve(process.env.RESEARCH_VIDEO_MANIFEST_PATH)
		: null;
}

export function legacyAnnotationDatabasePath(): string | null {
	return process.env.RESEARCH_LEGACY_ANNOTATIONS_SQLITE_PATH
		? path.resolve(process.env.RESEARCH_LEGACY_ANNOTATIONS_SQLITE_PATH)
		: null;
}

export function reviewIdentity(sourceCorpus: string, sourceStem: string): ReviewIdentity | null {
	const study =
		sourceCorpus === 'chi25_study1'
			? Study.Study1_BySegment
			: sourceCorpus === 'chi25_study2'
				? Study.Study2_BySegment
				: null;
	if (!study) return null;
	const info = getClipInfo(`${sourceStem}.pose2d.raw.csv`, study);
	if (
		!info ||
		!Number.isSafeInteger(info.userId) ||
		info.userId < 1 ||
		!Number.isSafeInteger(info.clipNumber) ||
		info.clipNumber < 1
	)
		return null;
	return {
		paper: 'chi25',
		study,
		userId: String(info.userId),
		dance: info.danceName,
		condition: info.condition,
		segmentNumber: info.clipNumber
	};
}

/** Preserve the seven study 2 reviews whose original filenames lack a participant ID. */
export function reviewDisplayIdentity(
	sourceCorpus: string,
	sourceStem: string
): ReviewIdentity | null {
	const exact = reviewIdentity(sourceCorpus, sourceStem);
	if (exact) return exact;
	if (sourceCorpus !== 'chi25_study2' || !sourceStem.startsWith('useruseridmissing')) return null;
	const match = sourceStem.match(
		/userstudy2-(bartender|lastchristmas|madatdisney|pajamaparty)-(control|emoji|emojiandsegmented|segmented)____.*____clip(\d+)$/
	);
	if (!match) return null;
	const dances: Record<string, string> = {
		bartender: 'bartender',
		lastchristmas: 'last-christmas',
		madatdisney: 'mad-at-disney',
		pajamaparty: 'pajama-party'
	};
	return {
		paper: 'chi25',
		study: 'study2',
		userId: 'missing',
		dance: dances[match[1]],
		condition: match[2],
		segmentNumber: Number(match[3])
	};
}

export function reviewCell(identity: ReviewIdentity): string {
	return [identity.study, identity.dance, identity.segmentNumber, identity.condition].join('\0');
}

export function reviewSourceKey(
	task: Pick<
		ReviewTask,
		'source_corpus' | 'source_stem' | 'source_frame_start' | 'source_frame_end_exclusive'
	>
): string {
	return [
		task.source_corpus,
		task.source_stem,
		task.source_frame_start,
		task.source_frame_end_exclusive
	].join('\0');
}

export function humanSimilarityKey(identity: ReviewIdentity): string {
	return [
		identity.study === 'study1' ? '1' : '2',
		identity.dance,
		identity.userId,
		identity.segmentNumber,
		humanSimilarityCondition(identity.condition)
	].join('\0');
}

export async function loadVideoReviewManifest(
	file = reviewManifestPath()
): Promise<LoadedVideoReviewManifest | null> {
	if (!file) return null;
	const metadata = await stat(file);
	if (
		cachedManifest?.file === file &&
		cachedManifest.mtimeMs === metadata.mtimeMs &&
		cachedManifest.size === metadata.size
	)
		return cachedManifest.value;
	const bytes = await readFile(file);
	const manifest = JSON.parse(bytes.toString('utf8')) as VideoReviewManifest;
	if (
		manifest.schema_version !== '1.0' ||
		!manifest.experiment_id ||
		!Array.isArray(manifest.tasks) ||
		!manifest.artifact_sha256
	)
		throw new Error('Unsupported video-review source manifest');
	const tasks = manifest.tasks.filter((task) => task.task_type === 'video_usability_triage');
	const tasksById = new Map<string, ReviewTask>();
	for (const task of tasks) {
		if (
			!/^video-usability-\d+$/.test(task.task_id) ||
			tasksById.has(task.task_id) ||
			!task.source_stem ||
			!task.source_corpus ||
			!Number.isSafeInteger(task.source_frame_start) ||
			!Number.isSafeInteger(task.source_frame_end_exclusive) ||
			task.source_frame_end_exclusive <= task.source_frame_start ||
			!task.source_artifact ||
			!task.landmarks_artifact
		)
			throw new Error(`Invalid video-review task ${task.task_id}`);
		for (const artifact of [task.source_artifact, task.landmarks_artifact])
			if (!/^[a-f0-9]{64}$/.test(manifest.artifact_sha256[artifact] ?? ''))
				throw new Error(`No valid artifact hash for ${task.task_id}`);
		tasksById.set(task.task_id, task);
	}
	const value = {
		file,
		root: path.dirname(file),
		sha256: createHash('sha256').update(bytes).digest('hex'),
		experimentId: manifest.experiment_id,
		tasks,
		tasksById,
		artifactSha256: manifest.artifact_sha256
	};
	cachedManifest = { file, mtimeMs: metadata.mtimeMs, size: metadata.size, value };
	return value;
}

export async function validatedReviewArtifact(
	manifest: LoadedVideoReviewManifest,
	task: ReviewTask,
	kind: 'video' | 'landmarks'
): Promise<{ file: string; sha256: string; size: number }> {
	const relative = kind === 'video' ? task.source_artifact : task.landmarks_artifact;
	if (path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..'))
		throw new Error('Invalid review artifact path');
	const root = await realpath(manifest.root);
	const file = await realpath(path.resolve(root, relative));
	const within = path.relative(root, file);
	if (!within || within.startsWith('..') || path.isAbsolute(within))
		throw new Error('Review artifact escapes its manifest root');
	const fileStat = await stat(file);
	if (!fileStat.isFile()) throw new Error('Review artifact is not a regular file');
	return { file, sha256: manifest.artifactSha256[relative], size: fileStat.size };
}

export async function sha256File(file: string): Promise<string> {
	const hash = createHash('sha256');
	for await (const chunk of createReadStream(file)) hash.update(chunk);
	return hash.digest('hex');
}

export async function readLegacyTaskStatuses(
	file: string,
	experimentId: string
): Promise<Map<string, string>> {
	const { default: sqlite3 } = await import('sqlite3');
	const db = await new Promise<sqlite3.Database>((resolve, reject) => {
		const connection = new sqlite3.Database(file, sqlite3.OPEN_READONLY, (error) =>
			error ? reject(error) : resolve(connection)
		);
	});
	try {
		const rows = await new Promise<Array<{ task_id: string; status: string }>>(
			(resolve, reject) => {
				db.all(
					`SELECT task_id, status FROM judgment_revisions AS judgment
				WHERE experiment_id = ? AND task_type = 'video_usability_triage'
				AND revision_id = (SELECT MAX(revision_id) FROM judgment_revisions AS latest
					WHERE latest.experiment_id = judgment.experiment_id
					AND latest.annotator = judgment.annotator AND latest.task_id = judgment.task_id)`,
					[experimentId],
					(error, values) =>
						error ? reject(error) : resolve(values as Array<{ task_id: string; status: string }>)
				);
			}
		);
		return new Map(rows.map((row) => [row.task_id, row.status]));
	} finally {
		await new Promise<void>((resolve, reject) =>
			db.close((error) => (error ? reject(error) : resolve()))
		);
	}
}
