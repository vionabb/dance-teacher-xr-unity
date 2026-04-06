import TeachingAgent from '$lib/ai/TeachingAgent/TeachingAgent.js';
import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export async function load({ params, parent, url }) {
	const parentData = await parent();
	const performanceId = params.performanceId;

	const performanceAttempt = await parentData.databackend.getUserPerformanceAttemptById(
		parseInt(performanceId)
	);
	if (!performanceAttempt) {
		throw error(404, 'Performance attempt not found');
	}

	let performanceVideoUrl = null;
	if (performanceAttempt.video_recording_storagepath) {
		performanceVideoUrl = await parentData.databackend.getUserPerformanceVideoUrl(
			performanceAttempt.video_recording_storagepath
		);
	}

	const teachingAgent = new TeachingAgent({
		motionVideo: parentData.motionVideo,
		motionSegmentation: parentData.motionSegmentation,
		userLearningModel: parentData.userLearningModel,
		dataBackend: parentData.databackend
	});

	const action = await teachingAgent.decidePostPracticeAttemptAction({
		motionVideo: parentData.motionVideo,
		motionSegmentation: parentData.motionSegmentation,
		userLearningModel: parentData.userLearningModel,
		practiceActivity: parentData.practiceActivity,
		practiceStep: parentData.practiceStep,
		performanceAttempt: performanceAttempt,
		requestingURL: url
	});

	return {
		performanceAttempt,
		performanceVideoUrl,
		action
	};
}

export const prerender = false;
export const trailingSlash = 'always'; // include trailing slash so that relative links work
