// Add a supplementary CHI25 human-ratings source as the research agent user.
//
// The CSV must use the original ratings source's columns (for example the
// Study 2 segment-1 supplement from
// motion-pipeline/adhoc_analysis/chi25_ratings/build_segment1_supplement.py).
// Rows are built with analysisHumanRating, exactly as importChi25Analysis.mjs
// builds them, so a later import that is given the same CSV reproduces them.
// With --apply the CSV is uploaded to its catalogued materials path and
// registered through public.research_add_rating_source (editor role). Prints
// counts only, never participant identifiers. Afterwards run
// relinkChi25Ratings.mjs to link the new rows to recordings.
//
//   node scripts/addChi25RatingSource.mjs ../local-data/<file>.csv            # dry run
//   node scripts/addChi25RatingSource.mjs ../local-data/<file>.csv --apply
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';
import { RATING_SUPPLEMENTS, ratingSourceRows } from '../src/lib/server/chi25-analysis-contract.js';

const apply = process.argv.includes('--apply');
const csvPath = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
if (!csvPath) throw new Error('Pass the supplement CSV path');
const resolved = path.resolve(csvPath);
if (!resolved.split(path.sep).includes('local-data'))
	throw new Error('Rating sources are participant data: read them from local-data/ only');

const supplement = RATING_SUPPLEMENTS.find((item) => item.fileName === path.basename(resolved));
if (!supplement) throw new Error('Unknown supplement; register it in RATING_SUPPLEMENTS first');
const bytes = await readFile(resolved);
const parsed = Papa.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''), {
	header: true,
	skipEmptyLines: true
});
if (parsed.errors.length) throw new Error('Supplement CSV does not parse');
const { material, ratings } = ratingSourceRows(supplement, bytes, parsed.data);

const summary = {};
for (const row of ratings) {
	const label = `${row.study} ${row.dance} segment ${row.source_segment}`;
	summary[label] = (summary[label] ?? 0) + 1;
}
console.log(
	JSON.stringify(
		{
			material: { id: material.id, object_path: material.object_path, bytes: material.bytes },
			rows: ratings.length,
			eligible: ratings.filter((row) => row.segment_eligible).length,
			bySegment: summary
		},
		null,
		2
	)
);

if (apply) {
	const env = (name) => {
		const value = process.env[name]?.trim();
		if (!value) throw new Error(`${name} is not set`);
		return value;
	};
	const client = createClient(
		env('RESEARCH_SUPABASE_URL'),
		env('RESEARCH_SUPABASE_PUBLISHABLE_KEY'),
		{ auth: { persistSession: false } }
	);
	const { error: signInError } = await client.auth.signInWithPassword({
		email: env('RESEARCH_AGENT_EMAIL'),
		password: env('RESEARCH_AGENT_PASSWORD')
	});
	if (signInError) throw signInError;
	const { error: uploadError } = await client.storage
		.from('research-chi25')
		.upload(material.object_path, bytes, { contentType: 'text/csv', upsert: false });
	if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);
	const { data: added, error } = await client.rpc('research_add_rating_source', {
		p_material: material,
		p_rows: ratings
	});
	if (error) throw new Error(`Registering the source failed: ${error.message}`);
	const { data: saved, error: readError } = await client.storage
		.from('research-chi25')
		.download(material.object_path);
	if (readError) throw readError;
	const roundTrip = Buffer.from(await saved.arrayBuffer()).equals(bytes);
	console.log(JSON.stringify({ added, roundTrip }));
}
