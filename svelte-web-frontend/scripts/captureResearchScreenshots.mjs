import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const frontendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultOutputDir = path.join(frontendRoot, 'artifacts', 'research-screenshots');

function optionsFromArgs(args) {
	const options = {
		baseUrl: process.env.RESEARCH_SCREENSHOT_BASE_URL ?? 'http://127.0.0.1:5178',
		outputDir: defaultOutputDir,
		includeMetrics: true
	};
	for (let index = 0; index < args.length; index += 1) {
		const argument = args[index];
		if (argument === '--skip-metrics') {
			options.includeMetrics = false;
			continue;
		}
		if (argument === '--base-url' || argument === '--output-dir') {
			const value = args[++index];
			if (!value) throw new Error(`${argument} needs a value`);
			if (argument === '--base-url') options.baseUrl = value;
			else options.outputDir = path.resolve(value);
			continue;
		}
		throw new Error(`Unknown option: ${argument}`);
	}
	const url = new URL(options.baseUrl);
	if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
		throw new Error('Research screenshots require an HTTP server on loopback');
	options.baseUrl = url.origin;
	return options;
}

async function waitForVisibleImages(page, selector) {
	await page.locator(selector).first().waitFor();
	await page.waitForFunction(
		(selector) =>
			[...document.querySelectorAll(selector)]
				.filter((image) => image.getBoundingClientRect().top < innerHeight)
				.every((image) => image.complete && image.naturalWidth > 0),
		selector
	);
}

async function settlePage(page) {
	await page.evaluate(async () => {
		await document.fonts.ready;
	});
}

async function seekReviewVideo(page) {
	const video = page.locator('video').first();
	await page.waitForFunction(() => document.querySelector('video')?.readyState >= 1);
	await video.evaluate(async (element) => {
		const target = Math.min(2, Math.max(0, element.duration / 2));
		if (target <= 0 || !Number.isFinite(target)) return;
		await new Promise((resolve, reject) => {
			const timeout = setTimeout(() => reject(new Error('Video seek timed out')), 10_000);
			element.addEventListener(
				'seeked',
				() => {
					clearTimeout(timeout);
					resolve();
				},
				{ once: true }
			);
			element.currentTime = target;
		});
	});
	await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
}

function escapeHtml(value) {
	return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

async function makeContactSheet(browser, outputDir, captures) {
	const cards = await Promise.all(
		captures.map(async ({ label, file }) => {
			const data = (await readFile(path.join(outputDir, file))).toString('base64');
			return `<figure><img src="data:image/png;base64,${data}" alt=""><figcaption>${escapeHtml(label)}</figcaption></figure>`;
		})
	);
	const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
	try {
		await page.setContent(`<!doctype html><html><head><style>
			* { box-sizing: border-box; } body { margin: 0; padding: 24px; background: #f3f4f6; color: #17212b; font: 16px system-ui, sans-serif; }
			h1 { margin: 0 0 20px; font-size: 28px; } main { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; }
			figure { margin: 0; padding: 10px; border-radius: 12px; background: white; box-shadow: 0 1px 8px #0002; }
			img { display: block; width: 100%; height: 350px; object-fit: contain; object-position: top; background: #e5e7eb; }
			figcaption { padding: 10px 4px 2px; font-weight: 650; }
		</style></head><body><h1>Local research workspace</h1><main>${cards.join('')}</main></body></html>`);
		await page.screenshot({ path: path.join(outputDir, 'contact-sheet.png'), fullPage: true });
	} finally {
		await page.close();
	}
}

async function main() {
	const options = optionsFromArgs(process.argv.slice(2));
	await mkdir(options.outputDir, { recursive: true });
	const browser = await chromium.launch();
	const context = await browser.newContext({
		viewport: { width: 1440, height: 900 },
		deviceScaleFactor: 1,
		colorScheme: 'light',
		reducedMotion: 'reduce'
	});
	const page = await context.newPage();
	page.setDefaultTimeout(30_000);
	const captures = [];
	const capture = async (file, label) => {
		await settlePage(page);
		await page.screenshot({ path: path.join(options.outputDir, file), animations: 'disabled' });
		captures.push({ label, file, url: page.url(), viewport: page.viewportSize() });
		process.stdout.write(`Captured ${file}\n`);
	};

	try {
		await page.goto(`${options.baseUrl}/research`, { waitUntil: 'domcontentloaded' });
		await waitForVisibleImages(page, 'section[aria-label="Choose a dance"] img');
		await capture('research-dances.png', 'Browse performances: choose a dance');

		await page
			.locator('section[aria-label="Choose a dance"]')
			.getByRole('button', { name: /Bartender/ })
			.click();
		await waitForVisibleImages(page, 'section[aria-label="Participant performances"] img');
		await capture('research-performances.png', 'Browse performances: Bartender');

		if (options.includeMetrics) {
			await page.locator('section[aria-label="Participant performances"] button').first().click();
			await page.waitForURL('**/metrics/qijia2d?*');
			await page.getByLabel('Seek participant timeline').waitFor();
			await page.evaluate(() => window.scrollTo(0, 0));
			await capture('qijia2d-inspector.png', 'Qijia2D metric inspector');

			await page.getByLabel('Visualized metric').selectOption('viona2d');
			await page.waitForURL('**/metrics/viona2d?*');
			await page.getByLabel('Seek participant timeline').waitFor();
			await page.evaluate(() => window.scrollTo(0, 0));
			await capture('viona2d-inspector.png', 'Viona2D metric inspector');
		}

		await page.goto(`${options.baseUrl}/research/records`, { waitUntil: 'domcontentloaded' });
		await page.getByRole('heading', { name: 'Research source records' }).waitFor();
		const reviewSection = page.locator(
			'section[aria-label="Whole-video segment usability reviews"]'
		);
		await reviewSection.locator('tbody tr').first().waitFor();
		await capture('research-records.png', 'Research source records');

		const sectionTop = await reviewSection.evaluate(
			(element) => element.getBoundingClientRect().top + window.scrollY
		);
		await page.evaluate((top) => window.scrollTo(0, Math.max(0, top - 90)), sectionTop);
		await capture('usability-table.png', 'Whole-video usability table');

		await reviewSection.getByRole('link', { name: 'Rate more videos’ usability' }).click();
		await page.waitForURL('**/research/records/rate/*');
		await page.getByRole('heading', { name: 'Rate pose-tracking usability' }).waitFor();
		await page.locator('form fieldset:not([disabled])').waitFor();
		await seekReviewVideo(page);
		await page.evaluate(() => window.scrollTo(0, 0));
		await capture('usability-rating.png', 'Rate video usability: clip and overlay');

		const formTop = await page
			.locator('form[method="POST"]')
			.evaluate((element) => element.getBoundingClientRect().top + window.scrollY);
		await page.evaluate((top) => window.scrollTo(0, Math.max(0, top - 90)), formTop);
		await capture('usability-rating-form.png', 'Rate video usability: rating form');

		await page.goto(`${options.baseUrl}/research/frames`, { waitUntil: 'domcontentloaded' });
		await page.getByRole('heading', { name: 'Frame corrections' }).waitFor();
		await capture('frame-corrections.png', 'Frame correction queue');
		const referenceCase = page.locator(
			'a[href="/research/frames/frame-usability-video-usability-002"]'
		);
		if (await referenceCase.count()) {
			await referenceCase.first().click();
			await page.waitForURL('**/research/frames/frame-usability-video-usability-002');
			await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
			await capture('frame-review-desktop.png', 'Reference video frame review: desktop');
			for (const [width, height, filename] of [
				[375, 667, 'frame-review-phone-small.png'],
				[390, 844, 'frame-review-phone.png'],
				[994, 575, 'frame-review-landscape.png']
			]) {
				await page.setViewportSize({ width, height });
				for (const name of ['Current frame', 'Previous frame', 'Unusable', 'Flawed', 'Good']) {
					const control = page.getByRole(name === 'Current frame' ? 'slider' : 'button', {
						name,
						exact: true
					});
					const box = await control.boundingBox();
					if (!box || box.y < 0 || box.y + box.height > height)
						throw new Error(`${name} is outside the ${width}×${height} viewport`);
				}
				await capture(filename, `Reference video frame review: ${width}×${height}`);
				if (width === 390) {
					await page.getByRole('button', { name: 'More' }).first().click();
					await page.getByRole('dialog', { name: 'Frame review tools' }).waitFor();
					await capture(
						'frame-review-phone-tools.png',
						'Reference video frame review: mobile tools'
					);
					await page.getByRole('button', { name: 'Close' }).click();
				}
			}
		}

		await makeContactSheet(browser, options.outputDir, captures);
		await writeFile(
			path.join(options.outputDir, 'manifest.json'),
			JSON.stringify(
				{ capturedAt: new Date().toISOString(), baseUrl: options.baseUrl, captures },
				null,
				2
			)
		);
		process.stdout.write(`Contact sheet: ${path.join(options.outputDir, 'contact-sheet.png')}\n`);
	} finally {
		await context.close();
		await browser.close();
	}
}

await main();
