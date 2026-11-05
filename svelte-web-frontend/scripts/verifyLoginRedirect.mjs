// Runs the production build against a synthetic local Auth service. No real accounts or credentials.
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const port = Number(process.env.LOGIN_PROOF_PORT ?? 5199);
const authPort = Number(process.env.LOGIN_PROOF_AUTH_PORT ?? 56439);
const base = `http://127.0.0.1:${port}`;
const output = 'artifacts/login-redirect';
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
const auth = createServer(async (req, res) => {
	res.setHeader('content-type', 'application/json');
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
		res.end(JSON.stringify([{ user_id: user.id, study: 'chi25_study1', role: 'viewer' }]));
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
		OPENAI_API_KEY: 'synthetic-test-key',
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
	browser = await chromium.launch();
	for (const javaScriptEnabled of [true, false]) {
		const context = await browser.newContext({ javaScriptEnabled });
		const page = await context.newPage();
		let formPosts = 0;
		page.on('request', (request) => {
			if (request.method() === 'POST' && new URL(request.url()).pathname === '/login') formPosts++;
		});
		const target = '/research?dance=last-christmas';
		await page.goto(base + target);
		assert.equal(new URL(page.url()).pathname, '/login');
		assert.equal(new URL(page.url()).searchParams.get('next'), target);
		await page.getByLabel('Email', { exact: true }).fill(user.email);
		await page.getByLabel('Password', { exact: true }).fill('synthetic-password');
		await Promise.all([
			page.waitForURL(base + target),
			page.getByRole('button', { name: 'Sign in', exact: true }).click()
		]);
		assert.equal(formPosts, 1);
		assert.ok((await context.cookies()).some((cookie) => cookie.name.includes('auth-token')));
		await page.reload();
		assert.equal(page.url(), base + target);
		if (javaScriptEnabled)
			await page.screenshot({ path: `${output}/signed-in.png`, fullPage: true });
		await page.goto(`${base}/login?next=%2Fresearch`);
		assert.equal(page.url(), base + '/research');
		await context.close();
	}
	const failed = await browser.newContext();
	const page = await failed.newPage();
	await page.goto(base + '/login?next=%2Fresearch');
	await page.getByLabel('Email', { exact: true }).fill(user.email);
	await page.getByLabel('Password', { exact: true }).fill('wrong-password');
	await page.getByRole('button', { name: 'Sign in', exact: true }).click();
	await page.getByRole('alert').filter({ hasText: 'Invalid login credentials' }).waitFor();
	assert.equal(new URL(page.url()).pathname, '/login');
	assert.equal(
		(await failed.cookies()).filter((cookie) => cookie.name.includes('auth-token')).length,
		0
	);
	await failed.close();
	const response = await fetch(base + '/auth/landing', { redirect: 'manual' });
	assert.match(response.headers.get('cache-control'), /private.*no-store/);
	const report = {
		syntheticOnly: true,
		productionBuild: true,
		sessionCookieAndRedirect: true,
		requestedPathAndQueryPreserved: true,
		survivesReload: true,
		javaScriptDisabled: true,
		alreadySignedInRedirect: true,
		invalidCredentialsStayOnForm: true,
		authRedirectNotCacheable: true
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
