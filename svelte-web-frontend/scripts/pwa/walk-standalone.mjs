#!/usr/bin/env node
// Walks the app as an installed (standalone) PWA on a phone and checks that
// every page can be left from inside the app: no browser back button, no
// address bar. See documentation/pwa.md.
//
//   node scripts/pwa/walk-standalone.mjs --base-url http://127.0.0.1:4173 --out <dir>
//   node scripts/pwa/walk-standalone.mjs --tab ...   # a phone browser tab instead
//
// Signs in through the login form with PWA_WALK_EMAIL / PWA_WALK_PASSWORD
// (falling back to RESEARCH_AGENT_EMAIL / RESEARCH_AGENT_PASSWORD). Every
// non-GET request to Supabase REST or Storage is blocked, so the walk only
// reads. Screenshots can show study media: write them outside the repository
// (or to a git-ignored path) and never commit them.
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, devices } from 'playwright';
import { emulateStandalone } from './standalone-emulation.mjs';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(frontendRoot, '..');

const args = process.argv.slice(2).filter((arg) => arg !== '--');
const option = (name, fallback) => {
	const index = args.indexOf(name);
	return index >= 0 ? args[index + 1] : fallback;
};
// --tab walks a normal browser tab instead of the installed app.
const tabMode = args.includes('--tab');
const base = new URL(option('--base-url', 'http://127.0.0.1:4173')).origin;
const out = path.resolve(option('--out', path.join(frontendRoot, 'artifacts', 'pwa-walk')));
const email = process.env.PWA_WALK_EMAIL ?? process.env.RESEARCH_AGENT_EMAIL;
const password = process.env.PWA_WALK_PASSWORD ?? process.env.RESEARCH_AGENT_PASSWORD;
if (!email || !password) throw new Error('Set PWA_WALK_EMAIL and PWA_WALK_PASSWORD.');

const relative = path.relative(repoRoot, out);
if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
	try {
		execFileSync('git', ['check-ignore', '-q', path.join(out, 'probe.png')], { cwd: repoRoot });
	} catch {
		throw new Error(`Output ${out} is inside the repository and not git-ignored.`);
	}
}
await mkdir(out, { recursive: true });

const present = (locator) =>
	locator
		.first()
		.waitFor({ timeout: 10000 })
		.then(() => true)
		.catch(() => false);

const report = {
	base,
	mode: tabMode ? 'browser tab' : 'installed app',
	pages: [],
	problems: [],
	installability: null
};
const browser = await chromium.launch();
try {
	// Installability as Chrome sees it (manifest, icons, service worker).
	{
		const context = await browser.newContext();
		const page = await context.newPage();
		await page.goto(`${base}/login`);
		await page.waitForFunction(() => navigator.serviceWorker?.controller ?? true);
		await page.waitForTimeout(1500);
		const cdp = await context.newCDPSession(page);
		const manifest = await cdp.send('Page.getAppManifest');
		const installability = await cdp.send('Page.getInstallabilityErrors');
		const registrations = await page.evaluate(async () =>
			(await navigator.serviceWorker.getRegistrations()).map((r) => r.active?.scriptURL ?? null)
		);
		report.installability = {
			manifestUrl: manifest.url,
			manifestErrors: manifest.errors,
			installabilityErrors: installability.installabilityErrors,
			serviceWorkers: registrations
		};
		await context.close();
	}

	const context = await browser.newContext({ ...devices['iPhone 13'] });
	if (!tabMode) await context.addInitScript(emulateStandalone);
	await context.route(/\/(rest|storage)\/v1\//, (route) =>
		route.request().method() === 'GET' || route.request().method() === 'HEAD'
			? route.continue()
			: route.abort()
	);
	const page = await context.newPage();
	const external = [];
	page.on('popup', (popup) => external.push(`popup: ${popup.url()}`));
	page.on('framenavigated', (frame) => {
		if (frame === page.mainFrame() && new URL(frame.url()).origin !== base)
			external.push(`left the app: ${frame.url()}`);
	});

	let index = 0;
	async function capture(name, note = '') {
		await page.waitForLoadState('networkidle').catch(() => {});
		await page.waitForTimeout(400);
		const url = new URL(page.url());
		const file = `${String(++index).padStart(2, '0')}-${name}.png`;
		await page.screenshot({ path: path.join(out, file) });
		const controls = await page.evaluate(() => {
			const visible = (el) => {
				const box = el.getBoundingClientRect();
				return box.width > 0 && box.height > 0 && getComputedStyle(el).visibility !== 'hidden';
			};
			const names = [...document.querySelectorAll('a, button')]
				.filter(visible)
				.map((el) => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim());
			return {
				back: names.includes('Back'),
				forward: names.includes('Forward'),
				home: names.some((n) => /^home$/i.test(n)),
				upLinks: [
					...document.querySelectorAll('nav[aria-label="Breadcrumb"] a, nav.daisy-navbar a')
				]
					.filter(visible)
					.map((a) => a.textContent.trim()),
				standaloneAttr: document.documentElement.hasAttribute('data-standalone'),
				horizontalOverflow: document.documentElement.scrollWidth > innerWidth + 1
			};
		});
		report.pages.push({ file, path: url.pathname + url.search, note, ...controls });
		return controls;
	}

	// Sign in inside the standalone window.
	await page.goto(`${base}/`);
	await capture('login', 'start_url "/" while signed out');
	await page.getByLabel('Email', { exact: true }).fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.waitForURL((url) => url.pathname !== '/login', { timeout: 20000 });
	await capture('after-sign-in', 'landing after sign-in');

	await page.goto(`${base}/`);
	await page.waitForURL(`${base}/menu`);
	await capture('menu', 'start_url "/" while signed in');

	// Settings dialog and account pages.
	await page.getByRole('button', { name: 'Settings' }).click();
	await capture('settings-dialog');
	const accountLink = page.locator('a[href="/account"]');
	if (await accountLink.count()) {
		await accountLink.first().click();
		await page.waitForURL(`${base}/account`);
		await capture('account');
		await page.getByRole('link', { name: 'Update Password' }).click();
		await page.waitForURL(`${base}/updatepassword`);
		await capture('update-password');
		await page.getByRole('button', { name: 'Back' }).click();
		await page.waitForURL(`${base}/account`);
		await page.getByRole('button', { name: 'Back' }).click();
		await page.waitForURL(`${base}/menu`);
	} else report.problems.push('Settings dialog has no Account link');

	// Research workspace from the home page.
	const tools = page.getByRole('navigation', { name: 'Research tools' });
	if (!(await present(tools))) report.problems.push('No research workspace on /menu');
	for (const [label, expected] of [
		['Research recordings', '/research/studies'],
		['Reference key moves', '/research/key-moves'],
		['Research materials', '/research/materials'],
		['Discrepancy review', '/research/discrepancy'],
		['Performance analysis', '/research']
	]) {
		await page.goto(`${base}/menu`);
		await tools.getByRole('link', { name: new RegExp(label) }).click();
		await page.waitForURL(`${base}${expected}`);
		const controls = await capture(`research-${expected.split('/').pop() || 'home'}`);
		if (!controls.back) report.problems.push(`${expected}: no Back control`);
		await page.getByRole('button', { name: 'Back' }).first().click();
		await page.waitForURL(`${base}/menu`);
	}

	// Drill into a recording and a key-move reference, then come back up.
	await page.goto(`${base}/research/studies`);
	const recording = page.locator('a[href^="/research/studies/"]').first();
	if (await present(recording)) {
		await recording.click();
		await page.waitForURL(/\/research\/studies\/[a-f0-9]{24}/);
		await capture('research-recording');
		await page.getByRole('button', { name: 'Back' }).click();
		await page.waitForURL(/\/research\/studies(\?|$)/);
		const forward = page.getByRole('button', { name: 'Forward' });
		if (await forward.count()) {
			await forward.click();
			await page.waitForURL(/\/research\/studies\/[a-f0-9]{24}/);
			await capture('research-recording-forward', 'after Forward');
		}
	} else report.problems.push('No recording link on /research/studies');

	await page.goto(`${base}/research/key-moves`);
	const dance = page.locator('a[href^="/research/key-moves/"]').first();
	if (await present(dance)) {
		await dance.click();
		await page.waitForURL(/\/research\/key-moves\/.+/);
		await capture('research-key-moves-dance');
		// The reference video should land in the device cache.
		await page
			.waitForFunction(
				async () =>
					(await (await caches.open('reference-media-v1')).keys()).some((r) =>
						r.url.includes('?reference')
					),
				null,
				{ timeout: 30000 }
			)
			.catch(() => {});
		report.cachedReferenceMedia = await page.evaluate(async () =>
			Promise.all(
				(await (await caches.open('reference-media-v1')).keys()).map(async (r) => ({
					path: new URL(r.url).pathname + new URL(r.url).search,
					bytes: (await (await caches.match(r)).blob()).size
				}))
			)
		);
		if (!report.cachedReferenceMedia.length) report.problems.push('Reference video was not cached');
	}

	for (const inspector of ['qijia2d', 'viona2d']) {
		await page.goto(`${base}/research`);
		await page.goto(`${base}/metrics/${inspector}`);
		const controls = await capture(`metrics-${inspector}`);
		if (!controls.back) report.problems.push(`/metrics/${inspector}: no Back control`);
	}

	// Practice flow pages, reached by in-app links only. The hosted database has
	// no dances yet, in which case the menu says so and the flow is skipped.
	await page.goto(`${base}/menu`);
	const learn = page.getByRole('link', { name: 'Learn' }).first();
	if (await learn.count()) {
		await learn.click();
		await page.waitForURL(/\/motion\/\d+\/segmentation\/\d+/, { timeout: 20000 });
		const controls = await capture('dance-overview');
		if (!controls.back) report.problems.push(`${new URL(page.url()).pathname}: no Back control`);
	} else report.skipped = ['practice flow: no dances on this backend'];

	// Downloads go to the share sheet instead of replacing the app window.
	await page.goto(`${base}/research/materials`);
	const download = page.getByRole('link', { name: /^Download / }).first();
	if (!tabMode && (await present(download))) {
		// Wait for hydration: the share-sheet handler attaches on mount.
		await page.waitForFunction(() => document.documentElement.hasAttribute('data-standalone'));
		await download.click();
		const shared = await page
			.waitForFunction(() => window.__shared.length > 0, null, { timeout: 60000 })
			.then(() => true)
			.catch(() => false);
		if (!shared)
			report.problems.push(
				`Download did not reach the share sheet: ${await page.evaluate(
					() =>
						`${document.querySelector('[role="status"]')?.textContent ?? 'no notice'}; busy=${document.querySelector('[aria-busy="true"]') ? 'yes' : 'no'}`
				)}`
			);
		report.download = { shared: await page.evaluate(() => window.__shared), stayedOn: page.url() };
		if (new URL(page.url()).pathname !== '/research/materials')
			report.problems.push('Download navigated away from the app page');
	}

	// Offline: a failed navigation shows the app's offline page, with a way home.
	await page.goto(`${base}/menu`);
	await page.waitForFunction(async () => Boolean(await navigator.serviceWorker?.ready));
	await page.reload();
	await context.setOffline(true);
	await page.goto(`${base}/research/studies`).catch(() => {});
	const offline = await capture('offline');
	if (!offline.home) report.problems.push('Offline: no way back');
	await context.setOffline(false);

	// Error page.
	await page.goto(`${base}/menu`);
	await page.goto(`${base}/does-not-exist`);
	const errorControls = await capture('not-found');
	if (!errorControls.back && !errorControls.home) report.problems.push('404 page: no way back');

	report.external = external;
	await context.close();
} finally {
	await browser.close();
	await writeFile(path.join(out, 'walk-report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(
	JSON.stringify({ problems: report.problems, installability: report.installability }, null, 2)
);
