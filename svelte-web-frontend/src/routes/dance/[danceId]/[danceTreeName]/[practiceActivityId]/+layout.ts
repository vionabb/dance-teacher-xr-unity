import { error } from '@sveltejs/kit';

import { getDanceTreeFromDanceAndTreeName } from '$lib/data/dances-store.js';
import type { PracticePlan } from '$lib/model/PracticePlan';

/** @type {import('./$types').PageLoad} */
export async function load({ params, parent })  {

    
    const { initialPracticePlan } = await parent();

    const allActivities = initialPracticePlan.stages.flatMap((stage) => stage.activities)
    const matchingActivity = allActivities.find((x) => x.id === params.practiceActivityId)

    if (!matchingActivity) {
        error(404, 'Practice Activity Not found');
    }
    
    return {
        // dance: dance,
        // danceTree,
        // practicePlan,
        practiceActivity: matchingActivity,
        // preselectedNodeId: preselectedNodeId,
    }
}

export const prerender = false;
export const trailingSlash = 'always'; // include trailing slash so that relative links work