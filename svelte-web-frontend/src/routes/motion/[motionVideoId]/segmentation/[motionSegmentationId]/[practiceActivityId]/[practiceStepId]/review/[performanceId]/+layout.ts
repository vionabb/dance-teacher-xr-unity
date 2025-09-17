import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export async function load({ params, parent })  {

    const parentData = await parent();
    const performanceId = params.performanceId;

    const performanceAttempt = await parentData.databackend.getUserPerformanceAttemptById(parseInt(performanceId));
    if (!performanceAttempt) {
        throw error(404, 'Performance attempt not found');
    }

    let performanceVideoUrl = null;
    if (performanceAttempt.video_recording_storagepath) {
        performanceVideoUrl = await parentData.databackend.getUserPerformanceVideoUrl(performanceAttempt.video_recording_storagepath)
    }
    
    return {
        performanceAttempt,
        performanceVideoUrl
    }
}

export const prerender = false;
export const trailingSlash = 'always'; // include trailing slash so that relative links work