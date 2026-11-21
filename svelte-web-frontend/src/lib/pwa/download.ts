// File downloads that do not strand the installed app (PWA). In a standalone
// window, opening a file can replace the app with a viewer that has no way
// back, so the installed app hands files to the system share sheet instead
// (Save to Files on iOS, Downloads and other apps on Android). In a browser tab
// nothing changes. See documentation/pwa.md.
import { appHistory } from './standalone.svelte';

function canShareFile(file: File): boolean {
	return typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
}

function anchorDownload(file: File) {
	const url = URL.createObjectURL(file);
	const a = document.createElement('a');
	a.href = url;
	a.download = file.name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function isAbort(error: unknown) {
	return error instanceof DOMException && error.name === 'AbortError';
}

/** Saves a file made in the page (call from a click handler). */
export async function saveFile(file: File) {
	if (appHistory.standalone && canShareFile(file)) {
		try {
			await navigator.share({ files: [file] });
			return;
		} catch (error) {
			if (isAbort(error)) return;
		}
	}
	anchorDownload(file);
}

function notice(message: string) {
	const toast = document.createElement('div');
	toast.className = 'daisy-toast daisy-toast-center daisy-toast-bottom z-50';
	toast.setAttribute('role', 'status');
	const alert = document.createElement('div');
	alert.className = 'daisy-alert daisy-alert-info';
	alert.textContent = message;
	toast.append(alert);
	document.body.append(toast);
	setTimeout(() => toast.remove(), 4000);
}

/**
 * Svelte action for `<a href download>` links to same-origin files. In the
 * installed app, a tap fetches the file and opens the share sheet. Browsers
 * only allow sharing shortly after a tap, so when the fetch takes too long the
 * file is kept and the next tap shares it at once.
 */
export function standaloneDownload(link: HTMLAnchorElement, filename?: string) {
	let name = filename;
	let ready: File | null = null;
	let busy = false;
	const probe = () => new File([''], name ?? 'file.csv', { type: 'text/csv' });

	async function onClick(event: MouseEvent) {
		if (!appHistory.standalone || !canShareFile(probe())) return;
		event.preventDefault();
		if (busy) return;
		if (ready) {
			const file = ready;
			ready = null;
			await navigator.share({ files: [file] }).catch(() => {});
			return;
		}
		busy = true;
		link.setAttribute('aria-busy', 'true');
		try {
			const response = await fetch(link.href, { credentials: 'same-origin' });
			if (!response.ok) throw new Error(`Download failed (${response.status})`);
			const blob = await response.blob();
			const file = new File([blob], name ?? link.download ?? 'download', {
				type: blob.type || 'application/octet-stream'
			});
			try {
				await navigator.share({ files: [file] });
			} catch (error) {
				if (!isAbort(error)) {
					ready = file;
					notice('File ready. Tap the download button again to save it.');
				}
			}
		} catch (error) {
			notice(error instanceof Error ? error.message : 'Download failed');
		} finally {
			busy = false;
			link.removeAttribute('aria-busy');
		}
	}

	link.addEventListener('click', onClick);
	return {
		update(next?: string) {
			name = next;
			ready = null;
		},
		destroy() {
			link.removeEventListener('click', onClick);
		}
	};
}
