import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export async function load({ params, parent })  {

    const parentData = await parent();
    const performanceId = params.performanceId;

    
    return {
        performanceId,
    }
}

export const prerender = false;
export const trailingSlash = 'always'; // include trailing slash so that relative links work