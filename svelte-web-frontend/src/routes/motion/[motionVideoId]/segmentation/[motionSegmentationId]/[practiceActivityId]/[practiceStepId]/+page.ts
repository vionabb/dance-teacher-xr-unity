import { error } from '@sveltejs/kit';

import type PracticeStep from '$lib/model/PracticeStep.js';

/** @type {import('./$types').PageLoad} */
export async function load({ params, parent })  {

    const { practiceActivity } = await parent();
    // let practiceActivity: PracticePlanActivity;

    const practiceStepIndex = practiceActivity.steps.findIndex((step: PracticeStep) => step.id === params.practiceStepId);
    const matchingPracticeStep: PracticeStep | undefined = practiceActivity.steps[practiceStepIndex];

    if (!matchingPracticeStep) {
        error(404, 'Practice Step Not found');
    }
    
    return {
        // dance: dance,
        // danceTree,
        // practicePlan,
        // practiceActivity: matchingActivity,
        practiceStep: matchingPracticeStep,
        practiceStepIndex: practiceStepIndex,
    }
}

export const trailingSlash = 'always'; // include trailing slash so that relative links work