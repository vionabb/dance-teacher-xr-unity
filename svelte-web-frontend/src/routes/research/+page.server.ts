import { dev } from '$app/environment';
import { error, redirect } from '@sveltejs/kit';
import { isLoopbackClientAddress } from '$lib/server/participant-dataset-catalog';
import { requireResearchStudies } from '$lib/server/research-hosted';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ getClientAddress, locals }) => {
	if (!dev) {
		await requireResearchStudies(locals);
		redirect(303, '/research/studies');
	}
	if (!dev || !isLoopbackClientAddress(getClientAddress())) error(404);
	return {};
};
