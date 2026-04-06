import { SupabaseClient, Session, type User } from '@supabase/supabase-js';

// See https://kit.svelte.dev/docs/types#app
// for information about these interfaces
declare global {
	namespace App {
		//   interface Error {}
		interface Locals {
			supabase: SupabaseClient;
			safeGetSession(): Promise<{
				session: Session | null;
				user: User | null;
			}>;
			session: Session | null;
			user: User | null;
		}
		interface PageData {
			session: Session | null;
		}
		// interface Error {}
		// interface Platform {}
	}
}

export {};

// src/app.d.ts
