import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

const studies = [
	{ id: 'chi25_study1', pose: 'study1-segmented' },
	{ id: 'chi25_study2', pose: 'study2-segmented' }
];
const bucket = 'research-chi25';
const root = path.resolve(process.env.RESEARCH_DATA_ROOT ?? '../data/participant_motions');
const upload = process.argv.includes('--upload');
const sourceDescription = process.env.RESEARCH_SOURCE_DESCRIPTION?.trim();

function hash(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

async function regularFiles(folder, suffix) {
	const entries = await readdir(folder, { withFileTypes: true });
	return new Map(
		entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
			.map((entry) => [entry.name.slice(0, -suffix.length), path.join(folder, entry.name)])
	);
}

async function safeRead(file, rootReal) {
	const resolved = await realpath(file);
	const relative = path.relative(rootReal, resolved);
	if (relative.startsWith('..') || path.isAbsolute(relative) || !(await stat(resolved)).isFile()) {
		throw new Error('Dataset file escapes the approved data root');
	}
	return readFile(resolved);
}

async function findPairs() {
	const rootReal = await realpath(root);
	const result = [];
	for (const study of studies) {
		const videos = await regularFiles(path.join(root, study.id, 'videos'), '.mp4');
		const poses = await regularFiles(
			path.join(root, study.id, 'pose-raw', 'canonical', study.pose, 'pose2d'),
			'.pose2d.raw.csv'
		);
		const videoOnly = [...videos.keys()].filter((stem) => !poses.has(stem));
		const poseOnly = [...poses.keys()].filter((stem) => !videos.has(stem));
		if (videoOnly.length || poseOnly.length) {
			throw new Error(
				`${study.id}: ${videoOnly.length} videos and ${poseOnly.length} poses are unpaired`
			);
		}
		for (const [stem, videoFile] of videos) {
			const poseFile = poses.get(stem);
			if (!poseFile) throw new Error('Unpaired pose');
			const id = createHash('sha256').update(`${study.id}\0${stem}`).digest('hex').slice(0, 24);
			result.push({ study: study.id, stem, id, videoFile, poseFile, rootReal });
		}
		console.log(`${study.id}: ${videos.size} paired recordings`);
	}
	return result;
}

async function ensureObject(client, objectPath, bytes, contentType) {
	const folder = path.posix.dirname(objectPath);
	const fileName = path.posix.basename(objectPath);
	const { data: listed, error: listError } = await client.storage.from(bucket).list(folder, {
		limit: 100
	});
	if (listError) throw listError;
	if (!listed?.some((entry) => entry.name === fileName)) {
		const { error: uploadError } = await client.storage.from(bucket).upload(objectPath, bytes, {
			contentType,
			upsert: false
		});
		if (uploadError) throw uploadError;
	}
	const { data: saved, error: readError } = await client.storage.from(bucket).download(objectPath);
	if (readError || !saved) throw readError ?? new Error('Could not verify object');
	if (hash(Buffer.from(await saved.arrayBuffer())) !== hash(bytes)) {
		throw new Error(`Storage hash differs for ${objectPath}`);
	}
}

async function main() {
	const pairs = await findPairs();
	if (!upload) {
		console.log('Dry run only. Set the service credentials and pass --upload to transfer files.');
		return;
	}
	if (!sourceDescription)
		throw new Error('Set RESEARCH_SOURCE_DESCRIPTION to identify the source release');
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
	const client = createClient(url, key, { auth: { persistSession: false } });
	for (const [index, pair] of pairs.entries()) {
		const video = await safeRead(pair.videoFile, pair.rootReal);
		const pose = await safeRead(pair.poseFile, pair.rootReal);
		const prefix = `${pair.study}/${pair.id}`;
		const row = {
			id: pair.id,
			study: pair.study,
			source_stem: pair.stem,
			video_path: `${prefix}/video.mp4`,
			pose_path: `${prefix}/pose2d.raw.csv`,
			video_sha256: hash(video),
			pose_sha256: hash(pose),
			video_bytes: video.length,
			pose_bytes: pose.length,
			source_description: sourceDescription
		};
		const { data: existing, error: lookupError } = await client
			.from('research_media')
			.select('*')
			.eq('id', pair.id)
			.maybeSingle();
		if (lookupError) throw lookupError;
		if (existing) {
			for (const [field, value] of Object.entries(row)) {
				if (existing[field] !== value)
					throw new Error(`Existing catalog entry differs: ${pair.id}`);
			}
			continue;
		}
		await ensureObject(client, row.video_path, video, 'video/mp4');
		await ensureObject(client, row.pose_path, pose, 'text/csv');
		const { error: insertError } = await client.from('research_media').insert(row);
		if (insertError) throw insertError;
		if ((index + 1) % 50 === 0) console.log(`Verified ${index + 1}/${pairs.length}`);
	}
	console.log(`Verified ${pairs.length} paired recordings`);
}

main().catch((problem) => {
	console.error(problem);
	process.exitCode = 1;
});
