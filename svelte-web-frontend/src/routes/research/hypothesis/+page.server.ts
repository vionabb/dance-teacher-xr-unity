import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { isLoopbackClientAddress } from '$lib/server/client-address';
import { hypotheses } from '$lib/server/research-hypotheses';
import { readHypothesisState, researchDatabasePath } from '$lib/server/research-store';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ getClientAddress }) => {
	if (!dev || !isLoopbackClientAddress(getClientAddress())) error(404);
	const listed = [];
	for (const item of hypotheses) {
		const state = await readHypothesisState(researchDatabasePath(), item.slug);
		listed.push({
			slug: item.slug,
			title: item.title,
			question: item.question,
			status: state.events.filter((event) => event.kind === 'status').at(-1)?.value ?? 'candidate',
			findings: state.events.filter((event) => event.kind === 'finding').length
		});
	}
	return {
		hypotheses: listed
	};
};
