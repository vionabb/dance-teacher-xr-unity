// Export per-frame, per-vector Qijia2D errors for every discrepancy-queue segment.
// Reads the git-ignored cache that `python3 -I .github/research-storage.py table|fetch` fills
// (local-data/research-chi25/) and writes JSONL back under local-data/. Participant data never
// leaves local-data/. Usage: node scripts/exportVectorFrames.mjs [out.jsonl]
import { createServer } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const cache = path.resolve('../local-data/research-chi25');
const out = path.resolve(process.argv[2] ?? path.join(cache, 'analysis/vector-frames.jsonl'));
if (!out.startsWith(path.resolve('../local-data') + path.sep))
	throw new Error('Output must stay under local-data/.');
const table = async (name) =>
	JSON.parse(await readFile(path.join(cache, 'tables', `${name}.json`), 'utf8'));

const server = await createServer({
	server: { middlewareMode: true, hmr: false },
	appType: 'custom',
	logLevel: 'error'
});
try {
	const { qijiaVectorFrames } = await server.ssrLoadModule('/src/lib/research/vector-breakdown.ts');
	const { readMetricRelease } = await server.ssrLoadModule(
		'/src/lib/server/chi25-metric-release.js'
	);
	const release = readMetricRelease(process.cwd()).id;
	const [recordings, humans, media, references, materials] = await Promise.all(
		[
			'research_analysis_recording',
			'research_human_rating',
			'research_media',
			'research_reference_segment',
			'research_material'
		].map(table)
	);
	const byId = (rows) => new Map(rows.map((row) => [row.id, row]));
	const [humanById, mediaById, referenceById, materialById] = [
		humans,
		media,
		references,
		materials
	].map(byId);
	const lines = [];
	let skipped = 0;
	// Same eligibility as hostedTasks: human rating, a reference, and the current metric release.
	for (const row of recordings) {
		const human = humanById.get(row.human_rating_id ?? '')?.human;
		if (!human || !row.reference_id || row.metric_release_id !== release) continue;
		const reference = referenceById.get(row.reference_id);
		const material = materialById.get(reference?.pose_material_id);
		const posePath = mediaById.get(row.id)?.pose_path;
		if (!material || !posePath) {
			skipped++;
			continue;
		}
		const [pose, ref] = await Promise.all([
			readFile(path.join(cache, posePath), 'utf8'),
			readFile(path.join(cache, material.object_path), 'utf8')
		]);
		lines.push(
			JSON.stringify({
				segmentId: row.id,
				study: row.study,
				dance: row.dance,
				participantId: row.participant_id,
				performanceId: row.performance_id,
				condition: row.condition,
				phase: row.phase,
				clipNumber: row.clip_number,
				referenceId: row.reference_id,
				mirrored: reference.mirrored,
				width: row.width,
				height: row.height,
				human,
				frames: qijiaVectorFrames(pose, ref, row.duration_seconds)
			})
		);
	}
	await writeFile(out, lines.join('\n') + '\n');
	console.log(
		`${lines.length} segments -> ${path.relative(process.cwd(), out)} (${skipped} skipped)`
	);
} finally {
	await server.close();
}
