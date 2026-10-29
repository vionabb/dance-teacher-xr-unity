// Scoped research backup and isolated restore proof. Never restores into production.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { PGlite } from '@electric-sql/pglite';
import { sha256, stableJson } from '../src/lib/server/chi25-analysis-contract.js';

const target = process.env.RESEARCH_BACKUP_PATH;
if (!target) throw new Error('Set RESEARCH_BACKUP_PATH to a new private JSON snapshot path');
const baseline = process.argv.includes('--baseline');
const restoreOnly = process.argv.includes('--verify-only');
const tables = [
	'research_access',
	'research_media',
	'research_material',
	...(!baseline
		? [
				'research_reference_segment',
				'research_human_rating',
				'research_metric_release',
				'research_analysis_recording',
				'research_discrepancy_observation'
			]
		: [])
];
const sortRows = (table, rows) =>
	[...rows].sort((a, b) =>
		table === 'research_access'
			? `${a.user_id}/${a.study}`.localeCompare(`${b.user_id}/${b.study}`)
			: String(a.id).localeCompare(String(b.id))
	);
let snapshot;
if (restoreOnly) snapshot = JSON.parse(await readFile(target, 'utf8'));
else {
	const config = JSON.parse(await readFile(process.env.RESEARCH_ADMIN_CONFIG, 'utf8'));
	const client = createClient(config.url, config.key, { auth: { persistSession: false } });
	snapshot = {
		schemaVersion: 1,
		createdAt: new Date().toISOString(),
		projectUrl: config.url,
		scope:
			'research tables only; auth identities are referenced, not backed up; Storage files require their independent archive',
		baseline,
		tables: {}
	};
	for (const table of tables) {
		const rows = [];
		for (let offset = 0; ; offset += 500) {
			let query = client
				.from(table)
				.select('*')
				.order(table === 'research_access' ? 'user_id' : 'id');
			if (table === 'research_access') query = query.order('study');
			const { data, error } = await query.range(offset, offset + 499);
			if (error) throw new Error(`${table}: ${error.message}`);
			rows.push(...data);
			if (data.length < 500) break;
		}
		snapshot.tables[table] = sortRows(table, rows);
	}
	await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
	await writeFile(target, JSON.stringify(snapshot), { mode: 0o600, flag: 'wx' });
}
const db = new PGlite();
try {
	await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create schema storage;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
 grant usage on schema auth,storage,public to anon,authenticated,service_role;
 grant execute on function auth.uid() to anon,authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;`);
	const migrations = [
		'20261028120000_hosted_chi25_research.sql',
		'20261028191953_hosted_chi25_materials.sql',
		...(!snapshot.baseline ? ['20261029031032_hosted_discrepancy_review.sql'] : [])
	];
	for (const migration of migrations)
		await db.exec(await readFile(`supabase/migrations/${migration}`, 'utf8'));
	const owners = [
		...new Set([
			...(snapshot.tables.research_access ?? []).map((row) => row.user_id),
			...(snapshot.tables.research_discrepancy_observation ?? []).map((row) => row.owner_id)
		])
	];
	for (const id of owners) await db.query('insert into auth.users(id) values($1)', [id]);
	for (const [table, rows] of Object.entries(snapshot.tables)) {
		if (!tables.includes(table)) throw new Error('Unexpected snapshot table');
		if (!rows.length) continue;
		if (table === 'research_discrepancy_observation')
			await db.exec('alter table public.research_discrepancy_observation disable trigger user');
		await db.query(
			`insert into public.${table} overriding system value select * from jsonb_populate_recordset(null::public.${table},$1::jsonb)`,
			[JSON.stringify(rows)]
		);
		const restored = (await db.query(`select to_jsonb(t) as row from public.${table} t`)).rows.map(
			(row) => row.row
		);
		assert.equal(
			stableJson(sortRows(table, restored)),
			stableJson(sortRows(table, rows)),
			`${table} restore differs`
		);
		if (table === 'research_discrepancy_observation')
			await db.exec('alter table public.research_discrepancy_observation enable trigger user');
	}
	if (!snapshot.baseline) {
		const resetSequence = () =>
			db.exec(
				"select setval(pg_get_serial_sequence('public.research_discrepancy_observation','id'),coalesce((select max(id) from public.research_discrepancy_observation),1),(select max(id) is not null from public.research_discrepancy_observation))"
			);
		await resetSequence();
		const recording = (
			await db.query(
				'select id,study,input_version from public.research_analysis_recording where reference_id is not null and human_rating_id is not null limit 1'
			)
		).rows[0];
		if (recording && owners.length) {
			const maximum = BigInt(
				(
					await db.query(
						'select coalesce(max(id),0)::text as value from public.research_discrepancy_observation'
					)
				).rows[0].value
			);
			const fixtureId = maximum + 42n;
			const columns =
				'owner_id,mutation_id,recording_id,study,input_version,start_seconds,end_seconds,note,direction,tags,metric,diagnostic_client_context';
			const args = [owners[0], recording.id, recording.study, recording.input_version];
			const values =
				"$1,gen_random_uuid(),$2,$3,$4,0,0,'isolated restore sequence probe','Uncertain','{}','qijia2d','{}'";
			await db.exec('begin');
			await db.query(
				`insert into public.research_discrepancy_observation(id,${columns}) overriding system value values($5,${values})`,
				[...args, String(fixtureId)]
			);
			await resetSequence();
			const appended = (
				await db.query(
					`insert into public.research_discrepancy_observation(${columns}) values(${values}) returning id::text`,
					args
				)
			).rows[0];
			assert.equal(
				BigInt(appended.id),
				fixtureId + 1n,
				'Restored sequence must allow the next append'
			);
			await db.exec('rollback');
		}
	}
	const digest = sha256(await readFile(target));
	const summary = {
		snapshotSha256: digest,
		counts: Object.fromEntries(
			Object.entries(snapshot.tables).map(([table, rows]) => [table, rows.length])
		),
		isolatedRestore: 'all captured rows match exactly',
		identitySequence: snapshot.baseline
			? 'not applicable'
			: 'restored max-id and successful next-append verified',
		scope: snapshot.scope
	};
	await writeFile(`${target}.verification.json`, JSON.stringify(summary, null, 2), { mode: 0o600 });
	console.log(JSON.stringify(summary));
} finally {
	await db.close();
}
