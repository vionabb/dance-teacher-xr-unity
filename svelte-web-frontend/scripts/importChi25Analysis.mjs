import { readMetricRelease } from '../src/lib/server/chi25-metric-release.js';
import { readFile, readdir, realpath, stat, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';
import {
	ANALYSIS_SOURCE_VERSION,
	REFERENCE_CLIPS,
	analysisHumanRating,
	analysisRatingKey,
	analysisRecordingIdentity,
	sha256,
	stableJson
} from '../src/lib/server/chi25-analysis-contract.js';

const execFileAsync = promisify(execFile);
const upload = process.argv.includes('--upload');
const pilot = process.argv.includes('--pilot');
const dataRoot = path.resolve(process.env.RESEARCH_DATA_ROOT ?? '../data/participant_motions');
const referenceRoot = path.resolve(
	process.env.REFERENCE_POSE_ROOT ?? 'testResults/tiktoks-pixelposes-segmented'
);
const videoRoot = path.resolve(
	process.env.REFERENCE_VIDEO_ROOT ?? '../data/reference_motions/videos/chi-studyvideos'
);
const ratingsPath = path.resolve(
	process.env.HUMAN_RATINGS_PATH ?? '../local-data/chi25-humanratings-source.csv'
);
const metadataCache = path.resolve(
	process.env.RESEARCH_METADATA_CACHE ?? '../local-data/chi25-video-metadata.json'
);
const inventory = JSON.parse(
	await readFile(
		'../lab-log/assets/2026-10-28-discrepancy-hosting/reference-pose-inventory.json',
		'utf8'
	)
);
const bucket = 'research-chi25';
const materialId = (scope, kind, source) => sha256(`${scope}\0${kind}\0${source}`).slice(0, 24);

async function safeRead(root, relative) {
	const realRoot = await realpath(root);
	const file = await realpath(path.join(realRoot, relative));
	const within = path.relative(realRoot, file);
	if (!within || within.startsWith('..') || path.isAbsolute(within) || !(await stat(file)).isFile())
		throw new Error('Source escapes its approved data root');
	return readFile(file);
}

async function ensureRows(client, table, rows) {
	for (let offset = 0; offset < rows.length; offset += 100) {
		const batch = rows.slice(offset, offset + 100);
		const { data, error } = await client
			.from(table)
			.select('*')
			.in(
				'id',
				batch.map((row) => row.id)
			);
		if (error) throw error;
		const existing = new Map((data ?? []).map((row) => [row.id, row]));
		const missing = [];
		for (const row of batch) {
			const prior = existing.get(row.id);
			if (!prior) missing.push(row);
			else
				for (const [key, value] of Object.entries(row)) {
					if (stableJson(prior[key]) !== stableJson(value))
						throw new Error(`Immutable ${table} entry differs: ${row.id} (${key})`);
				}
		}
		if (missing.length) {
			const { error: insertError } = await client.from(table).insert(missing);
			if (insertError) throw insertError;
		}
	}
	console.log(`${table}: ${rows.length} rows reconciled`);
}

async function ensureObject(client, item) {
	const folder = path.posix.dirname(item.row.object_path);
	const name = path.posix.basename(item.row.object_path);
	const { data, error } = await client.storage.from(bucket).list(folder, { limit: 100 });
	if (error) throw error;
	if (!data.some((entry) => entry.name === name)) {
		const { error: writeError } = await client.storage
			.from(bucket)
			.upload(item.row.object_path, item.bytes, { contentType: 'text/csv', upsert: false });
		if (writeError) throw writeError;
	}
	const { data: saved, error: readError } = await client.storage
		.from(bucket)
		.download(item.row.object_path);
	if (readError || !saved || sha256(Buffer.from(await saved.arrayBuffer())) !== item.row.sha256)
		throw readError ?? new Error('Reference pose verification failed');
}

async function collect() {
	const referenceMaterials = [];
	const references = [];
	const existingMaterials = [];
	for (const [dance, video] of Object.entries(REFERENCE_CLIPS)) {
		const bytes = await safeRead(videoRoot, video.fileName);
		existingMaterials.push({
			id: materialId(
				'shared',
				'reference_video',
				`referencevideos/chi-studyvideos/${video.fileName}`
			),
			sha256: sha256(bytes),
			bytes: bytes.length
		});
		for (const entry of inventory.files.filter((file) => file.file.startsWith(`${dance}.clip-`))) {
			const pose = await safeRead(referenceRoot, entry.file);
			if (sha256(pose) !== entry.sha256 || pose.length !== entry.bytes)
				throw new Error(`Frozen reference differs: ${entry.file}`);
			const id = materialId('shared', 'reference_pose', `legacy-reference/${entry.file}`);
			const clip = Number(entry.file.match(/\.clip-(\d+)\.pose\.csv$/)?.[1]);
			if (!Number.isSafeInteger(clip) || clip < 1) throw new Error('Invalid reference clip');
			referenceMaterials.push({
				row: {
					id,
					scope: 'shared',
					kind: 'reference_pose',
					label: entry.file,
					object_path: `materials/shared/${id}/data.csv`,
					content_type: 'text/csv',
					sha256: entry.sha256,
					bytes: entry.bytes,
					source_description: `${ANALYSIS_SOURCE_VERSION}; exact legacy inspector input; sha256=${entry.sha256}`
				},
				bytes: pose
			});
			references.push({
				id: sha256(`${ANALYSIS_SOURCE_VERSION}\0${dance}\0${clip}`).slice(0, 24),
				dance,
				clip_number: clip,
				pose_material_id: id,
				video_material_id: existingMaterials.at(-1).id,
				start_seconds: (clip - 1) * video.spacing,
				mirrored: true,
				fps: 30,
				source_version: ANALYSIS_SOURCE_VERSION
			});
		}
	}
	if (referenceMaterials.length !== 20)
		throw new Error('Expected exactly 20 legacy reference poses');
	const ratingBytes = await readFile(ratingsPath);
	const parsed = Papa.parse(ratingBytes.toString('utf8').replace(/^\uFEFF/, ''), {
		header: true,
		skipEmptyLines: true
	});
	if (parsed.errors.length || parsed.data.length !== 1570)
		throw new Error('Unexpected ratings source');
	for (const study of ['1', '2']) {
		const bytes = Buffer.from(
			Papa.unparse({
				fields: parsed.meta.fields,
				data: parsed.data.filter((row) => row.study === study)
			}) + '\n'
		);
		existingMaterials.push({
			id: materialId(`chi25_study${study}`, 'human_ratings', `humanratings.csv:study${study}`),
			sha256: sha256(bytes),
			bytes: bytes.length
		});
	}
	const ratings = parsed.data.map((row, index) =>
		analysisHumanRating(
			row,
			sha256(ratingBytes),
			index + 1,
			materialId(`chi25_study${row.study}`, 'human_ratings', `humanratings.csv:study${row.study}`)
		)
	);
	const ratingMap = new Map();
	for (const row of ratings.filter((row) => row.segment_eligible)) {
		const key = analysisRatingKey(
			row.study,
			row.dance,
			row.participant_id,
			row.source_segment,
			row.condition
		);
		if (ratingMap.has(key)) throw new Error('Ambiguous human-rating join');
		ratingMap.set(key, row);
	}
	const metricRelease = readMetricRelease(process.cwd());
	const cached = JSON.parse(await readFile(metadataCache, 'utf8').catch(() => '{}'));
	const recordings = [];
	let excluded = 0;
	for (const study of ['chi25_study1', 'chi25_study2']) {
		const names = (await readdir(path.join(dataRoot, study, 'videos')))
			.filter((name) => name.endsWith('.mp4'))
			.sort();
		let selected = 0;
		for (const name of names) {
			const stem = name.slice(0, -4);
			const identity = analysisRecordingIdentity(study, stem);
			if (!identity) {
				excluded++;
				continue;
			}
			if (pilot && selected > 0) continue;
			const video = await safeRead(dataRoot, `${study}/videos/${name}`);
			const pose = await safeRead(
				dataRoot,
				`${study}/pose-raw/canonical/${identity.localStudy}-segmented/pose2d/${stem}.pose2d.raw.csv`
			);
			const videoHash = sha256(video);
			let metadata = cached[videoHash];
			if (!metadata) {
				const { stdout } = await execFileAsync(
					'ffprobe',
					[
						'-v',
						'error',
						'-select_streams',
						'v:0',
						'-show_entries',
						'stream=width,height:format=duration',
						'-of',
						'json',
						path.join(dataRoot, study, 'videos', name)
					],
					{ timeout: 30_000 }
				);
				const probed = JSON.parse(stdout);
				metadata = {
					duration_seconds: Number(probed.format?.duration),
					width: Number(probed.streams?.[0]?.width),
					height: Number(probed.streams?.[0]?.height)
				};
				if (
					!(metadata.duration_seconds > 0) ||
					!Number.isFinite(metadata.duration_seconds) ||
					!(metadata.width > 0) ||
					!(metadata.height > 0)
				)
					throw new Error('Invalid video metadata');
				cached[videoHash] = metadata;
			}
			if (
				!(metadata.duration_seconds > 0) ||
				!Number.isFinite(metadata.duration_seconds) ||
				!Number.isSafeInteger(metadata.width) ||
				metadata.width < 1 ||
				!Number.isSafeInteger(metadata.height) ||
				metadata.height < 1
			)
				throw new Error('Invalid cached video metadata');
			const reference = references.find(
				(row) => row.dance === identity.dance && row.clip_number === identity.clipNumber
			);
			const referenceMaterial = referenceMaterials.find(
				(item) => item.row.id === reference?.pose_material_id
			)?.row;
			const rating = ratingMap.get(
				analysisRatingKey(
					study,
					identity.dance,
					identity.participantId,
					identity.clipNumber,
					identity.condition
				)
			);
			const sourceContext = {
				sourceVersion: ANALYSIS_SOURCE_VERSION,
				videoSha256: videoHash,
				participantPoseSha256: sha256(pose),
				referencePoseSha256: referenceMaterial?.sha256 ?? null,
				inputSizes: [video.length, pose.length, referenceMaterial?.bytes ?? null],
				segment: {
					study: identity.localStudy,
					dance: identity.dance,
					participantId: identity.participantId,
					condition: identity.condition,
					phase: identity.phase,
					workflowId: identity.workflowId,
					clipNumber: identity.clipNumber
				},
				reference: reference ?? null
			};
			const base = {
				id: identity.id,
				study,
				legacy_segment_id: identity.legacyId,
				performance_id: identity.performanceId,
				participant_id: identity.participantId,
				dance: identity.dance,
				workflow_id: identity.workflowId,
				condition: identity.condition,
				phase: identity.phase,
				clip_number: identity.clipNumber,
				...metadata,
				reference_id: reference?.id ?? null,
				human_rating_id: rating?.id ?? null,
				metric_release_id: metricRelease.id,
				source_context: sourceContext
			};
			recordings.push({
				...base,
				input_version: sha256(stableJson({ ...base, human: rating ?? null }))
			});
			if (recordings.length % 100 === 0)
				console.log(`Validated metadata for ${recordings.length} recordings`);
			selected++;
		}
	}
	await mkdir(path.dirname(metadataCache), { recursive: true });
	await writeFile(metadataCache, JSON.stringify(cached));
	console.log(
		JSON.stringify({
			references: references.length,
			humanRows: ratings.length,
			recordings: recordings.length,
			reviewable: recordings.filter((row) => row.reference_id && row.human_rating_id).length,
			unidentifiedRecordingsExcluded: excluded,
			pilot,
			upload
		})
	);
	return { referenceMaterials, references, existingMaterials, ratings, metricRelease, recordings };
}

const inputs = await collect();
if (upload) {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) throw new Error('Set target Supabase URL and server-side administrative key');
	const client = createClient(url, key, { auth: { persistSession: false } });
	const { data: materials, error } = await client
		.from('research_material')
		.select('id,sha256,bytes');
	if (error) throw error;
	for (const expected of inputs.existingMaterials) {
		const found = materials.find((row) => row.id === expected.id);
		if (!found || found.sha256 !== expected.sha256 || found.bytes !== expected.bytes)
			throw new Error(
				'The existing hosted reference/rating materials differ from the analyzed source'
			);
	}
	const media = [];
	for (let offset = 0; offset < inputs.recordings.length; offset += 100) {
		const { data: batch, error: mediaError } = await client
			.from('research_media')
			.select('id,study,video_sha256,pose_sha256')
			.in(
				'id',
				inputs.recordings.slice(offset, offset + 100).map((row) => row.id)
			);
		if (mediaError) throw mediaError;
		media.push(...batch);
	}
	for (const row of inputs.recordings) {
		const found = media.find((item) => item.id === row.id);
		if (
			!found ||
			found.study !== row.study ||
			found.video_sha256 !== row.source_context.videoSha256 ||
			found.pose_sha256 !== row.source_context.participantPoseSha256
		)
			throw new Error('Analysis metadata does not match the hosted recording');
	}
	for (const item of inputs.referenceMaterials) await ensureObject(client, item);
	await ensureRows(
		client,
		'research_material',
		inputs.referenceMaterials.map((item) => item.row)
	);
	await ensureRows(client, 'research_reference_segment', inputs.references);
	await ensureRows(client, 'research_human_rating', inputs.ratings);
	await ensureRows(client, 'research_metric_release', [inputs.metricRelease]);
	await ensureRows(client, 'research_analysis_recording', inputs.recordings);
}
