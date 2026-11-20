// Link hosted CHI25 analysis recordings to their existing human ratings, joining
// on study, dance, participant and clip instead of the ratings file's condition
// label (documentation/chi25-study-design.md explains why that label is wrong).
//
// Runs as the research agent user (RESEARCH_SUPABASE_URL,
// RESEARCH_SUPABASE_PUBLISHABLE_KEY, RESEARCH_AGENT_EMAIL, RESEARCH_AGENT_PASSWORD).
// Reads every recording and rating through row-level security, computes each new
// link and its input_version exactly as importChi25Analysis.mjs does, and prints
// aggregate counts. With --apply it writes the links through
// public.research_link_human_rating, which needs the editor role and only fills
// empty links. Prints no participant identifiers.
//
//   node scripts/relinkChi25Ratings.mjs            # dry run
//   node scripts/relinkChi25Ratings.mjs --apply
import { createClient } from '@supabase/supabase-js';
import { linkHumanRatings, sha256, stableJson } from '../src/lib/server/chi25-analysis-contract.js';

const apply = process.argv.includes('--apply');
const env = (name) => {
	const value = process.env[name]?.trim();
	if (!value) throw new Error(`${name} is not set`);
	return value;
};

const client = createClient(
	env('RESEARCH_SUPABASE_URL'),
	env('RESEARCH_SUPABASE_PUBLISHABLE_KEY'),
	{
		auth: { persistSession: false }
	}
);
const { error: signInError } = await client.auth.signInWithPassword({
	email: env('RESEARCH_AGENT_EMAIL'),
	password: env('RESEARCH_AGENT_PASSWORD')
});
if (signInError) throw signInError;

async function allRows(table) {
	const rows = [];
	for (;;) {
		const { data, error } = await client
			.from(table)
			.select('*')
			.order('id')
			.range(rows.length, rows.length + 999);
		if (error) throw error;
		rows.push(...data);
		if (data.length < 1000) return rows;
	}
}

function plan(recordings, ratings) {
	const ratingById = new Map(ratings.map((row) => [row.id, row]));
	const inputVersion = (row, rating) => {
		const base = { ...row };
		delete base.input_version;
		return sha256(stableJson({ ...base, human: rating ?? null }));
	};
	let unverifiable = 0;
	for (const row of recordings)
		if (inputVersion(row, ratingById.get(row.human_rating_id)) !== row.input_version)
			unverifiable++;
	if (unverifiable)
		throw new Error(`${unverifiable} hosted recordings do not reproduce their input_version`);
	const links = linkHumanRatings(
		recordings.map((row) => ({
			row,
			study: row.study,
			dance: row.dance,
			participantId: row.participant_id,
			clipNumber: row.clip_number
		})),
		ratings
	);
	const changes = [];
	let conflicting = 0;
	for (const [{ row }, rating] of links) {
		if (row.human_rating_id === rating.id) continue;
		if (row.human_rating_id) {
			conflicting++;
			continue;
		}
		if (!row.reference_id) continue;
		changes.push({
			row,
			rating,
			next: inputVersion({ ...row, human_rating_id: rating.id }, rating)
		});
	}
	if (conflicting) throw new Error(`${conflicting} linked recordings would change rating`);
	return changes;
}

const [recordings, ratings] = await Promise.all([
	allRows('research_analysis_recording'),
	allRows('research_human_rating')
]);
const changes = plan(recordings, ratings);
const summary = {};
for (const { row, rating } of changes) {
	const label = `${row.study} ${row.dance} clip ${row.clip_number} (rating condition: ${
		rating.condition === row.condition
			? 'same'
			: rating.condition === 'unknown'
				? 'unknown'
				: 'differs'
	})`;
	summary[label] = (summary[label] ?? 0) + 1;
}
const linkedBefore = recordings.filter((row) => row.reference_id && row.human_rating_id).length;
console.log(
	JSON.stringify(
		{ recordings: recordings.length, linkedBefore, newLinks: changes.length, byClip: summary },
		null,
		2
	)
);

if (apply) {
	let done = 0;
	for (const { row, rating, next } of changes) {
		const { error } = await client.rpc('research_link_human_rating', {
			p_recording_id: row.id,
			p_study: row.study,
			p_expected_input_version: row.input_version,
			p_human_rating_id: rating.id,
			p_input_version: next
		});
		if (error) throw new Error(`Link ${done + 1} of ${changes.length} failed: ${error.message}`);
		done++;
	}
	const after = await allRows('research_analysis_recording');
	const remaining = plan(after, ratings).length;
	const linkedAfter = after.filter((row) => row.reference_id && row.human_rating_id).length;
	console.log(JSON.stringify({ applied: done, linkedAfter, remaining }));
}
