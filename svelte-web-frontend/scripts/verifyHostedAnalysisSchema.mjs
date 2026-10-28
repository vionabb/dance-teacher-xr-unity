// Isolated Postgres WASM proof: no network, real credentials, or production data.
// Uses the pinned development dependency. PGLITE_MODULE optionally selects a disposable installation.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
const { PGlite } = await import(
	process.env.PGLITE_MODULE ? pathToFileURL(process.env.PGLITE_MODULE).href : '@electric-sql/pglite'
);
const db = new PGlite();
try {
	await db.exec(`
 create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create schema storage;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$ select (nullif(current_setting('request.jwt.claims',true),'')::jsonb->>'sub')::uuid $$;
 grant usage on schema auth,storage,public to anon,authenticated,service_role;
 grant execute on function auth.uid() to anon,authenticated,service_role;
 create table storage.buckets(id text primary key,name text,public boolean,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
 `);
	for (const migration of [
		'20261028120000_hosted_chi25_research.sql',
		'20261028191953_hosted_chi25_materials.sql',
		'20261028210107_hosted_discrepancy_review.sql'
	])
		await db.exec(await readFile(`supabase/migrations/${migration}`, 'utf8'));
	await db.exec(`
 insert into auth.users values ('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
 insert into public.research_access(user_id,study) values ('11111111-1111-4111-8111-111111111111','chi25_study1');
 insert into public.research_material(id,scope,kind,label,object_path,content_type,sha256,bytes,source_description)
 select repeat('a1',12),'shared','reference_video','synthetic','materials/shared/'||repeat('a1',12)||'/video.mp4','video/mp4',repeat('1',64),1,'synthetic'
 union all select repeat('a2',12),'chi25_study1','human_ratings','synthetic','materials/chi25_study1/'||repeat('a2',12)||'/data.csv','text/csv',repeat('2',64),1,'synthetic';
 insert into public.research_media(id,study,source_stem,video_path,pose_path,video_sha256,pose_sha256,video_bytes,pose_bytes,source_description)
 select repeat('b1',12),'chi25_study1','synthetic1','chi25_study1/'||repeat('b1',12)||'/video.mp4','chi25_study1/'||repeat('b1',12)||'/pose2d.raw.csv',repeat('3',64),repeat('4',64),1,1,'synthetic'
 union all select repeat('b2',12),'chi25_study2','synthetic2','chi25_study2/'||repeat('b2',12)||'/video.mp4','chi25_study2/'||repeat('b2',12)||'/pose2d.raw.csv',repeat('5',64),repeat('6',64),1,1,'synthetic';
 begin;
 `);
	const results = await db.exec(
		await readFile('supabase/tests/hosted_discrepancy_review.sql', 'utf8')
	);
	const notes = (await db.query('select * from public.research_discrepancy_observation')).rows;
	assert.equal(notes.length, 1);
	// Exercise lossless JSON export and a logical restore to a fresh private archive table.
	const exported = JSON.stringify(notes);
	await db.exec(
		'create temporary table restored_notes as select * from public.research_discrepancy_observation with no data'
	);
	await db.query(
		'insert into restored_notes select * from jsonb_populate_recordset(null::restored_notes,$1::jsonb)',
		[exported]
	);
	assert.deepEqual((await db.query('select * from restored_notes')).rows, notes);
	await db.exec('rollback');
	assert.equal(
		(await db.query('select count(*)::int as count from public.research_discrepancy_observation'))
			.rows[0].count,
		0
	);
	console.log(results.at(-1).rows[0].test_result);
	console.log(
		'Synthetic observation export/restore preserves every column; rollback left no test notes.'
	);
} finally {
	await db.close();
}
