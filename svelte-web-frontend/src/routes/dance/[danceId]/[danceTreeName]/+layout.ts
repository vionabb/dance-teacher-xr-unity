import { error } from '@sveltejs/kit';

import { getDanceTreeFromDanceAndTreeName, type DanceTree } from '$lib/data/dances-store.js';
import TeachingAgent  from '$lib/ai/TeachingAgent/TeachingAgent.js';
import { get } from 'svelte/store';

/** @type {import('./$types').PageLoad} */
export async function load({ params, parent })  {

    const { dance } = await parent();
    const danceTreeName: string = params.danceTreeName;
    const danceTree = getDanceTreeFromDanceAndTreeName(dance, danceTreeName);
    
    if (!danceTree) {
        error(404, 'Dance Segmentation Not found');
    }

    let initialPracticePlan = get(new TeachingAgent(danceTree, dance).practicePlan);
    

    // if (!danceTree) {
        // throw  error(404, 'Dance Tree Not found');   
    // }

    // const preselectedNodeId = url.searchParams.get('preselectedNodeId');

    return {
        dance: dance,
        danceTree,
        initialPracticePlan,
        // preselectedNodeId: preselectedNodeId,
    }
}

export const prerender = false;
export const trailingSlash = 'always'; // include trailing slash so that relative links work