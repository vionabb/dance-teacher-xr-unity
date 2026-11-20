import { error } from '@sveltejs/kit';
import { harnessScenarios, type HarnessScenarioId } from '$lib/server/ui-harness';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	if (!Object.hasOwn(harnessScenarios, params.scenario)) error(404);
	const scenario = harnessScenarios[params.scenario as HarnessScenarioId];
	return {
		scenarioId: params.scenario,
		view: scenario.view,
		route: scenario.route,
		nav: scenario.nav,
		fixture: structuredClone(scenario.data)
	};
};
