// Read-only production verification. Does not print credentials, signed URLs or source rows.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { sha256, stableJson } from '../src/lib/server/chi25-analysis-contract.js';
import { readMetricRelease } from '../src/lib/server/chi25-metric-release.js';
const config = JSON.parse(await readFile(process.env.RESEARCH_ADMIN_CONFIG, 'utf8'));
const client = createClient(config.url, config.key, { auth: { persistSession: false } });
const anon = createClient(config.url, config.anon, { auth: { persistSession: false } });
const bucket = 'research-chi25';
const { data: materials, error } = await client.from('research_material').select('*').order('id');
if (error) throw error;
const references = materials.filter((row) => row.kind === 'reference_pose');
assert.equal(references.length, 20);
for (const row of references) {
	const { data, error } = await client.storage.from(bucket).download(row.object_path);
	if (error) throw error;
	const bytes = Buffer.from(await data.arrayBuffer());
	assert.equal(sha256(bytes), row.sha256);
	assert.equal(bytes.length, row.bytes);
}
const { data: releases, error: releaseError } = await client
	.from('research_metric_release')
	.select('*');
if (releaseError) throw releaseError;
assert.equal(releases.length, 1);
assert.equal(releases[0].id, readMetricRelease(process.cwd()).id);
const before = JSON.parse(await readFile(process.env.RESEARCH_BASELINE_PATH, 'utf8'));
for (const [table, rows] of Object.entries(before.tables)) {
	const current = [];
	for (let offset = 0; ; offset += 500) {
		let q = client
			.from(table)
			.select('*')
			.order(table === 'research_access' ? 'user_id' : 'id');
		if (table === 'research_access') q = q.order('study');
		const { data, error } = await q.range(offset, offset + 499);
		if (error) throw error;
		current.push(...data);
		if (data.length < 500) break;
	}
	const key = (row) => (table === 'research_access' ? `${row.user_id}/${row.study}` : row.id);
	const currentMap = new Map(current.map((row) => [key(row), row]));
	for (const row of rows) {
		const actual = currentMap.get(key(row));
		assert.ok(actual, `${table} original row missing`);
		if (table === 'research_access') {
			assert.equal(actual.user_id, row.user_id);
			assert.equal(actual.study, row.study);
		} else assert.equal(stableJson(actual), stableJson(row), `${table} original row changed`);
	}
}
const { data: anonymousRows, error: anonError } = await anon
	.from('research_analysis_recording')
	.select('id');
assert.ok(anonError || anonymousRows.length === 0, 'Anonymous registry must not be readable');
const video = materials.find((row) => row.kind === 'reference_video');
const { data: signed, error: signError } = await client.storage
	.from(bucket)
	.createSignedUrl(video.object_path, 600);
if (signError) throw signError;
const head = await fetch(signed.signedUrl, {
	method: 'HEAD',
	headers: { Origin: 'https://dancetutor.julesbb.com' }
});
assert.equal(head.status, 200);
assert.ok(head.headers.get('content-type')?.includes('video/mp4'));
assert.equal(head.headers.get('access-control-allow-origin'), '*');
const range = await fetch(signed.signedUrl, {
	headers: { Range: 'bytes=0-99', Origin: 'https://dancetutor.julesbb.com' }
});
assert.equal(range.status, 206);
assert.equal((await range.arrayBuffer()).byteLength, 100);
const privateRead = await fetch(
	`${config.url}/storage/v1/object/public/${bucket}/${video.object_path}`,
	{ method: 'HEAD' }
);
assert.notEqual(privateRead.status, 200, 'Private object must not become public');
const report = {
	referenceHashesVerified: references.length,
	referenceBytes: references.reduce((n, row) => n + row.bytes, 0),
	currentMetricReleaseMatchesRegistry: true,
	originalMediaAndMaterialsUnchanged: true,
	anonymousRegistryDenied: true,
	storage: {
		signedHead: head.status,
		corsAllowsOrigin: true,
		rangeStatus: range.status,
		rangeBytes: 100,
		publicObjectReadDenied: true
	},
	checkedAt: new Date().toISOString()
};
if (process.env.RESEARCH_VERIFY_REPORT) {
	await mkdir(path.dirname(process.env.RESEARCH_VERIFY_REPORT), { recursive: true, mode: 0o700 });
	await writeFile(process.env.RESEARCH_VERIFY_REPORT, JSON.stringify(report, null, 2), {
		mode: 0o600
	});
}
console.log(JSON.stringify(report));
