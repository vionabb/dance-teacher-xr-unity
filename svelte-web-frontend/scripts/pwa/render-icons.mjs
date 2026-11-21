// Renders the PWA icons in static/pwa/ from static/pwa/icon.svg with Playwright Chromium.
// Run from svelte-web-frontend/: node scripts/pwa/render-icons.mjs
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const svg = await readFile('static/pwa/icon.svg', 'utf8');
const outputs = [
	{ file: 'static/pwa/icon-192.png', size: 192 },
	{ file: 'static/pwa/icon-512.png', size: 512 },
	{ file: 'static/pwa/maskable-512.png', size: 512 },
	{ file: 'static/pwa/apple-touch-icon.png', size: 180 }
];
const browser = await chromium.launch();
try {
	for (const { file, size } of outputs) {
		const page = await browser.newPage({ viewport: { width: size, height: size } });
		await page.setContent(
			`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`
		);
		await page.screenshot({ path: file, omitBackground: false });
		await page.close();
		console.log(`wrote ${file}`);
	}
} finally {
	await browser.close();
}
