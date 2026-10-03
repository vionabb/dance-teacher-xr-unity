import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { isLoopbackClientAddress } from '$lib/server/client-address';
import { readResearchRecords, researchDatabasePath } from '$lib/server/research-store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ getClientAddress }) => {
	if (!dev || !isLoopbackClientAddress(getClientAddress())) error(404);
	return await readResearchRecords(researchDatabasePath());
};
