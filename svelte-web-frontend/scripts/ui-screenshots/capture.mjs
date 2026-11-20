#!/usr/bin/env node
// UI screenshot harness: starts a loopback dev server, opens the dev-only fixture
// pages under /dev/ui-harness, and saves desktop and phone screenshots plus a
// contact sheet. See "UI screenshots" in svelte-web-frontend/AGENTS.md.
//
//   pnpm screenshots                       # every scenario
//   pnpm screenshots -- --only key-moves   # scenarios whose id contains "key-moves"
//   pnpm screenshots -- --out /mnt/project-files/screenshots/2026-11-20-key-moves
//   pnpm screenshots -- --base-url http://127.0.0.1:5173   # reuse a running dev server
//
// Screenshots may show real study media from the git-ignored local-data/ cache.
// They are for the project thread only: the runner refuses an output directory
// inside the Git work tree unless it is git-ignored, and never commits anything.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { scenarios } from './scenarios.mjs';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const repoRoot = path.resolve(frontendRoot, '..');
const localData = path.join(repoRoot, 'local-data');
const viewports = {
	desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
	phone: {
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 2,
		isMobile: true,
		hasTouch: true
	}
};

function parseArgs(argv) {
	const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
	const options = {
		only: [],
		out: path.join(frontendRoot, 'artifacts', 'ui-screenshots', stamp),
		baseUrl: null,
		viewports: Object.keys(viewports),
		fullPage: true
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const value = () => {
			if (!argv[i + 1]) throw new Error(`${arg} needs a value`);
			return argv[++i];
		};
		if (arg === '--') continue;
		else if (arg === '--only') options.only.push(...value().split(','));
		else if (arg === '--out') options.out = path.resolve(value());
		else if (arg === '--base-url') options.baseUrl = new URL(value()).origin;
		else if (arg === '--viewports') options.viewports = value().split(',');
		else if (arg === '--viewport-only') options.fullPage = false;
		else if (arg === '--list') options.list = true;
		else throw new Error(`Unknown option ${arg}`);
	}
	for (const name of options.viewports)
		if (!viewports[name]) throw new Error(`Unknown viewport ${name}`);
	return options;
}

/** Screenshots can contain study media, so they must never be tracked by Git. */
function assertOutsideGit(dir) {
	const relative = path.relative(repoRoot, dir);
	if (relative.startsWith('..') || path.isAbsolute(relative)) return;
	try {
		execFileSync('git', ['check-ignore', '-q', path.join(dir, 'probe.png')], { cwd: repoRoot });
	} catch {
		throw new Error(`Output ${dir} is inside the repository and not git-ignored.`);
	}
}

function freePort() {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.listen(0, '127.0.0.1', () => {
			const { port } = server.address();
			server.close(() => resolve(port));
		});
		server.on('error', reject);
	});
}

async function startServer() {
	const port = await freePort();
	const env = {
		...process.env,
		// The harness never talks to Supabase; placeholders only satisfy $env imports.
		NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321',
		NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'ui-harness'
	};
	const child = spawn(
		process.execPath,
		[
			path.join(frontendRoot, 'node_modules', 'vite', 'bin', 'vite.js'),
			'dev',
			'--host',
			'127.0.0.1',
			'--port',
			String(port),
			'--strictPort'
		],
		{ cwd: frontendRoot, env, stdio: ['ignore', 'pipe', 'pipe'] }
	);
	let log = '';
	child.stdout.on('data', (chunk) => (log += chunk));
	child.stderr.on('data', (chunk) => (log += chunk));
	const baseUrl = `http://127.0.0.1:${port}`;
	for (let attempt = 0; attempt < 120; attempt++) {
		if (child.exitCode !== null) throw new Error(`Dev server exited:\n${log}`);
		try {
			const response = await fetch(`${baseUrl}/dev/ui-harness`);
			if (response.ok) return { baseUrl, stop: () => child.kill('SIGTERM') };
		} catch {
			/* not listening yet */
		}
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	child.kill('SIGTERM');
	throw new Error(`Dev server did not serve /dev/ui-harness:\n${log}`);
}

/** Caches bucket media when cloud credentials exist, else makes the synthetic fallback video. */
function ensureMedia(objectPaths) {
	const missing = objectPaths.filter((p) => !existsSync(path.join(localData, 'research-chi25', p)));
	if (missing.length && process.env.RESEARCH_AGENT_EMAIL && process.env.RESEARCH_SUPABASE_URL) {
		try {
			execFileSync(
				'python3',
				['-I', path.join(repoRoot, '.github', 'research-storage.py'), 'fetch', ...missing],
				{ cwd: repoRoot, stdio: 'inherit' }
			);
		} catch {
			process.stdout.write('Could not fetch study media; using the synthetic video.\n');
		}
	}
	const synthetic = path.join(localData, 'ui-harness', 'synthetic.mp4');
	const stillMissing = objectPaths.some(
		(p) => !existsSync(path.join(localData, 'research-chi25', p))
	);
	if (stillMissing && !existsSync(synthetic)) {
		execFileSync('mkdir', ['-p', path.dirname(synthetic)]);
		execFileSync('ffmpeg', [
			'-loglevel',
			'error',
			'-f',
			'lavfi',
			'-i',
			'testsrc2=size=540x960:rate=30:duration=14',
			'-pix_fmt',
			'yuv420p',
			synthetic
		]);
	}
	return stillMissing ? 'synthetic' : 'cached';
}

function escapeHtml(value) {
	return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function contactSheet(browser, out, captures) {
	const cards = await Promise.all(
		captures.map(async ({ file, label }) => {
			const data = (await readFile(path.join(out, file))).toString('base64');
			return `<figure><img src="data:image/png;base64,${data}" alt=""><figcaption>${escapeHtml(label)}</figcaption></figure>`;
		})
	);
	const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
	await page.setContent(`<!doctype html><style>
		body{margin:0;padding:24px;background:#f3f4f6;font:15px system-ui,sans-serif;color:#17212b}
		main{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}
		figure{margin:0;padding:8px;background:#fff;border-radius:10px;box-shadow:0 1px 6px #0002}
		img{display:block;width:100%;height:420px;object-fit:contain;object-position:top;background:#e5e7eb}
		figcaption{padding:8px 2px 0;font-weight:600}</style><main>${cards.join('')}</main>`);
	await page.screenshot({ path: path.join(out, 'contact-sheet.png'), fullPage: true });
	await page.close();
}

async function main() {
	const options = parseArgs(process.argv.slice(2));
	const selected = scenarios.filter(
		(s) => !options.only.length || options.only.some((term) => s.id.includes(term))
	);
	if (options.list) {
		for (const s of scenarios) process.stdout.write(`${s.id}: ${s.states.map((x) => x.name)}\n`);
		return;
	}
	if (!selected.length) throw new Error('No scenario matches --only');
	assertOutsideGit(options.out);
	await mkdir(options.out, { recursive: true });
	const media = ensureMedia([...new Set(selected.flatMap((s) => s.media ?? []))]);
	const server = options.baseUrl ? { baseUrl: options.baseUrl, stop() {} } : await startServer();
	const browser = await chromium.launch(
		existsSync('/opt/pw-browsers/chromium') && !process.env.PLAYWRIGHT_BROWSERS_PATH
			? { executablePath: '/opt/pw-browsers/chromium' }
			: {}
	);
	const captures = [];
	const failures = [];
	try {
		for (const scenario of selected)
			for (const viewportName of options.viewports) {
				const context = await browser.newContext({
					...viewports[viewportName],
					colorScheme: 'light',
					reducedMotion: 'reduce'
				});
				const page = await context.newPage();
				const errors = [];
				page.on('pageerror', (e) => errors.push(String(e)));
				try {
					await scenario.mock?.(page);
					await page.goto(`${server.baseUrl}/dev/ui-harness/${scenario.id}`);
					await page.waitForFunction(() => document.documentElement.dataset.uiHarness === 'ready');
					for (const state of scenario.states) {
						await state.run(page);
						await page.evaluate(() => document.fonts.ready);
						const file = `${scenario.id}--${state.name}--${viewportName}.png`;
						await page.screenshot({
							path: path.join(options.out, file),
							fullPage: options.fullPage,
							animations: 'disabled'
						});
						captures.push({
							file,
							scenario: scenario.id,
							state: state.name,
							viewport: viewportName,
							label: `${state.label} · ${viewportName}`
						});
						process.stdout.write(`Captured ${file}\n`);
					}
					if (errors.length) failures.push({ scenario: scenario.id, viewportName, errors });
				} catch (caught) {
					failures.push({
						scenario: scenario.id,
						viewportName,
						errors: [...errors, String(caught)]
					});
				} finally {
					await context.close();
				}
			}
		if (captures.length) await contactSheet(browser, options.out, captures);
		await writeFile(
			path.join(options.out, 'manifest.json'),
			JSON.stringify({ capturedAt: new Date().toISOString(), media, captures, failures }, null, 2)
		);
	} finally {
		await browser.close();
		server.stop();
	}
	process.stdout.write(
		`Saved ${captures.length} screenshots to ${options.out} (media: ${media})\n`
	);
	if (failures.length) {
		process.stderr.write(JSON.stringify(failures, null, 2) + '\n');
		process.exitCode = 1;
	}
}

await main();
