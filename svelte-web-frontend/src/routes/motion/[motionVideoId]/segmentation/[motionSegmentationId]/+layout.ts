import { error } from '@sveltejs/kit';

import TeachingAgent  from '$lib/ai/TeachingAgent/TeachingAgent';
import { get } from 'svelte/store';
import type { UserLearningModel } from '$lib/ai/backend/IDataBackend';

/** @type {import('./$types').PageLoad} */
export async function load({ params, parent })  {

    const { motionVideo, databackend, user } = await parent();

    if (!user) {
        throw error(401, 'Unauthorized');
    }

    const motionSegmentationId = parseInt(params.motionSegmentationId);
    const motionSegmentation = await databackend.getMotionVideoSegmentationById(motionSegmentationId);

    if (!motionSegmentation) {
        throw error(404, 'Dance Segmentation Not found');
    }

    const prevUserLearningModel: UserLearningModel | null = await databackend.getUserLearningModelBySegmentationId(motionSegmentation.id);

    let userLearningModel: UserLearningModel;
    if (!prevUserLearningModel) {
        // create a new user learning model if needed
        console.log("No previous user learning model found, creating a new one");
        const newModel = TeachingAgent.generateNewUserLearningModel(motionVideo, motionSegmentation);
        userLearningModel = await databackend.createUserLearningModel({ ...newModel, segmentation_id: motionSegmentation.id });
    } else {
        userLearningModel = prevUserLearningModel;
    }

    return {
        motionSegmentation,
        userLearningModel,
    }
}

export const prerender = false;
export const trailingSlash = 'always'; // include trailing slash so that relative links work