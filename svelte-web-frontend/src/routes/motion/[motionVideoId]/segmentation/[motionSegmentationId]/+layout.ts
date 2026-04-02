import { error } from '@sveltejs/kit';

import TeachingAgent from '$lib/ai/TeachingAgent/TeachingAgent';
import { get } from 'svelte/store';
import type { UserLearningModel } from '$lib/ai/backend/IDataBackend';

/** @type {import('./$types').PageLoad} */
export async function load({ params, parent }) {
	const { motionVideo, databackend, user } = await parent();

	if (!user) {
		throw error(401, 'Unauthorized');
	}

	const motionSegmentationId = parseInt(params.motionSegmentationId);
	const motionSegmentation = await databackend.getMotionVideoSegmentationById(motionSegmentationId);

	if (!motionSegmentation) {
		throw error(404, 'Dance Segmentation Not found');
	}

	const prevUserLearningModel: UserLearningModel | null =
		await databackend.getUserLearningModelBySegmentationId(motionSegmentation.id);

	let userLearningModel: UserLearningModel;
	if (!prevUserLearningModel) {
		// create a new user learning model if needed
		console.log('No previous user learning model found, creating a new one');
		const newModel = TeachingAgent.generateNewUserLearningModel(motionVideo, motionSegmentation);
		try {
			userLearningModel = await databackend.createUserLearningModel({
				...newModel,
				segmentation_id: motionSegmentation.id
			});
		} catch (e) {
			console.error('Error creating new user learning model:', e);
			throw error(500, 'Failed to create user learning model');
		}
	} else {
		userLearningModel = prevUserLearningModel;
	}

	return {
		motionSegmentation,
		userLearningModel
	};
}

export const prerender = false;
export const trailingSlash = 'always'; // include trailing slash so that relative links work
