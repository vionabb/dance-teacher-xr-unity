import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import type { LoadedVideoReviewManifest, ReviewTask } from './research-video-manifest';

type FrameConfig = { manifest: string; database: string; annotator: string };
export type FrameRevision = {
	revision_id: number;
	status: 'started' | 'completed' | 'skipped' | 'unclear';
	frame_usability_response: {
		labels?: Record<string, 'good' | 'flawed' | 'unusable'>;
		automatic_missing_pose_frames?: number[];
		marks?: FrameMark[];
		note?: string;
		video_usability_rating_override?: 'unusable' | null;
		last_viewed_frame?: number;
	};
};
export type FrameMark = {
	body_part: string;
	start_frame: number;
	end_frame: number;
	causes: string[];
	note: string;
	positions: Record<string, [number, number]>;
};
export type FrameSource = { manifest: LoadedVideoReviewManifest; config: FrameConfig };

const configFile = path.resolve('..', 'local-data', 'research-frame-source.json');
const bridgeCwd = path.resolve('..', 'motion-pipeline');

export async function loadFrameSource(): Promise<FrameSource | null> {
	let config: FrameConfig;
	if (
		process.env.RESEARCH_FRAME_MANIFEST_PATH &&
		process.env.RESEARCH_LEGACY_ANNOTATIONS_SQLITE_PATH &&
		process.env.RESEARCH_ANNOTATOR
	) {
		config = {
			manifest: process.env.RESEARCH_FRAME_MANIFEST_PATH,
			database: process.env.RESEARCH_LEGACY_ANNOTATIONS_SQLITE_PATH,
			annotator: process.env.RESEARCH_ANNOTATOR
		};
	} else {
		try {
			config = JSON.parse(await readFile(configFile, 'utf8')) as FrameConfig;
		} catch (caught) {
			if ((caught as NodeJS.ErrnoException).code === 'ENOENT') return null;
			throw caught;
		}
	}
	if (!config.manifest || !config.database || !config.annotator?.trim())
		throw new Error('Frame review source needs manifest, database, and annotator.');
	const file = path.resolve(config.manifest);
	const database = path.resolve(config.database);
	const [bytes, dbStat] = await Promise.all([readFile(file), stat(database)]);
	if (!dbStat.isFile()) throw new Error('Frame annotation database is not a file.');
	const parsed = JSON.parse(bytes.toString('utf8')) as {
		schema_version: string;
		experiment_id: string;
		tasks: ReviewTask[];
		artifact_sha256: Record<string, string>;
	};
	if (
		parsed.schema_version !== '1.0' ||
		!parsed.experiment_id ||
		!Array.isArray(parsed.tasks) ||
		!parsed.artifact_sha256
	)
		throw new Error('Unsupported frame-review manifest.');
	const tasks = parsed.tasks.filter((task) => task.task_type === 'frame_usability');
	const tasksById = new Map<string, ReviewTask>();
	for (const task of tasks) {
		if (
			!/^frame-usability-[a-z0-9-]+$/.test(task.task_id) ||
			tasksById.has(task.task_id) ||
			!Number.isSafeInteger(task.frame_count) ||
			task.frame_count < 1 ||
			!Number.isFinite(task.fps) ||
			task.fps <= 0 ||
			!Number.isFinite(task.source_dimensions?.width) ||
			task.source_dimensions.width <= 0 ||
			!Number.isFinite(task.source_dimensions?.height) ||
			task.source_dimensions.height <= 0 ||
			!task.source_artifact ||
			!task.landmarks_artifact ||
			![task.source_artifact, task.landmarks_artifact].every((artifact) =>
				/^[a-f0-9]{64}$/.test(parsed.artifact_sha256[artifact] ?? '')
			)
		)
			throw new Error(`Invalid frame-review task ${task.task_id}`);
		tasksById.set(task.task_id, task);
	}
	if (!tasks.length) throw new Error('Frame-review manifest has no frame tasks.');
	return {
		config: { manifest: file, database, annotator: config.annotator.trim() },
		manifest: {
			file,
			root: path.dirname(file),
			sha256: createHash('sha256').update(bytes).digest('hex'),
			experimentId: parsed.experiment_id,
			tasks,
			tasksById,
			artifactSha256: parsed.artifact_sha256
		}
	};
}

async function bridge(
	source: FrameSource,
	operation: 'latest' | 'save',
	payload?: unknown
): Promise<unknown> {
	const args = [
		'-m',
		'motion_extraction.annotation_tool.frame_bridge',
		operation,
		'--manifest',
		source.config.manifest,
		'--database',
		source.config.database,
		'--annotator',
		source.config.annotator
	];
	return await new Promise((resolve, reject) => {
		const child = spawn('python3', args, { cwd: bridgeCwd, stdio: ['pipe', 'pipe', 'pipe'] });
		let stdout = '';
		let stderr = '';
		child.stdout.setEncoding('utf8');
		child.stderr.setEncoding('utf8');
		child.stdout.on('data', (chunk: string) => {
			stdout += chunk;
			if (stdout.length > 8_000_000) child.kill();
		});
		child.stderr.on('data', (chunk: string) => {
			stderr += chunk;
		});
		const processEvents = child as unknown as {
			on(event: 'error', listener: (error: Error) => void): void;
			on(event: 'close', listener: (code: number | null) => void): void;
		};
		processEvents.on('error', reject);
		processEvents.on('close', (code) => {
			if (code !== 0) reject(new Error(stderr.trim() || `Frame bridge exited ${code}.`));
			else {
				try {
					resolve(JSON.parse(stdout));
				} catch {
					reject(new Error('Frame bridge returned invalid JSON.'));
				}
			}
		});
		child.stdin.end(payload === undefined ? '' : JSON.stringify(payload));
	});
}

export async function latestFrameRevisions(
	source: FrameSource
): Promise<Record<string, FrameRevision>> {
	return (await bridge(source, 'latest')) as Record<string, FrameRevision>;
}

export async function saveFrameRevision(
	source: FrameSource,
	payload: unknown
): Promise<{ conflict: boolean; revision_id: number }> {
	return (await bridge(source, 'save', payload)) as { conflict: boolean; revision_id: number };
}
