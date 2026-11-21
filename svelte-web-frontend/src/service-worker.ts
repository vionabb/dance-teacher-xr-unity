/// <reference lib="webworker" />

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './lib/ai/backend/SupabaseTypes';
import SupabaseDataBackend from '$lib/ai/backend/SupabaseDatabackend';
import { build, version } from '$service-worker';
import {
	IMMUTABLE_CACHE,
	MEDIA_CACHE,
	MEDIAPIPE_CACHE,
	cacheRule,
	rangeResponse
} from '$lib/pwa/sw-caching';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Installed-app (PWA) support; see documentation/pwa.md. Pages are private and
// stay uncached. The worker keeps a static offline page (shown with Try again
// and Home when a navigation fails for lack of a connection, instead of the
// browser's error page), and caches reference videos and poses, the MediaPipe
// model and the hashed app build (rules in $lib/pwa/sw-caching.ts).
const OFFLINE_CACHE = `offline-${version}`;
const OFFLINE_URL = '/offline.html';
const OFFLINE_ASSETS = [OFFLINE_URL, '/pwa/icon-192.png'];

sw.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(OFFLINE_CACHE)
			.then((cache) => cache.addAll(OFFLINE_ASSETS))
			.then(() => sw.skipWaiting())
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key.startsWith('offline-') && key !== OFFLINE_CACHE)
						.map((key) => caches.delete(key))
				)
			)
			.then(pruneImmutable)
			.then(() => sw.clients.claim())
	);
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(async () => {
				const cache = await caches.open(OFFLINE_CACHE);
				return (await cache.match(OFFLINE_URL)) ?? Response.error();
			})
		);
		return;
	}
	const url = new URL(request.url);
	if (url.origin === sw.location.origin && OFFLINE_ASSETS.includes(url.pathname)) {
		event.respondWith(
			caches
				.open(OFFLINE_CACHE)
				.then(async (cache) => (await cache.match(request)) ?? fetch(request))
		);
		return;
	}
	const rule = cacheRule(url, sw.location.origin);
	if (rule.kind === 'reference-media') event.respondWith(referenceMedia(event, url));
	else if (rule.kind === 'immutable') event.respondWith(cacheFirst(IMMUTABLE_CACHE, request));
	else if (rule.kind === 'mediapipe') event.respondWith(staleWhileRevalidate(event, request));
});

sw.addEventListener('message', (event: ExtendableMessageEvent) => {
	// Sent by the page on sign-out: reference media came from a signed-in session.
	if ((event.data as { type?: string })?.type === 'CLEAR_RESEARCH_CACHE')
		event.waitUntil(caches.delete(MEDIA_CACHE));
});

/** Drops hashed build files that the current build no longer uses. */
async function pruneImmutable() {
	const cache = await caches.open(IMMUTABLE_CACHE);
	const current = new Set(build.map((file) => new URL(file, sw.location.origin).href));
	const keys = await cache.keys();
	await Promise.all(keys.filter((key) => !current.has(key.url)).map((key) => cache.delete(key)));
}

async function cacheFirst(cacheName: string, request: Request) {
	const cache = await caches.open(cacheName);
	const hit = await cache.match(request);
	if (hit) return hit;
	const response = await fetch(request);
	if (response.ok && response.status === 200) await cache.put(request, response.clone());
	return response;
}

async function staleWhileRevalidate(event: FetchEvent, request: Request) {
	const cache = await caches.open(MEDIAPIPE_CACHE);
	const hit = await cache.match(request);
	const refresh = fetch(request).then(async (response) => {
		if (response.ok && response.status === 200) await cache.put(request, response.clone());
		return response;
	});
	if (hit) {
		event.waitUntil(refresh.catch(() => undefined));
		return hit;
	}
	return refresh;
}

const filling = new Set<string>();

/** Downloads a whole reference file into the cache (video players only ask for ranges). */
async function fillMediaCache(url: URL) {
	if (filling.has(url.href)) return;
	filling.add(url.href);
	try {
		const sameOrigin = url.origin === sw.location.origin;
		// cors, not same-origin: research videos redirect to a signed Storage URL.
		const response = await fetch(url, {
			mode: 'cors',
			credentials: sameOrigin ? 'same-origin' : 'omit'
		});
		if (!response.ok || response.status !== 200) return;
		// Rebuild the response so a followed redirect (signed Storage URL) is not stored.
		const headers = new Headers();
		const type = response.headers.get('content-type');
		if (type) headers.set('Content-Type', type);
		const body = await response.blob();
		headers.set('Content-Length', String(body.size));
		await (await caches.open(MEDIA_CACHE)).put(url.href, new Response(body, { headers }));
	} finally {
		filling.delete(url.href);
	}
}

/**
 * Cache-first for reference videos and poses. Range requests (video players)
 * are answered from the cached file once it is complete; until then they go to
 * the network while the whole file downloads in the background.
 */
async function referenceMedia(event: FetchEvent, url: URL) {
	const { request } = event;
	const cache = await caches.open(MEDIA_CACHE);
	const hit = await cache.match(url.href);
	const range = request.headers.get('range');
	if (hit) return range ? rangeResponse(hit, range) : hit;
	if (range) {
		event.waitUntil(fillMediaCache(url).catch(() => undefined));
		return fetch(request);
	}
	try {
		await fillMediaCache(url);
	} catch {
		/* fall through to the network */
	}
	return (await cache.match(url.href)) ?? fetch(request);
}

export type ServiceWorkerMessageSession = {
	type: 'SUPABASE_SESSION';
	session: {
		supabase_url: string;
		supabase_anon_key: string;
		access_token: string;
		refresh_token: string;
		user_id: string;
	};
};

export type ServiceWorkerMessage = ServiceWorkerMessageSession;

type AsyncStorage = {
	getItem: (k: string) => Promise<string | null>;
	setItem: (k: string, v: string) => Promise<void>;
	removeItem: (k: string) => Promise<void>;
};

// tiny async IDB storage adapter
const idb: AsyncStorage = {
	async getItem(k) {
		return await caches.open('sb-auth').then(async (c) => {
			const r = await c.match(new Request('https://auth/' + k));
			return r ? await r.text() : null;
		});
	},
	async setItem(k, v) {
		const c = await caches.open('sb-auth');
		await c.put(new Request('https://auth/' + k), new Response(v));
	},
	async removeItem(k) {
		const c = await caches.open('sb-auth');
		await c.delete('https://auth/' + k);
	}
};

let supabase: SupabaseClient<Database> | null = null;

// receive session from the page and install it
sw.addEventListener('message', (e: ExtendableMessageEvent) => {
	const msg = e.data as ServiceWorkerMessage;
	if (!msg.type) {
		console.error('Unknown message received in SW', msg);
		return;
	}
	if (msg?.type === 'SUPABASE_SESSION') {
		const s = msg.session; // { access_token, refresh_token }

		const supabaseUrl = s.supabase_url;
		const supabaseAnonKey = s.supabase_anon_key;
		const accessToken = s.access_token;
		const refreshToken = s.refresh_token;
		const userId = s.user_id;

		if (!supabaseUrl || !supabaseAnonKey) {
			console.error('Missing Supabase URL or anon key');
			return;
		}

		if (!supabase) {
			supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
				auth: { persistSession: true, autoRefreshToken: true, storage: idb }
			});
		}
		e.waitUntil(
			supabase.auth.setSession({
				access_token: accessToken,
				refresh_token: refreshToken
			})
		);
		new SupabaseDataBackend(supabase, userId);
		return;
	}
});
