/// <reference lib="webworker" />

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './lib/ai/backend/SupabaseTypes';
import SupabaseDataBackend from '$lib/ai/backend/SupabaseDatabackend';
import { version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

// Installed-app (PWA) support. Pages are private and must stay uncached, so the
// worker only keeps a static offline page: when a navigation fails for lack of
// a connection, the standalone window shows it (with Try again and Home)
// instead of the browser's error page, which has no way back.
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
	}
});

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
