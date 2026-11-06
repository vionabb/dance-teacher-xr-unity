// Checks research navigation against a synthetic local backend. No real accounts or media.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const port = Number(process.env.RESEARCH_NAV_PORT ?? 5198);
const authPort = Number(process.env.RESEARCH_NAV_AUTH_PORT ?? 56438);
const base = `http://127.0.0.1:${port}`;
const output = 'artifacts/research-navigation';
const user = {
	id: '00000000-0000-4000-8000-000000000001',
	aud: 'authenticated',
	role: 'authenticated',
	email: 'researcher@example.invalid',
	app_metadata: {},
	user_metadata: {},
	created_at: '2026-01-01T00:00:00Z'
};
const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user.id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.synthetic`;
const session = {
	access_token: token,
	refresh_token: 'synthetic-refresh',
	token_type: 'bearer',
	expires_in: 3600,
	user
};
let researchMember = true;
const auth = createServer(async (req, res) => {
	res.setHeader('content-type', 'application/json');
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Headers', '*');
	if (req.method === 'OPTIONS') {
		res.end();
		return;
	}
	const url = new URL(req.url, 'http://local.invalid');
	if (url.pathname === '/auth/v1/token') {
		let body = '';
		for await (const chunk of req) body += chunk;
		if (JSON.parse(body).password !== 'synthetic-password') {
			res.writeHead(400);
			res.end(
				JSON.stringify({ msg: 'Invalid login credentials', error_code: 'invalid_credentials' })
			);
			return;
		}
		res.end(JSON.stringify(session));
		return;
	}
	if (url.pathname === '/auth/v1/user') {
		if (req.headers.authorization !== `Bearer ${token}`) {
			res.writeHead(401);
			res.end('{}');
			return;
		}
		res.end(JSON.stringify(user));
		return;
	}
	if (
		url.pathname === '/rest/v1/research_access' &&
		req.headers.authorization === `Bearer ${token}`
	) {
		res.end(
			JSON.stringify(
				researchMember ? [{ user_id: user.id, study: 'chi25_study1', role: 'viewer' }] : []
			)
		);
		return;
	}
	res.end('[]');
});
let preview, browser;
let logs = '';
function run(args, env) {
	return new Promise((resolve, reject) => {
		const child = spawn('pnpm', args, {
			env: { ...process.env, ...env },
			stdio: ['ignore', 'pipe', 'pipe']
		});
		child.stdout.on('data', (data) => {
			logs += data;
		});
		child.stderr.on('data', (data) => {
			logs += data;
		});
		child.on('error', reject);
		child.on('exit', (code) =>
			code === 0 ? resolve() : reject(new Error(`pnpm ${args.join(' ')} failed (${code})`))
		);
	});
}
try {
	await new Promise((resolve) => auth.listen(authPort, '127.0.0.1', resolve));
	const env = {
		NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${authPort}`,
		NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-public-key',
		ANTHROPIC_API_KEY: 'synthetic-test-key'
	};
	await run(['build'], env);
	preview = spawn(
		'pnpm',
		['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
		{ env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] }
	);
	preview.stdout.on('data', (data) => {
		logs += data;
	});
	preview.stderr.on('data', (data) => {
		logs += data;
	});
	for (let attempt = 0; ; attempt++) {
		try {
			if ((await fetch(`${base}/login`)).ok) break;
		} catch {
			/* wait for listener */
		}
		if (attempt > 100) throw new Error('Preview did not start');
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	await mkdir(output, { recursive: true });
	browser = await chromium.launch(
		process.env.RESEARCH_NAV_BROWSER_CHANNEL
			? { channel: process.env.RESEARCH_NAV_BROWSER_CHANNEL }
			: {}
	);

	const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
	const page = await context.newPage();
	await page.goto(base + '/login?next=%2Fmenu');
	await page.getByLabel('Email', { exact: true }).fill(user.email);
	await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
	await Promise.all([
		page.waitForURL(base + '/menu'),
		page.getByRole('button', { name: 'Sign in', exact: true }).click()
	]);
	const tools = page.getByRole('navigation', { name: 'Research tools', exact: true });
	await tools.waitFor();
	assert.equal(await tools.getByRole('link').count(), 4);
	assert.equal(await tools.getByRole('link', { name: /Source records/ }).count(), 0);
	assert.match((await page.reload()).headers()['cache-control'], /private.*no-store/);
	await tools.waitFor();
	await page.screenshot({ path: `${output}/home-desktop.png`, fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.screenshot({ path: `${output}/home-mobile.png`, fullPage: true });
	assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	await tools.getByRole('link', { name: /Performance analysis/ }).click();
	await page.waitForURL(base + '/research');
	const navigation = page.getByRole('navigation', { name: 'Research workspace', exact: true });
	await navigation.waitFor();
	for (const [label, path] of [
		['Discrepancy review', '/research/discrepancy'],
		['Research recordings', '/research/studies'],
		['Research materials', '/research/materials'],
		['Performance analysis', '/research']
	]) {
		await navigation.getByRole('link', { name: label, exact: true }).click();
		await page.waitForURL(base + path);
		await page.waitForFunction(
			(name) =>
				document
					.querySelector('nav[aria-label="Research workspace"] a[aria-current="page"]')
					?.textContent?.trim() === name,
			label
		);
		assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
	}
	await page.waitForLoadState('networkidle');
	await page.screenshot({ path: `${output}/research-mobile.png`, fullPage: true });
	for (const path of ['/metrics/qijia2d', '/metrics/viona2d']) {
		await page.goto(base + path + '?source=local');
		await page.waitForFunction(
			() =>
				document
					.querySelector('nav[aria-label="Research workspace"] a[aria-current="page"]')
					?.textContent?.trim() === 'Performance analysis'
		);
		await navigation.getByRole('link', { name: 'Performance analysis', exact: true }).waitFor();
		assert.equal(
			await navigation
				.getByRole('link', { name: 'Performance analysis', exact: true })
				.getAttribute('aria-current'),
			'page'
		);
	}
	await navigation.getByRole('link', { name: '← Home', exact: true }).click();
	await page.waitForURL(base + '/menu');
	await tools.waitFor();
	researchMember = false;
	await page.reload();
	assert.equal(await tools.count(), 0);
	const denied = await page.goto(base + '/research');
	assert.equal(denied.status(), 404);
	assert.equal(await navigation.count(), 0);
	await context.close();
	const anonymous = await browser.newContext();
	const anonymousPage = await anonymous.newPage();
	await anonymousPage.goto(base + '/menu');
	assert.equal(new URL(anonymousPage.url()).pathname, '/login');
	assert.equal(
		await anonymousPage.getByRole('navigation', { name: 'Research tools', exact: true }).count(),
		0
	);
	await anonymous.close();
	const report = {
		syntheticOnly: true,
		productionBuild: true,
		homepageLinks: true,
		crossToolNavigation: true,
		activePage: true,
		returnHome: true,
		metricInspectorNavigation: true,
		mobileFits: true,
		ordinaryAccountHidden: true,
		anonymousHidden: true,
		researchGatePreserved: true,
		privateNoStore: true
	};
	await writeFile(`${output}/verification.json`, JSON.stringify(report, null, 2) + '\n');
	console.log(JSON.stringify(report));
} catch (error) {
	await mkdir(output, { recursive: true });
	await writeFile(`${output}/failure.log`, logs);
	throw error;
} finally {
	await browser?.close();
	preview?.kill('SIGTERM');
	auth.closeAllConnections();
	await new Promise((resolve) => auth.close(resolve));
}
