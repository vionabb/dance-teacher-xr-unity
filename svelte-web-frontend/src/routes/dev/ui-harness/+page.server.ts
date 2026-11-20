import { harnessScenarios } from '$lib/server/ui-harness';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => ({
	scenarios: Object.entries(harnessScenarios).map(([id, scenario]) => ({
		id,
		title: scenario.title
	}))
});
