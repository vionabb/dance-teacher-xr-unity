// In-app history controls and installed-app (PWA) detection. A standalone
// window has no browser chrome (no back/forward buttons, no address bar), so
// the app shows its own Back/Forward, in browser tabs too to keep both alike.
// See documentation/pwa.md.
import { browser } from '$app/environment';
import { goto } from '$app/navigation';

type NavigationApi = EventTarget & { canGoBack: boolean; canGoForward: boolean };

function navigationApi(): NavigationApi | undefined {
	return browser ? (window as unknown as { navigation?: NavigationApi }).navigation : undefined;
}

/** True when the page runs as an installed app (Android/desktop display-mode, or iOS home screen). */
export function detectStandalone(): boolean {
	if (!browser) return false;
	const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
	return (
		iosStandalone ||
		['standalone', 'fullscreen', 'minimal-ui'].some(
			(mode) => window.matchMedia?.(`(display-mode: ${mode})`).matches
		)
	);
}

class AppHistory {
	standalone = $state(false);
	/** Whether to offer Forward: false until mounted, true when the browser cannot tell. */
	canGoForward = $state(false);

	init() {
		this.standalone = detectStandalone();
		document.documentElement.toggleAttribute('data-standalone', this.standalone);
		this.refresh();
		const refresh = () => this.refresh();
		navigationApi()?.addEventListener('currententrychange', refresh);
		window.addEventListener('popstate', refresh);
	}

	refresh() {
		const api = navigationApi();
		this.canGoForward = api ? api.canGoForward : true;
	}

	/** Back through the app's history, or Home when the app was opened on this page. */
	back(fallback = '/menu') {
		const api = navigationApi();
		const canGoBack = api ? api.canGoBack : history.length > 1;
		if (canGoBack) history.back();
		else void goto(fallback);
	}

	forward() {
		history.forward();
	}
}

export const appHistory = new AppHistory();
