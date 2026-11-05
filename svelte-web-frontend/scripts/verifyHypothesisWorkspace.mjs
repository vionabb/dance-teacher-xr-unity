// Local prototype acceptance against a disposable database. No media, accounts, or Codex calls.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import sqlite3 from 'sqlite3';

const port = Number(process.env.HYPOTHESIS_VERIFY_PORT ?? 5202);
const base = `http://127.0.0.1:${port}`;
const output = 'artifacts/hypothesis-workspace';
const folder = await mkdtemp(path.join(os.tmpdir(), 'hypothesis-workspace-'));
const databaseFile = path.join(folder, 'research.sqlite3');
const findingDate = '2026-11-05T12:34:56.000Z';
await new Promise((resolve, reject) => {
	const db = new sqlite3.Database(databaseFile);
	db.exec(
		`CREATE TABLE hypothesis_events (
		event_id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT NOT NULL,
		kind TEXT NOT NULL, value TEXT NOT NULL, created_at TEXT NOT NULL);
		INSERT INTO hypothesis_events (slug, kind, value, created_at) VALUES
		('segment-tracking-risk', 'finding', 'Synthetic timestamp-rendering fixture.', '${findingDate}');`,
		(error) =>
			db.close((closeError) => (error || closeError ? reject(error || closeError) : resolve()))
	);
});
const server = spawn(
	process.execPath,
	[
		'node_modules/vite/bin/vite.js',
		'dev',
		'--host',
		'127.0.0.1',
		'--port',
		String(port),
		'--strictPort'
	],
	{
		env: {
			...process.env,
			NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:1',
			NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-public-key',
			OPENAI_API_KEY: 'synthetic-test-key',
			ANTHROPIC_API_KEY: 'synthetic-test-key',
			RESEARCH_SQLITE_PATH: databaseFile,
			TZ: 'UTC'
		},
		stdio: ['ignore', 'pipe', 'pipe']
	}
);
let logs = '';
let serverError;
server.on('error', (error) => {
	serverError = error;
});
server.stdout.on('data', (data) => {
	logs += data;
});
server.stderr.on('data', (data) => {
	logs += data;
});
let browser;
try {
	await mkdir(output, { recursive: true });
	for (let attempt = 0; ; attempt++) {
		if (serverError) throw serverError;
		if (server.exitCode !== null) throw new Error(`Local server exited: ${logs}`);
		try {
			if ((await fetch(base + '/research/hypothesis')).ok) break;
		} catch {
			/* wait for the server */
		}
		if (attempt > 150) throw new Error(`Local server did not become ready: ${logs}`);
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	browser = await chromium.launch();
	const page = await browser.newPage({
		viewport: { width: 1440, height: 1000 },
		locale: 'fr-FR',
		timezoneId: 'Pacific/Honolulu'
	});
	const hydrationWarnings = [];
	page.on('console', (message) => {
		if (/hydration/i.test(message.text())) hydrationWarnings.push(message.text());
	});
	await page.goto(base + '/research/hypothesis');
	const navigation = page.getByRole('navigation', { name: 'Research workspace', exact: true });
	const hypotheses = navigation.getByRole('link', { name: 'Hypotheses', exact: true });
	await page.waitForFunction(
		() =>
			document
				.querySelector('nav[aria-label="Research workspace"] a[href="/research/hypothesis"]')
				?.getAttribute('aria-current') === 'page'
	);
	assert.equal(await hypotheses.getAttribute('aria-current'), 'page');
	await page.getByRole('heading', { name: 'Manage hypotheses with Codex', exact: true }).waitFor();
	assert.equal(await page.locator('main a[href^="/research/hypothesis/"]').count(), 5);
	await page.screenshot({ path: `${output}/index-desktop.png`, fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	const panel = await page.locator('#collection-conversation').boundingBox();
	assert.ok(panel && panel.y < 844, 'Collection conversation is visible near the top on mobile');
	await page.screenshot({ path: `${output}/index-mobile.png`, fullPage: true });
	await page.locator('main a[href="/research/hypothesis/segment-tracking-risk"]').click();
	await page.getByRole('heading', { name: 'Hypothesis overview', exact: true }).waitFor();
	await page.getByRole('heading', { name: 'Discuss this hypothesis', exact: true }).waitFor();
	assert.equal(await page.locator(`time[datetime="${findingDate}"]`).textContent(), findingDate);
	assert.deepEqual(hydrationWarnings, []);
	assert.equal(await hypotheses.getAttribute('aria-current'), 'page');
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	await page.goto(base + '/research');
	await hypotheses.click();
	await page.waitForURL(base + '/research/hypothesis');
	const report = {
		disposableDatabase: true,
		codexCalls: false,
		fiveCandidates: true,
		localNavigation: true,
		indexConversation: true,
		detailConversation: true,
		mobileFits: true,
		stableFindingTimestamp: true,
		crossLocaleHydration: true
	};
	await writeFile(`${output}/verification.json`, JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify(report));
} catch (error) {
	await writeFile(`${output}/failure.log`, logs);
	throw error;
} finally {
	await browser?.close();
	server.kill('SIGTERM');
	await new Promise((resolve) => {
		if (server.exitCode !== null || server.signalCode !== null || serverError) resolve();
		else server.once('exit', resolve);
	});
	await rm(folder, { recursive: true, force: true });
}
