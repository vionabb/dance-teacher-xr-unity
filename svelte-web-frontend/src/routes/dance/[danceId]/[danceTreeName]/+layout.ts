import { error } from '@sveltejs/kit';

import { getDanceTreeFromDanceAndTreeName, type DanceTree } from '$lib/data/dances-store';
import TeachingAgent  from '$lib/ai/TeachingAgent/TeachingAgent';
import { get } from 'svelte/store';

/** @type {import('./$types').PageLoad} */
export async function load({ params, parent })  {

    const { dance, databackend } = await parent();
    const danceTreeName: string = params.danceTreeName;
    const danceTree = getDanceTreeFromDanceAndTreeName(dance, danceTreeName);
    
    if (!danceTree) {
        error(404, 'Dance Segmentation Not found');
    }

    const initialPracticePlan = get(new TeachingAgent(danceTree, dance, databackend).practicePlan);

    return {
        dance: dance,
        danceTree,
        initialPracticePlan,
        // preselectedNodeId: preselectedNodeId,
    }
}

export const prerender = false;
export const trailingSlash = 'always'; // include trailing slash so that relative links work