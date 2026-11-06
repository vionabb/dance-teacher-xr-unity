import dotenv from 'dotenv';
import fs from 'fs';

/**
 * Loads Supabase credentials for the sync scripts.
 * Local runs read src/env/.env.local; `--production` runs read src/env/.env.remote.
 * @param {boolean} onProduction - Whether to target hosted Supabase.
 * @returns {{ url: string | undefined, key: string | undefined }}
 */
export function loadSupabaseEnv(onProduction) {
	const name = onProduction ? '.env.remote' : '.env.local';
	const path = `src/env/${name}`;
	if (!fs.existsSync(path)) {
		throw new Error(`Missing ${path}. Copy src/env/${name}.example to it and fill in the values.`);
	}
	dotenv.config({ path, quiet: true });
	return {
		url: process.env.NEXT_PUBLIC_SUPABASE_URL,
		key: process.env.SUPABASE_SERVICE_ROLE_KEY
	};
}
