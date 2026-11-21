// Screenshot scenarios for scripts/ui-screenshots/capture.mjs.
//
// Each scenario opens one dev-only fixture page (`/dev/ui-harness/<id>`, data in
// src/lib/server/ui-harness.ts) and captures one or more states. Keep these in
// step with the UI: when you change a screen, add or update its scenario here.
//
// - `media`: object paths in the research-chi25 bucket the page shows. The
//   runner fetches them into the git-ignored local-data/ cache when cloud
//   credentials exist; otherwise the page gets a synthetic video.
// - `mock(page)`: Playwright request mocks, so nothing is written anywhere.
// - `states`: [{ name, label, run(page) }]; each state is captured at every viewport.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const localData = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../local-data');
const PAJAMA_VIDEO = 'materials/shared/97c46213ae243c6f1045c82a/video.mp4';
const REFERENCE_VIDEOS = {
	bartender: 'materials/shared/478a912dd8bcea0a12fb6cbf/video.mp4',
	'last-christmas': 'materials/shared/0907884e802f43cf2623d085/video.mp4',
	'mad-at-disney': 'materials/shared/93daeade59bf35564532c6db/video.mp4',
	'pajama-party': PAJAMA_VIDEO
};
// One participant recording (opaque bucket id) so recording screens look real. The
// file stays in the git-ignored local-data/ cache; fixture labels are made up.
const PARTICIPANT_MEDIA = '3db6b63d08e0acb08dfed42e';
const PARTICIPANT_VIDEO = `chi25_study1/${PARTICIPANT_MEDIA}/video.mp4`;
const PARTICIPANT_POSE = `chi25_study1/${PARTICIPANT_MEDIA}/pose2d.raw.csv`;

/** Local path of cached bucket media, or the synthetic video when it is not cached. */
function mediaFile(objectPath) {
	const file = path.join(localData, 'research-chi25', objectPath);
	return existsSync(file) ? file : path.join(localData, 'ui-harness', 'synthetic.mp4');
}

/** A JPEG still from cached media, made once with ffmpeg, for thumbnail requests. */
function still(objectPath, seconds = 1) {
	const source = mediaFile(objectPath);
	const out = path.join(
		localData,
		'ui-harness',
		'stills',
		`${objectPath.replaceAll('/', '_')}-${seconds}.jpg`
	);
	if (!existsSync(out)) {
		mkdirSync(path.dirname(out), { recursive: true });
		execFileSync('ffmpeg', [
			'-loglevel',
			'error',
			'-ss',
			String(seconds),
			'-i',
			source,
			'-frames:v',
			'1',
			'-vf',
			'scale=640:-2',
			out
		]);
	}
	return out;
}

const DANCES = ['bartender', 'last-christmas', 'mad-at-disney', 'pajama-party'];
const CONDITIONS = ['control', 'skeleton', 'sheetmotion'];
/** Made-up participant catalog for the performance browser. */
const performanceCatalog = () => ({
	performances: DANCES.flatMap((dance, d) =>
		Array.from({ length: 5 + d }, (_, i) => ({
			id: `fixture-${dance}-${i}`,
			participantLabel: `P${9001 + i + d * 10}`,
			study: (i + d) % 3 ? 'study1' : 'study2',
			danceName: dance,
			condition: CONDITIONS[i % CONDITIONS.length],
			phase: i % 4 === 3 ? 'learning' : null,
			segments: Array.from({ length: 3 + ((i + d) % 3) }, (_, c) => ({
				id: `fixture-${dance}-${i}-${c}`,
				clipNumber: c + 1
			}))
		}))
	)
});

/** Waits until the page's first <video> has a decoded frame. */
export async function videoReady(page) {
	await page.waitForFunction(() => (document.querySelector('video')?.readyState ?? 0) >= 2, null, {
		timeout: 20_000
	});
}

const saveOk = (page) =>
	page.route('**/api/research/key-moves/**', (route) =>
		route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify({ id: 42, createdAt: new Date().toISOString() })
		})
	);

export const scenarios = [
	{
		id: 'key-moves-index',
		states: [{ name: 'list', label: 'Dance list', run: async () => {} }]
	},
	{
		id: 'key-moves-empty',
		media: [PAJAMA_VIDEO],
		mock: saveOk,
		states: [{ name: 'empty', label: 'Empty editor', run: videoReady }]
	},
	{
		id: 'key-moves-marked',
		media: [PAJAMA_VIDEO],
		mock: async (page) => {
			let conflict = false;
			page.exposeFunction('__harnessConflict', () => (conflict = true));
			await page.route('**/api/research/key-moves/**', (route) =>
				conflict
					? route.fulfill({
							status: 409,
							contentType: 'application/json',
							body: JSON.stringify({
								message:
									'These key moves were changed in another tab or device. Reload to see the newest version.'
							})
						})
					: route.fulfill({
							status: 200,
							contentType: 'application/json',
							body: JSON.stringify({ id: 42, createdAt: new Date().toISOString() })
						})
			);
		},
		states: [
			{
				name: 'selected',
				label: 'Move tab with a timeline move selected',
				run: async (page) => {
					await videoReady(page);
					await page.locator('[data-track] [role="button"]', { hasText: 'Fixture move 2' }).click();
					await page.waitForTimeout(400);
				}
			},
			{
				name: 'all-moves',
				label: 'All moves tab',
				run: async (page) => {
					await page.getByRole('tab', { name: /All moves/ }).click();
				}
			},
			{
				name: 'tracks',
				label: 'Tracks tab',
				run: async (page) => {
					await page.getByRole('tab', { name: /Tracks/ }).click();
				}
			},
			{
				name: 'conflict',
				label: 'Save conflict banner',
				run: async (page) => {
					await page.evaluate(() => window.__harnessConflict());
					await page.getByRole('tab', { name: 'Move', exact: true }).click();
					await page.locator('#move-name').fill('Fixture move 2 (edited)');
					await page.getByText('Not saved: conflict').waitFor({ timeout: 10_000 });
				}
			}
		]
	},
	{
		id: 'research-home',
		media: [...Object.values(REFERENCE_VIDEOS), PARTICIPANT_VIDEO],
		mock: async (page) => {
			await page.route('**/api/dev/participant-catalog', (route) =>
				route.fulfill({ json: performanceCatalog() })
			);
			await page.route('**/api/dev/reference-clips/*/thumbnail', (route) => {
				const dance = new URL(route.request().url()).pathname.split('/').at(-2);
				return route.fulfill({ path: still(REFERENCE_VIDEOS[dance] ?? PAJAMA_VIDEO, 4) });
			});
			await page.route('**/api/dev/participant-catalog/performance/*/thumbnail', (route) => {
				const n = Number(new URL(route.request().url()).pathname.split('/').at(-2).at(-1));
				return route.fulfill({ path: still(PARTICIPANT_VIDEO, 1 + (n % 4)) });
			});
		},
		states: [
			{
				name: 'dances',
				label: 'Performance analysis: choose a dance',
				run: async (page) => {
					await page.getByRole('button', { name: /Last Christmas/ }).waitFor();
					await page.waitForLoadState('networkidle');
				}
			},
			{
				name: 'performances',
				label: 'Performance analysis: participants for one dance',
				run: async (page) => {
					await page.getByRole('button', { name: /Last Christmas/ }).click();
					await page.getByRole('button', { name: /P9011/ }).waitFor();
					await page.waitForLoadState('networkidle');
				}
			}
		]
	},
	{
		id: 'discrepancy',
		mock: (page) =>
			page.route('**/api/dev/discrepancy/scores**', (route) => {
				const ids = new URL(route.request().url()).searchParams.get('ids').split(',');
				return route.fulfill({
					json: ids.map((segmentId, i) => ({
						segmentId,
						inputVersion: null,
						score: 1.2 + ((Number(segmentId.split('-').at(-1)) * 0.73 + i) % 3.4),
						valid: 90,
						total: 90
					}))
				});
			}),
		states: [
			{
				name: 'table',
				label: 'Discrepancy review',
				run: async (page) => {
					await page.getByText(/pts/).first().waitFor({ timeout: 10_000 });
				}
			}
		]
	},
	{
		id: 'studies-list',
		states: [{ name: 'list', label: 'Research recordings', run: async () => {} }]
	},
	{
		id: 'study-recording',
		media: [PARTICIPANT_VIDEO, PARTICIPANT_POSE],
		mock: async (page) => {
			await page.route(`**/research/studies/media/${PARTICIPANT_MEDIA}/video`, (route) =>
				route.fulfill({ path: mediaFile(PARTICIPANT_VIDEO), contentType: 'video/mp4' })
			);
			await page.route(`**/research/studies/media/${PARTICIPANT_MEDIA}/pose`, (route) => {
				const file = path.join(localData, 'research-chi25', PARTICIPANT_POSE);
				return existsSync(file)
					? route.fulfill({ path: file, contentType: 'text/csv' })
					: route.fulfill({ status: 404, body: 'not cached' });
			});
		},
		states: [
			{
				name: 'pose',
				label: 'Recording with raw pose overlay',
				run: async (page) => {
					await videoReady(page);
					await page.locator('svg[aria-label="Raw pose overlay"]').waitFor({ timeout: 10_000 });
				}
			}
		]
	},
	{
		id: 'materials',
		media: Object.values(REFERENCE_VIDEOS),
		mock: (page) =>
			page.route('**/research/materials/file/*', (route) => {
				const id = new URL(route.request().url()).pathname.split('/').at(-1);
				const video = Object.values(REFERENCE_VIDEOS).find((p) => p.includes(id));
				return video
					? route.fulfill({ path: mediaFile(video), contentType: 'video/mp4' })
					: route.fulfill({ status: 404, body: 'fixture' });
			}),
		states: [
			{
				name: 'list',
				label: 'Research materials',
				run: async (page) => {
					await page.waitForFunction(
						() => [...document.querySelectorAll('video')].every((video) => video.readyState >= 2),
						null,
						{ timeout: 20_000 }
					);
					// Let the browser drop its buffering spinner over each poster frame.
					await page.waitForTimeout(1500);
				}
			}
		]
	},
	{
		id: 'source-records',
		states: [{ name: 'tables', label: 'Local source records', run: async () => {} }]
	}
];
