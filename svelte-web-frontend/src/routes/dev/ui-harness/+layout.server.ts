import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { isLoopbackClientAddress } from '$lib/server/client-address';
import type { LayoutServerLoad } from './$types';

/** The screenshot harness exists only on a loopback dev server. */
export const load: LayoutServerLoad = async ({ getClientAddress, setHeaders }) => {
	if (!dev || !isLoopbackClientAddress(getClientAddress())) error(404);
	setHeaders({ 'Cache-Control': 'private, no-store' });
};
