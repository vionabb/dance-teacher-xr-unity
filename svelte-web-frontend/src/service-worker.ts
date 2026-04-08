/// <reference lib="webworker" />

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './lib/ai/backend/SupabaseTypes';
import SupabaseDataBackend from '$lib/ai/backend/SupabaseDatabackend';

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
self.addEventListener('message', (e: ExtendableMessageEvent) => {
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
