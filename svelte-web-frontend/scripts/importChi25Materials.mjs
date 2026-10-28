import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';

const bucket = 'research-chi25';
const upload = process.argv.includes('--upload');
const pilot = process.argv.includes('--pilot');
const referenceRoot = process.env.REFERENCE_VIDEO_ROOT;
const reviewRoot = process.env.MANUAL_REVIEW_ROOT;
const releasePath = process.env.MANUAL_REVIEW_RELEASE_MANIFEST;
const ratingsPath = path.resolve(
	process.env.HUMAN_RATINGS_PATH ?? '../local-data/chi25-humanratings-source.csv'
);
const references = [
	'attention_zoom_out.mp4',
	'bartender.mp4',
	'last-christmas-tutorial.mp4',
	'mad-at-disney-tutorial.mp4',
	'pajamaparty-tutorial.mp4'
];

function hash(bytes) {
	return createHash('sha256').update(bytes).digest('hex');
}

function material(scope, kind, label, source, bytes, contentType, sourceDescription) {
	const id = hash(Buffer.from(`${scope}\0${kind}\0${source}`)).slice(0, 24);
	return {
		row: {
			id,
			scope,
			kind,
			label,
			object_path: `materials/${scope}/${id}/${contentType === 'video/mp4' ? 'video.mp4' : 'data.csv'}`,
			content_type: contentType,
			sha256: hash(bytes),
			bytes: bytes.length,
			source_description: sourceDescription
		},
		bytes
	};
}

async function safeRead(root, relative) {
	const realRoot = await realpath(root);
	const realFile = await realpath(path.join(root, relative));
	const within = path.relative(realRoot, realFile);
	if (
		!within ||
		within.startsWith('..') ||
		path.isAbsolute(within) ||
		!(await stat(realFile)).isFile()
	) {
		throw new Error(`Source escapes its approved root: ${relative}`);
	}
	return readFile(realFile);
}

async function collect() {
	if (!referenceRoot || !reviewRoot || !releasePath) {
		throw new Error(
			'Set REFERENCE_VIDEO_ROOT, MANUAL_REVIEW_ROOT and MANUAL_REVIEW_RELEASE_MANIFEST'
		);
	}
	const all = [];
	for (const name of references) {
		const bytes = await safeRead(referenceRoot, name);
		all.push(
			material(
				'shared',
				'reference_video',
				name,
				`referencevideos/chi-studyvideos/${name}`,
				bytes,
				'video/mp4',
				`Drive dataset:referencevideos/chi-studyvideos/${name}; sha256=${hash(bytes)}`
			)
		);
	}
	const ratingBytes = await readFile(ratingsPath);
	const parsed = Papa.parse(ratingBytes.toString('utf8').replace(/^\uFEFF/, ''), {
		header: true,
		skipEmptyLines: true
	});
	if (
		parsed.errors.length ||
		!parsed.meta.fields?.includes('study') ||
		parsed.data.some((row) => !['1', '2'].includes(row.study))
	) {
		throw new Error('Invalid CHI25 human ratings CSV');
	}
	for (const study of ['1', '2']) {
		const rows = parsed.data.filter((row) => row.study === study);
		if (!rows.length) throw new Error(`No Study ${study} ratings`);
		const bytes = Buffer.from(Papa.unparse({ fields: parsed.meta.fields, data: rows }) + '\n');
		all.push(
			material(
				`chi25_study${study}`,
				'human_ratings',
				`Study ${study} human ratings (${rows.length} rows)`,
				`humanratings.csv:study${study}`,
				bytes,
				'text/csv',
				`Private Drive source chi25-humanratings-source.csv; sha256=${hash(ratingBytes)}`
			)
		);
	}
	const releaseBytes = await readFile(releasePath);
	const release = JSON.parse(releaseBytes.toString('utf8'));
	if (
		release.schema_version !== '1.0' ||
		release.release_id !== '20261002-first-manual-review' ||
		!Array.isArray(release.reviewed_segments)
	) {
		throw new Error('Unexpected frozen manual-review release');
	}
	for (const segment of release.reviewed_segments) {
		const scope = segment.source_corpus === 'chi_reference' ? 'shared' : segment.source_corpus;
		if (
			!['shared', 'chi25_study1', 'chi25_study2'].includes(scope) ||
			!segment.reviewed_pose_path ||
			!/^[a-f0-9]{64}$/.test(segment.reviewed_pose_sha256 ?? '')
		) {
			throw new Error('Invalid reviewed segment in frozen release');
		}
		const bytes = await safeRead(reviewRoot, segment.reviewed_pose_path);
		if (hash(bytes) !== segment.reviewed_pose_sha256) {
			throw new Error(`Frozen reviewed pose hash mismatch: ${segment.segment_id}`);
		}
		all.push(
			material(
				scope,
				'reviewed_pose',
				`${segment.source_stem} · reviewed pose`,
				`${release.release_id}:${segment.segment_id}`,
				bytes,
				'text/csv',
				`Frozen release ${release.release_id}; manifest sha256=${hash(releaseBytes)}; segment=${segment.segment_id}`
			)
		);
	}
	const ids = new Set(all.map(({ row }) => row.id));
	if (ids.size !== all.length || all.length !== 55)
		throw new Error('Unexpected material count or duplicate ID');
	return all;
}

async function ensureMaterial(client, { row, bytes }) {
	const { data: existing, error: lookupError } = await client
		.from('research_material')
		.select('*')
		.eq('id', row.id)
		.maybeSingle();
	if (lookupError) throw lookupError;
	if (existing) {
		for (const [field, value] of Object.entries(row)) {
			if (existing[field] !== value) throw new Error(`Catalog conflict: ${row.id}`);
		}
	}
	const folder = path.posix.dirname(row.object_path);
	const fileName = path.posix.basename(row.object_path);
	const { data: listed, error: listError } = await client.storage.from(bucket).list(folder);
	if (listError) throw listError;
	if (!listed?.some((entry) => entry.name === fileName)) {
		const { error: uploadError } = await client.storage
			.from(bucket)
			.upload(row.object_path, bytes, {
				contentType: row.content_type,
				upsert: false
			});
		if (uploadError) throw uploadError;
	}
	const { data: saved, error: readError } = await client.storage
		.from(bucket)
		.download(row.object_path);
	if (readError || !saved) throw readError ?? new Error('Cannot verify stored material');
	if (hash(Buffer.from(await saved.arrayBuffer())) !== row.sha256) {
		throw new Error(`Storage hash mismatch: ${row.id}`);
	}
	if (!existing) {
		const { error: insertError } = await client.from('research_material').insert(row);
		if (insertError) throw insertError;
	}
}

const materials = await collect();
const selected = pilot
	? [...new Map(materials.map((item) => [`${item.row.scope}:${item.row.kind}`, item])).values()]
	: materials;
const counts = Object.groupBy(materials, ({ row }) => row.kind);
console.log(
	`Validated ${materials.length} materials: ${Object.entries(counts)
		.map(([kind, rows]) => `${rows.length} ${kind}`)
		.join(', ')}`
);
if (pilot) console.log(`Pilot selection: ${selected.length} materials`);
if (upload) {
	const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
	const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
	if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
	const client = createClient(url, key, { auth: { persistSession: false } });
	for (const [index, item] of selected.entries()) {
		await ensureMaterial(client, item);
		if ((index + 1) % 10 === 0) console.log(`Verified ${index + 1}/${selected.length}`);
	}
	console.log(`Verified all ${selected.length} private materials and catalog rows`);
} else {
	console.log('Dry run only; pass --upload with production service credentials to transfer.');
}
