import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export async function load({ params, parent })  {

    const parentData = await parent();

    const motionVideoId: number = parseInt(params.motionVideoId);
    const motionVideo = await parentData.databackend.getMotionVideoById(motionVideoId);

   if (!motionVideo) {
       error(404, 'Motion Video Not found');
   }

   return {
       motionVideo,
       // danceTree: danceTree,
       // preselectedNodeId: preselectedNodeId,
   }
}

export const prerender = false;
export const trailingSlash = 'always'; // include trailing slash so that relative links work