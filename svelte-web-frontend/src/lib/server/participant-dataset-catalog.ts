import { dev } from '$app/environment';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { lstat, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import {
	Study,
	getClipInfo,
	TIKTOK_CLIPS_POSES_FOLDER
} from '$lib/ai/motionmetrics/PoseDataTestFile';

const VIDEO_DIRS = [
	{
		study: Study.Study1_BySegment,
		studyDir: 'chi25_study1',
		videoDir: ''
	},
	{
		study: Study.Study2_BySegment,
		studyDir: 'chi25_study2',
		videoDir: ''
	}
] as const;
const POSE_DIRS: Record<string, string> = {
	study1: 'study1-segmented',
	study2: 'study2-segmented'
};
const VIDEO_SUFFIX = '.mp4';
const POSE_SUFFIX = '.pose2d.raw.csv';
const defaultDataRoots = [
	path.resolve(process.cwd(), '..', 'data', 'participant_motions'),
	path.resolve(process.cwd(), '..', '..', '..', 'data', 'participant_motions')
];
const defaultDataRoot =
	defaultDataRoots.find((candidate) =>
		['chi25_study1', 'chi25_study2'].some((study) => existsSync(path.join(candidate, study)))
	) ?? defaultDataRoots[0];
const DATA_ROOT = path.resolve(process.env.MOTION_PIPELINE_USER_STUDY_DATA_DIR ?? defaultDataRoot);
const REFERENCE_VIDEO_ROOT = path.resolve(
	process.env.MOTION_PIPELINE_REFERENCE_VIDEO_DIR ??
		path.resolve(
			process.cwd(),
			'..',
			'..',
			'..',
			'data',
			'reference_motions',
			'videos',
			'chi-studyvideos'
		)
);
export function participantDataRoot() {
	return DATA_ROOT;
}
export function referenceVideoRoot() {
	return REFERENCE_VIDEO_ROOT;
}
export function referencePoseRoot() {
	return REFERENCE_ROOT;
}
export { isLoopbackClientAddress } from './client-address';
const REFERENCE_ROOT = path.resolve(
	process.env.MOTION_PIPELINE_REFERENCE_POSE_DIR ??
		path.resolve(DATA_ROOT, '..', '..', 'svelte-web-frontend', TIKTOK_CLIPS_POSES_FOLDER)
);

export type ParticipantSegment = {
	id: string;
	clipNumber: number;
	referencePoseAvailable: boolean;
};
export type ParticipantPerformance = {
	id: string;
	participantLabel: string;
	study: string;
	danceName: string;
	condition: string;
	phase: string | null;
	segments: ParticipantSegment[];
};
export type ParticipantPerformanceResource = Omit<ParticipantPerformance, 'segments'> & {
	thumbnailUrl: string;
	segments: Array<
		ParticipantSegment & {
			videoUrl: string;
			poseUrl: string;
			referencePoseUrl: string | null;
			durationSeconds: number | null;
			referenceVideoUrl: string | null;
			referenceClipStartSeconds: number | null;
			referenceVideoMirrored: boolean;
		}
	>;
};

const REFERENCE_CLIP_FILES: Record<string, { fileName: string; clipSpacingSeconds: number }> = {
	bartender: { fileName: 'bartender.mp4', clipSpacingSeconds: 4.498 },
	'last-christmas': { fileName: 'last-christmas-tutorial.mp4', clipSpacingSeconds: 4.352 },
	'mad-at-disney': { fileName: 'mad-at-disney-tutorial.mp4', clipSpacingSeconds: 4.04 },
	'pajama-party': { fileName: 'pajamaparty-tutorial.mp4', clipSpacingSeconds: 2.682 }
};

export function referenceClipInfo(danceName: string, clipNumber: number) {
	const clip = REFERENCE_CLIP_FILES[danceName];
	if (!clip || !Number.isSafeInteger(clipNumber) || clipNumber < 1) return null;
	return {
		fileName: clip.fileName,
		clipStartSeconds: (clipNumber - 1) * clip.clipSpacingSeconds,
		mirrored: true
	};
}

type InternalMetadata = {
	study: string;
	userId: number;
	danceName: string;
	workflowId: string;
	condition: string;
	phase: string | null;
};
type CatalogRecord = {
	id: string;
	clipNumber: number;
	videoPath: string;
	posePath: string;
	referencePosePath: string | null;
};

function opaqueId(study: string, stem: string): string {
	return createHash('sha256').update(`${study}\0${stem}`).digest('hex').slice(0, 24);
}

function inside(root: string, candidate: string): boolean {
	const relative = path.relative(root, candidate);
	return (
		relative === '' ||
		(!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
	);
}

async function regularFiles(folder: string): Promise<string[]> {
	try {
		const entries = await readdir(folder, { withFileTypes: true });
		return entries.filter((entry) => entry.isFile()).map((entry) => path.join(folder, entry.name));
	} catch {
		return [];
	}
}

function normalizedMetadata(
	info: NonNullable<ReturnType<typeof getClipInfo<typeof Study.Study1_BySegment>>>
): InternalMetadata {
	const row = info as typeof info & { study1phase?: string };
	return {
		study: row.studyName,
		userId: row.userId,
		danceName: row.danceName,
		workflowId: row.workflowId,
		condition: row.condition,
		phase: row.study1phase ?? null
	};
}

export async function buildParticipantCatalog(options?: {
	dataRoot?: string;
	referenceRoot?: string;
}) {
	if (!dev)
		return {
			performances: [] as ParticipantPerformance[],
			records: new Map<string, CatalogRecord>()
		};
	const root = path.resolve(options?.dataRoot ?? DATA_ROOT);
	const referenceRoot = path.resolve(options?.referenceRoot ?? REFERENCE_ROOT);
	const performances = new Map<
		string,
		{ id: string; metadata: InternalMetadata; segments: ParticipantSegment[] }
	>();
	const records = new Map<string, CatalogRecord>();
	for (const config of VIDEO_DIRS) {
		const videoRoot = path.join(root, config.studyDir, 'videos', config.videoDir);
		const poseRoot = path.join(
			root,
			config.studyDir,
			'pose-raw',
			'canonical',
			POSE_DIRS[config.study],
			'pose2d'
		);
		const [videos, poses, rootReal, referenceReal] = await Promise.all([
			regularFiles(videoRoot),
			regularFiles(poseRoot),
			realpath(root).catch(() => null),
			realpath(referenceRoot).catch(() => null)
		]);
		if (!rootReal) continue;
		const poseByStem = new Map(
			poses
				.filter((file) => file.endsWith(POSE_SUFFIX))
				.map((file) => [path.basename(file, POSE_SUFFIX), file])
		);
		for (const videoPath of videos.filter((file) => file.toLowerCase().endsWith(VIDEO_SUFFIX))) {
			const stem = path.basename(videoPath, VIDEO_SUFFIX);
			const posePath = poseByStem.get(stem);
			if (!posePath) continue;
			const [videoReal, poseReal] = await Promise.all([realpath(videoPath), realpath(posePath)]);
			if (!inside(rootReal, videoReal) || !inside(rootReal, poseReal)) continue;
			let info: ReturnType<typeof getClipInfo<typeof Study.Study1_BySegment>>;
			try {
				info = getClipInfo(`${stem}${POSE_SUFFIX}`, config.study);
			} catch {
				continue;
			}
			if (!info) continue;
			const metadata = normalizedMetadata(info as never);
			const identity = [
				metadata.study,
				metadata.userId,
				metadata.danceName,
				metadata.workflowId,
				metadata.condition,
				metadata.phase ?? ''
			].join('\0');
			const id = opaqueId(config.study, stem);
			const referencePoseName = `${metadata.danceName}.clip-${info.clipNumber}.pose.csv`;
			const maybeReference = path.join(referenceRoot, referencePoseName);
			let referencePosePath: string | null = null;
			if (referenceReal) {
				try {
					const [refReal, refStat] = await Promise.all([
						realpath(maybeReference),
						lstat(maybeReference)
					]);
					if (inside(referenceReal, refReal) && refStat.isFile()) referencePosePath = refReal;
				} catch {
					/* optional reference segment pose */
				}
			}
			const segment: ParticipantSegment = {
				id,
				clipNumber: info.clipNumber,
				referencePoseAvailable: referencePosePath !== null
			};
			records.set(id, {
				id,
				clipNumber: info.clipNumber,
				videoPath: videoReal,
				posePath: poseReal,
				referencePosePath
			});
			let performance = performances.get(identity);
			if (!performance) {
				performance = {
					id: opaqueId('performance', identity),
					metadata,
					segments: []
				};
				performances.set(identity, performance);
			}
			performance.segments.push(segment);
		}
	}
	const internal = [...performances.values()].sort((a, b) =>
		[a.metadata.study, a.metadata.userId, a.metadata.danceName, a.metadata.workflowId]
			.join()
			.localeCompare(
				[b.metadata.study, b.metadata.userId, b.metadata.danceName, b.metadata.workflowId].join()
			)
	);
	const participantIds = [
		...new Set(internal.map((performance) => performance.metadata.userId))
	].sort((a, b) => a - b);
	const participantLabels = new Map(
		participantIds.map((userId, index) => [
			userId,
			`Participant ${String(index + 1).padStart(3, '0')}`
		])
	);
	const grouped = internal.map(({ id, metadata, segments }) => ({
		id,
		participantLabel: participantLabels.get(metadata.userId)!,
		study: metadata.study,
		danceName: metadata.danceName,
		condition: metadata.condition,
		phase: metadata.phase,
		segments: segments.sort((a, b) => a.clipNumber - b.clipNumber)
	}));
	return { performances: grouped, records };
}

let defaultCatalogPromise: ReturnType<typeof buildParticipantCatalog> | null = null;
export function getParticipantCatalog() {
	if (!defaultCatalogPromise) {
		defaultCatalogPromise = buildParticipantCatalog().catch((error: unknown) => {
			defaultCatalogPromise = null;
			throw error;
		});
	}
	return defaultCatalogPromise;
}

export async function findParticipantRecord(id: string) {
	if (!/^[a-f0-9]{24}$/.test(id)) return null;
	return (await getParticipantCatalog()).records.get(id) ?? null;
}

export async function findParticipantPerformance(id: string) {
	if (!/^[a-f0-9]{24}$/.test(id)) return null;
	return (
		(await getParticipantCatalog()).performances.find((performance) => performance.id === id) ??
		null
	);
}

export function toParticipantPerformanceResource(
	performance: ParticipantPerformance,
	durations: Map<string, number | null> = new Map()
): ParticipantPerformanceResource {
	const base = `/api/dev/participant-catalog`;
	return {
		...performance,
		thumbnailUrl: `${base}/performance/${performance.id}/thumbnail`,
		segments: performance.segments.map((segment) => ({
			...segment,
			videoUrl: `${base}/${segment.id}/video`,
			poseUrl: `${base}/${segment.id}/pose`,
			referencePoseUrl: segment.referencePoseAvailable
				? `${base}/${segment.id}/reference-pose`
				: null,
			durationSeconds: durations.get(segment.id) ?? null,
			referenceVideoUrl: referenceClipInfo(performance.danceName, segment.clipNumber)
				? `/api/dev/reference-clips/${performance.danceName}/video`
				: null,
			referenceClipStartSeconds:
				referenceClipInfo(performance.danceName, segment.clipNumber)?.clipStartSeconds ?? null,
			referenceVideoMirrored:
				referenceClipInfo(performance.danceName, segment.clipNumber)?.mirrored ?? false
		}))
	};
}

export function parseByteRange(
	header: string | null,
	size: number
): { start: number; end: number } | null {
	if (!header) return null;
	if (!Number.isSafeInteger(size) || size <= 0) return null;
	const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
	if (!match || (!match[1] && !match[2])) return null;
	let start: number;
	let end: number;
	if (!match[1]) {
		const suffix = Number(match[2]);
		if (!Number.isSafeInteger(suffix) || suffix <= 0) return null;
		start = Math.max(size - suffix, 0);
		end = size - 1;
	} else {
		start = Number(match[1]);
		end = match[2] ? Number(match[2]) : size - 1;
		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= size)
			return null;
		end = Math.min(end, size - 1);
	}
	return { start, end };
}

export async function validateCatalogFile(
	candidate: string,
	allowedRoot: string
): Promise<string | null> {
	const [rootReal, candidateReal] = await Promise.all([
		realpath(allowedRoot).catch(() => null),
		realpath(candidate).catch(() => null)
	]);
	if (!rootReal || !candidateReal || !inside(rootReal, candidateReal)) return null;
	const details = await stat(candidateReal).catch(() => null);
	return details?.isFile() ? candidateReal : null;
}
