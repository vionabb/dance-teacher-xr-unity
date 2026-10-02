import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { isLoopbackClientAddress } from '$lib/server/participant-dataset-catalog';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ getClientAddress }) => {
	if (!dev || !isLoopbackClientAddress(getClientAddress())) error(404);
	return {};
};
