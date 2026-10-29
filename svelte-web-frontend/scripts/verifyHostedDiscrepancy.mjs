// Synthetic-only browser proof. Creates an isolated temporary route and server, then removes both.
// No production services or participant files are used.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, rm, readFile } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readMetricRelease } from '../src/lib/server/chi25-metric-release.js';
const metricReleaseId = readMetricRelease(process.cwd()).id;

const port = Number(process.env.DISCREPANCY_PROOF_PORT ?? 5197);
const base = `http://127.0.0.1:${port}`;
const routeName = `discrepancy-ui-proof-${process.pid}`;
const routeDir = path.resolve('src/routes/research', routeName);
const output = path.resolve('artifacts/hosted-discrepancy-ui');
const scratch = await mkdtemp(path.join(tmpdir(), 'discrepancy-ui-'));
const errors = [];
const failedRequests = [];
let serverLog = '';
let server;
let browser;
try {
	await mkdir(output, { recursive: true });
	await mkdir(routeDir);
	await writeFile(
		path.join(routeDir, '+page.ts'),
		`export const load = ({ url }) => ({ researchBackend: url.searchParams.get('backend') ?? 'hosted', loadedAnalysis: url.searchParams.has('missingBinding') ? undefined : { inputVersion: url.searchParams.get('inputVersion') ?? '${'a'.repeat(64)}', metricReleaseId: url.searchParams.get('metricReleaseId') ?? __RESEARCH_METRIC_RELEASE__ } });`
	);
	await writeFile(
		path.join(routeDir, '+page.svelte'),
		`<script>
import { page } from '$app/state';
import { onMount } from 'svelte';
onMount(() => { document.documentElement.dataset.discrepancyProof = 'ready'; });
import Review from '$lib/elements/DiscrepancyReview.svelte';
import Qijia from '../../metrics/qijia2d/+page.svelte';
import Viona from '../../metrics/viona2d/+page.svelte';
import Queue from '../discrepancy/+page.svelte';
import Catalog from '../+page.svelte';
let time = $state(0);
const tasks = Array.from({length: 60}, (_, i) => ({performanceId:'performance',segmentId:'segment-'+i,participantLabel:'Synthetic participant',study:'synthetic-study',dance:'Synthetic dance',condition:'test',phase:null,clipNumber:i+1,referenceAvailable:true,human:{human_rating:3,rating_1:1,rating_2:2,rating_3:3},observations:[]}));
</script>
{#if page.url.searchParams.get('mode') === 'qijia2d'}<Qijia/>
{:else if page.url.searchParams.get('mode') === 'viona2d'}<Viona/>
{:else if page.url.searchParams.get('mode') === 'catalog'}<Catalog/>
{:else if page.url.searchParams.get('mode') === 'queue'}<Queue data={{tasks}}/>
{:else}<main style="max-width:600px;margin:20px auto"><Review segmentId="study-segment" researchBackend={page.data.researchBackend} loadedAnalysis={page.data.loadedAnalysis} metric="qijia2d" localTime={time} duration={2} context={{synthetic:true}} samples={[{time:0,value:1},{time:1,value:2}]} onseek={(value)=>time=value} onpreview={()=>{}} onpause={()=>{}} onrate={()=>{}} onrangechange={()=>{}} playing={false} playbackRate={1}/></main>{/if}`
	);
	// Generate an entirely synthetic playable clip for the actual metric components.
	const videoPath = path.join(scratch, 'synthetic.mp4');
	execFileSync(process.env.FFMPEG ?? 'ffmpeg', [
		'-hide_banner',
		'-loglevel',
		'error',
		'-f',
		'lavfi',
		'-i',
		'color=c=slategray:s=800x600:r=30:d=2',
		'-c:v',
		'libx264',
		'-pix_fmt',
		'yuv420p',
		'-movflags',
		'+faststart',
		videoPath
	]);
	const video = await readFile(videoPath);
	server = spawn(
		process.execPath,
		[
			'node_modules/vite/bin/vite.js',
			'--host',
			'127.0.0.1',
			'--port',
			String(port),
			'--strictPort'
		],
		{
			env: {
				...process.env,
				NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
				NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-public-key'
			},
			stdio: ['ignore', 'pipe', 'pipe']
		}
	);
	let log = '';
	server.stdout.on('data', (value) => {
		log += value;
		serverLog += value;
	});
	server.stderr.on('data', (value) => {
		log += value;
		serverLog += value;
	});
	for (let i = 0; i < 100; i++) {
		if (server.exitCode !== null) throw new Error(log);
		try {
			if ((await fetch(base)).status < 500) break;
		} catch {
			/* Server is starting. */
		}
		await new Promise((resolve) => setTimeout(resolve, 200));
	}
	browser = await chromium.launch({ headless: true });
	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	page.on('requestfailed', (request) =>
		failedRequests.push({ url: request.url(), failure: request.failure() })
	);
	page.on('pageerror', (error) => errors.push(error.message));
	let ownerId = 'account-a',
		inputVersion = 'a'.repeat(64),
		canAnnotate = true,
		fail = true;
	let serverMetricReleaseId = metricReleaseId;
	const submissions = [];
	let failPerformanceRequests = 0;
	let performanceRequests = 0;
	let retryMultiSegment = false;
	let mediaAccess = 'ready';
	let expireInitialMedia = false;
	const mediaRequests = [];
	let observations = [];
	const human = { human_rating: 3, rating_1: 1, rating_2: 2, rating_3: 3 };
	await page.route('**/api/**', async (route) => {
		const request = route.request();
		const pathname = new URL(request.url()).pathname;
		if (pathname.endsWith('.mp4')) {
			mediaRequests.push({ method: request.method(), url: request.url() });
			if (
				pathname.endsWith('/expired.mp4') ||
				(expireInitialMedia &&
					request.method() === 'GET' &&
					!new URL(request.url()).searchParams.has('__research_reload')) ||
				(request.method() === 'HEAD' && mediaAccess === 'forbidden')
			)
				return route.fulfill({
					status: 403,
					json: { message: 'Synthetic expired or denied access' }
				});

			const range = request.headers().range?.match(/^bytes=(\d+)-(\d*)$/);
			if (range) {
				const start = Number(range[1]);
				const end = range[2] ? Math.min(Number(range[2]), video.length - 1) : video.length - 1;
				return route.fulfill({
					status: 206,
					body: video.subarray(start, end + 1),
					contentType: 'video/mp4',
					headers: {
						'Accept-Ranges': 'bytes',
						'Content-Range': `bytes ${start}-${end}/${video.length}`
					}
				});
			}
			return route.fulfill({
				body: video,
				contentType: 'video/mp4',
				headers: { 'Accept-Ranges': 'bytes' }
			});
		}
		if (pathname.includes('/discrepancy/')) {
			const hosted = pathname.startsWith('/api/research/');
			if (request.method() === 'POST') {
				const body = request.postDataJSON();
				submissions.push(body);
				if (
					hosted &&
					(body.inputVersion !== inputVersion || body.metricReleaseId !== serverMetricReleaseId)
				)
					return route.fulfill({
						status: 409,
						json: { message: 'Synthetic loaded binding is stale' }
					});
				if (fail)
					return route.fulfill({
						status: 503,
						json: { message: 'Synthetic lost response. Your draft is retained.' }
					});
				observations = [
					{
						id: 1,
						segment_id: 'study-segment',
						annotator: ownerId,
						created_at: new Date().toISOString(),
						start_seconds: body.start,
						end_seconds: body.end,
						note: body.note,
						direction: body.direction,
						tags: body.tags,
						metric: body.metric,
						context: body.context
					}
				];
				return route.fulfill({
					json: { id: 1, observations, ...(hosted ? { backend: 'hosted' } : {}) }
				});
			}
			return route.fulfill({
				json: {
					task: { clipNumber: pathname.endsWith('/retry-segment') ? 2 : 1, human, observations },
					annotator: ownerId,
					navigation: { previous: null, next: null, position: 1, total: 1 },
					...(hosted
						? {
								backend: 'hosted',
								ownerId,
								inputVersion,
								metricReleaseId: serverMetricReleaseId,
								canAnnotate
							}
						: {})
				}
			});
		}
		if (pathname.endsWith('.csv')) {
			const names = [
				'LEFT_SHOULDER',
				'RIGHT_SHOULDER',
				'LEFT_ELBOW',
				'RIGHT_ELBOW',
				'LEFT_WRIST',
				'RIGHT_WRIST',
				'LEFT_HIP',
				'RIGHT_HIP'
			];
			const reference = pathname.includes('reference');
			const fields = reference
				? ['x_2d', 'y_2d', 'z_2d', 'visibility_2d']
				: ['x', 'y', 'distance', 'vis'];
			const header = [
				'frame',
				...(reference ? ['timestamp'] : []),
				...names.flatMap((name) => fields.map((field) => `${name}_${field}`))
			];
			const rows = Array.from({ length: 60 }, (_, frame) => [
				frame,
				...(reference ? [(frame / 30) * 1000] : []),
				...names.flatMap((_, i) => [
					200 + (i % 2) * 100 + Math.sin(frame / 10) * 10,
					100 + Math.floor(i / 2) * 70,
					0,
					1
				])
			]);
			return route.fulfill({
				body: [header, ...rows].map((row) => row.join(',')).join('\n'),
				contentType: 'text/csv'
			});
		}
		if (pathname.includes('/participant-catalog')) {
			if (pathname.endsWith('/performance/performance')) {
				performanceRequests++;
				if (failPerformanceRequests > 0) {
					failPerformanceRequests--;
					return route.fulfill({
						status: 503,
						json: { message: 'Synthetic transient performance failure' }
					});
				}
			}

			const performance = {
				id: 'performance',
				participantLabel: 'Synthetic participant',
				study: 'synthetic-study',
				danceName: 'Synthetic dance',
				condition: 'test',
				phase: null,
				segments: [
					{
						id: 'study-segment',
						clipNumber: 1,
						referencePoseAvailable: true,
						durationSeconds: 2,
						inputVersion,
						metricReleaseId: serverMetricReleaseId,
						videoUrl: '/api/synthetic/participant.mp4',
						poseUrl: '/api/synthetic/participant.csv',
						referencePoseUrl: '/api/synthetic/reference.csv',
						referenceVideoUrl: '/api/synthetic/reference.mp4',
						referenceClipStartSeconds: 0,
						referenceVideoMirrored: true
					}
				]
			};
			if (retryMultiSegment)
				performance.segments.push({
					...performance.segments[0],
					id: 'retry-segment',
					clipNumber: 2
				});
			return route.fulfill({
				json: pathname.endsWith('/performance/performance')
					? performance
					: { performances: [performance] }
			});
		}
		return route.fulfill({ status: 404, body: 'Synthetic endpoint unavailable' });
	});
	const visit = async (query = '') => {
		await page.mouse.move(1, 1);
		await page.goto(`${base}/research/${routeName}${query}`);
		await page.waitForFunction(() => document.documentElement.dataset.discrepancyProof === 'ready');
	};
	await visit();
	const note = page.getByRole('textbox', { name: 'Observation', exact: true });
	const save = page.getByRole('button', { name: 'Save observation', exact: true });
	await note.fill('Synthetic observation for account A');
	await save.click();
	await page
		.getByText('Synthetic lost response. Your draft is retained.', { exact: true })
		.waitFor();
	assert.equal(submissions.length, 1);
	assert.equal(submissions[0].inputVersion, 'a'.repeat(64));
	assert.equal(submissions[0].metricReleaseId, metricReleaseId);
	assert.match(submissions[0].mutationId, /^[0-9a-f-]{36}$/);
	await page.reload();
	await page.getByText('Draft restored from this browser', { exact: true }).waitFor();
	assert.equal(await note.inputValue(), 'Synthetic observation for account A');
	await save.click();
	await page
		.getByText('Synthetic lost response. Your draft is retained.', { exact: true })
		.waitFor();
	assert.equal(
		submissions[0].mutationId,
		submissions[1].mutationId,
		'Retry retains UUID across reload'
	);
	await note.fill('Changed synthetic observation');
	await save.click();
	await page
		.getByText('Synthetic lost response. Your draft is retained.', { exact: true })
		.waitFor();
	assert.notEqual(
		submissions[1].mutationId,
		submissions[2].mutationId,
		'Changed payload gets new UUID'
	);
	ownerId = 'account-b';
	await page.reload();
	await note.waitFor();
	assert.equal(await note.inputValue(), '', 'Another account cannot restore account A draft');
	ownerId = 'account-a';
	inputVersion = 'b'.repeat(64);
	await page.reload();
	await page.getByRole('alert').filter({ hasText: 'Analysis inputs changed.' }).waitFor();
	assert.equal(
		await note.inputValue(),
		'Changed synthetic observation',
		'A newer GET cannot relabel or clear the loaded-input draft'
	);
	assert.equal(await save.isDisabled(), true);
	await page.screenshot({ path: path.join(output, 'stale-loaded-input-draft.png') });
	const beforeBlocked = submissions.length;
	await visit(`?inputVersion=${inputVersion}`);
	await note.waitFor();
	assert.equal(
		await note.inputValue(),
		'',
		'A genuinely new loaded input has its own draft namespace'
	);
	inputVersion = 'a'.repeat(64);
	serverMetricReleaseId = 'c'.repeat(64);
	await visit(`?metricReleaseId=${serverMetricReleaseId}`);
	await page.getByRole('alert').filter({ hasText: 'loaded metric version differs' }).waitFor();
	assert.equal(await note.inputValue(), 'Changed synthetic observation');
	assert.equal(
		await save.isDisabled(),
		true,
		'Old compiled client cannot save under a newer metric release'
	);
	await visit('?missingBinding=1');
	await page
		.getByRole('alert')
		.filter({ hasText: 'Loaded analysis details are missing' })
		.waitFor();
	assert.equal(await save.isDisabled(), true);
	assert.equal(submissions.length, beforeBlocked, 'Binding mismatches send no observation POST');
	serverMetricReleaseId = metricReleaseId;
	canAnnotate = false;
	await visit();
	await page
		.getByText(
			'Your current access allows viewing. Editor access is required to save observations.'
		)
		.waitFor();
	assert.equal(await note.isDisabled(), true);
	assert.equal(await save.isDisabled(), true);
	canAnnotate = true;
	await page.reload();
	await page.getByText('Draft restored from this browser', { exact: true }).waitFor();
	assert.equal(await note.inputValue(), 'Changed synthetic observation');
	fail = false;
	await save.click();
	await page.getByText('Observation saved to your research account.', { exact: true }).waitFor();
	assert.equal(submissions[2].mutationId, submissions[3].mutationId);
	assert.equal(await note.inputValue(), '');
	assert.equal(await page.getByText(/verified database backup/).count(), 0);
	assert.equal(await note.evaluate((element) => document.activeElement === element), true);
	await page.reload();
	await note.waitFor();
	assert.equal(await note.inputValue(), '');
	await visit('?backend=local');
	await note.fill('Synthetic local note');
	await save.click();
	await page
		.getByText('Observation saved with a verified database backup.', { exact: true })
		.waitFor();
	assert.equal(submissions.at(-1).mutationId, undefined);
	assert.equal(submissions.at(-1).inputVersion, undefined);
	assert.equal(submissions.at(-1).metricReleaseId, undefined);
	for (const mode of ['qijia2d', 'viona2d']) {
		retryMultiSegment = true;
		failPerformanceRequests = 1;
		performanceRequests = 0;
		const retryQuery = `?mode=${mode}&performance=performance&segment=retry-segment&review=discrepancy`;
		await visit(retryQuery);
		await page
			.getByRole('alert')
			.filter({ hasText: 'Performance request failed (503).' })
			.waitFor();
		await page
			.getByText(`${mode === 'qijia2d' ? 'Qijia2D' : 'Viona2D'} · hosted`, { exact: true })
			.waitFor();
		assert.equal(performanceRequests, 1);
		const failedUrl = page.url();
		await page.getByRole('button', { name: 'Retry', exact: true }).click();
		await note.waitFor();
		await page
			.locator('[aria-label="Discrepancy annotation"]')
			.getByText(/Discrepancy review\s*· Segment 2/)
			.waitFor();
		assert.equal(page.url(), failedUrl, 'Retry keeps the performance/segment/review intent URL');
		assert.equal(performanceRequests, 2, 'Retry requests the failed performance again');
		assert.equal(
			await page
				.getByRole('slider', { name: 'Seek participant timeline', exact: true })
				.inputValue(),
			'2',
			'Retry restores the later requested segment'
		);
		assert.equal(await page.getByRole('alert').count(), 0, 'Successful Retry clears the failure');
		retryMultiSegment = false;

		expireInitialMedia = true;
		await visit(`?mode=${mode}&performance=performance&segment=study-segment&review=discrepancy`);
		await note.waitFor();
		for (const side of ['participant', 'reference']) {
			const panel = page.locator(`[data-review-video="${side}"]`);
			await panel.getByRole('button', { name: 'Reload video', exact: true }).click();
			await panel
				.getByText('Video reloaded. Press play or replay the interval to continue.', {
					exact: true
				})
				.waitFor();
		}
		await page.waitForFunction(() =>
			[...document.querySelectorAll('video')].every(
				(video) => video.readyState >= 2 && video.videoWidth === 800
			)
		);
		const recoveredCrops = await page
			.locator('.pose-overlay')
			.evaluateAll((overlays) => overlays.map((overlay) => overlay.getAttribute('viewBox')));
		expireInitialMedia = false;

		await visit(`?mode=${mode}&performance=performance&segment=study-segment&review=discrepancy`);
		await note.waitFor();
		await page.waitForFunction(() =>
			[...document.querySelectorAll('video')].every((video) => video.readyState >= 2)
		);
		assert.deepEqual(
			await page
				.locator('.pose-overlay')
				.evaluateAll((overlays) => overlays.map((overlay) => overlay.getAttribute('viewBox'))),
			recoveredCrops,
			'Recovered metadata produces the same crop as a fresh successful load'
		);
		await page.getByRole('spinbutton', { name: /^Start/ }).fill('0.2');
		await page.getByRole('spinbutton', { name: /^End/ }).fill('0.65');
		await page.getByRole('button', { name: 'Replay interval', exact: true }).click();
		try {
			await page.waitForFunction(
				() => {
					const video = document.querySelector('video');
					return video?.paused && video.currentTime >= 0.6 && video.currentTime < 0.85;
				},
				{ timeout: 5000 }
			);
		} catch (error) {
			console.error(
				mode,
				await page.evaluate(() => ({
					videos: [...document.querySelectorAll('video')].map((v) => ({
						time: v.currentTime,
						paused: v.paused,
						error: v.error?.message
					})),
					text: document.querySelector('[aria-label="Discrepancy annotation"]')?.textContent
				}))
			);
			throw error;
		}
		// Fault injection: a media 403 after seeking models a long-paused signed source failing.
		await note.fill('Keep this draft while renewing the video');
		const participantPanel = page.locator('[data-review-video="participant"]');
		await participantPanel.locator('video').evaluate((video) => {
			video.src = '/api/synthetic/expired.mp4';
		});
		await participantPanel.getByRole('button', { name: 'Reload video', exact: true }).waitFor();
		const requestCount = mediaRequests.length;
		await page.waitForTimeout(200);
		assert.equal(
			mediaRequests.length,
			requestCount,
			'A media error does not trigger an automatic retry'
		);
		await participantPanel.getByRole('button', { name: 'Reload video', exact: true }).click();
		await participantPanel
			.getByText('Video reloaded. Press play or replay the interval to continue.', { exact: true })
			.waitFor();
		await page.waitForFunction(() => {
			const video = document.querySelector('[data-review-video="participant"] video');
			return (
				video?.readyState >= 2 &&
				video.paused &&
				video.currentTime >= 0.6 &&
				video.currentTime < 0.85
			);
		});
		assert.equal(await note.inputValue(), 'Keep this draft while renewing the video');
		assert.ok(
			mediaRequests.some(
				(request) => request.method === 'HEAD' && !request.url.includes('__research_reload')
			),
			'Access check uses the stable endpoint'
		);
		assert.ok(
			mediaRequests.some(
				(request) => request.method === 'GET' && request.url.includes('__research_reload')
			),
			'Explicit reload requests a fresh redirect'
		);
		const referencePanel = page.locator('[data-review-video="reference"]');
		await referencePanel.locator('video').evaluate((video) => {
			video.src = '/api/synthetic/expired.mp4';
		});
		await referencePanel.getByRole('button', { name: 'Reload video', exact: true }).waitFor();
		mediaAccess = 'forbidden';
		const beforeDenied = mediaRequests.length;
		await referencePanel.getByRole('button', { name: 'Reload video', exact: true }).click();
		await referencePanel
			.getByText(
				'Your account cannot access this video. Check your research access before retrying.',
				{ exact: true }
			)
			.waitFor();
		assert.equal(
			mediaRequests.length,
			beforeDenied + 1,
			'Denied recovery checks once without loading a video'
		);
		assert.equal(await note.inputValue(), 'Keep this draft while renewing the video');
		await page.screenshot({ path: path.join(output, `${mode}-video-denied.png`) });
		mediaAccess = 'ready';
		await referencePanel.getByRole('button', { name: 'Reload video', exact: true }).click();
		await referencePanel
			.getByText('Video reloaded. Press play or replay the interval to continue.', { exact: true })
			.waitFor();
		await page.getByRole('button', { name: 'Replay interval', exact: true }).click();
		await page.waitForFunction(() => {
			const video = document.querySelector('[data-review-video="participant"] video');
			return video?.paused && video.currentTime >= 0.6 && video.currentTime < 0.85;
		});
		for (const viewport of [
			{ width: 820, height: 1180 },
			{ width: 1180, height: 820 },
			{ width: 390, height: 844 }
		]) {
			await page.setViewportSize(viewport);
			await page.evaluate(() => scrollTo(0, 0));
			await page.screenshot({
				path: path.join(output, `${mode}-${viewport.width}x${viewport.height}-overview.png`)
			});
			await note.scrollIntoViewIfNeeded();
			assert.equal(
				await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
				true,
				`${mode} has no horizontal overflow at ${viewport.width}`
			);
			await page.screenshot({
				path: path.join(output, `${mode}-${viewport.width}x${viewport.height}.png`)
			});
		}
		assert.equal(
			await save.isEnabled(),
			true,
			`${mode} passes its loaded performance binding to the composer`
		);
		await save.click();
		await page.getByText('Observation saved to your research account.', { exact: true }).waitFor();
		assert.equal(submissions.at(-1).inputVersion, inputVersion);
		assert.equal(submissions.at(-1).metricReleaseId, metricReleaseId);
	}

	await visit('?mode=catalog');
	await page.getByRole('button', { name: /Synthetic dance/ }).waitFor();
	for (const [name, href] of [
		['Discrepancy review', '/research/discrepancy'],
		['Recordings', '/research/studies'],
		['Materials', '/research/materials'],
		['App menu', '/menu']
	])
		assert.equal(await page.getByRole('link', { name, exact: true }).getAttribute('href'), href);
	for (const viewport of [
		{ width: 820, height: 1180 },
		{ width: 1180, height: 820 },
		{ width: 390, height: 844 }
	]) {
		await page.setViewportSize(viewport);
		assert.equal(
			await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
			true
		);
		await page.screenshot({
			path: path.join(output, `catalog-${viewport.width}x${viewport.height}.png`)
		});
	}
	await visit('?mode=catalog&dance=Synthetic%20dance');
	await page.getByRole('button', { name: /Synthetic participant/ }).waitFor();
	await visit('?mode=queue');
	assert.equal(await page.getByRole('link', { name: 'Review', exact: true }).count(), 50);
	await page.getByRole('button', { name: /Show 50 more/ }).click();
	await page.waitForFunction(() => document.querySelectorAll('tbody tr').length === 60);
	assert.equal(await page.getByRole('link', { name: 'Review', exact: true }).count(), 60);
	if (errors.length) console.error({ failedRequests, serverLog });
	assert.deepEqual(errors, []);
	console.log(
		'PASS: hosted/local transport, draft isolation, viewer access, failed/reloaded/changed retries, success receipt/focus, both metric pages at tablet portrait/landscape and phone widths, expired/denied video reload preserving playhead/draft without autoplay, queue pagination, loaded-input and compiled-metric binding with stale-draft retention, same-URL performance Retry recovery into a later review segment. Synthetic evidence:',
		output
	);
} finally {
	await browser?.close();
	server?.kill('SIGTERM');
	await rm(routeDir, { recursive: true, force: true });
	await rm(scratch, { recursive: true, force: true });
}
