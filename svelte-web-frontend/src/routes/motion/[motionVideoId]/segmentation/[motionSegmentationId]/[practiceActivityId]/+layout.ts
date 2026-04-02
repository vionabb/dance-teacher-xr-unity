import { error } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export async function load({ params, parent }) {
	const { userLearningModel } = await parent();

	console.log('Layout load: userLearningModel:', userLearningModel);
	const allActivities = userLearningModel.plan.stages.flatMap((stage) => stage.activities);
	const matchingActivity = allActivities.find((x) => x.id === params.practiceActivityId);

	if (!matchingActivity) {
		error(404, 'Practice Activity Not found');
	}

	return {
		practiceActivity: matchingActivity
	};
}

export const prerender = false;
export const trailingSlash = 'always'; // include trailing slash so that relative links work
