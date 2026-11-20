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

const PAJAMA_VIDEO = 'materials/shared/97c46213ae243c6f1045c82a/video.mp4';

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
	}
];
