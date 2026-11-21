// Browser init script that makes a page believe it runs as an installed app
// (PWA). Chromium cannot emulate the display-mode media feature, so this
// patches matchMedia and iOS's navigator.standalone before any page script.
// It also records share-sheet calls in window.__shared (headless has no sheet).
// Use with context.addInitScript(emulateStandalone).
export function emulateStandalone() {
	const original = window.matchMedia.bind(window);
	window.matchMedia = (query) =>
		/display-mode:\s*standalone/.test(query)
			? /** @type {MediaQueryList} */ ({
					matches: true,
					media: query,
					onchange: null,
					addEventListener() {},
					removeEventListener() {},
					addListener() {},
					removeListener() {},
					dispatchEvent: () => false
				})
			: original(query);
	Object.defineProperty(navigator, 'standalone', { get: () => true });
	window.__shared = [];
	navigator.canShare = (data) => Boolean(data?.files?.length);
	navigator.share = async (data) => {
		window.__shared.push(...(data.files ?? []).map((f) => ({ name: f.name, size: f.size })));
	};
}
