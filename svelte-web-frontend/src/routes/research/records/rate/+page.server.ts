import { dev } from '$app/environment';
import { error, redirect } from '@sveltejs/kit';
import { isLoopbackClientAddress } from '$lib/server/client-address';
import { loadResearchReviewQueue } from '$lib/server/research-review-queue';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ getClientAddress, url }) => {
	if (!dev || !isLoopbackClientAddress(getClientAddress())) error(404);
	const queue = await loadResearchReviewQueue();
	if (queue.available && queue.candidates[0]) {
		const suffix = url.searchParams.get('recorded') === '1' ? '?recorded=1' : '';
		redirect(302, `/research/records/rate/${queue.candidates[0].task.task_id}${suffix}`);
	}
	return {
		reason: queue.available
			? 'Every matching CHI25 human-rated segment already has a usability rating.'
			: queue.reason
	};
};
