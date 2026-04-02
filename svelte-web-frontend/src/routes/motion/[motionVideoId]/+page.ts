import { error, redirect } from '@sveltejs/kit';

/** @type {import('./$types').PageLoad} */
export async function load({ parent, params, url }) {
	const parentData = await parent();
	const motionVideoId = parseInt(params.motionVideoId);
	const segmentations = await parentData.databackend.getMotionVideoSegmentations(motionVideoId);

	if (!Array.isArray(segmentations)) {
		throw new Error('Failed to load segmentations');
	}

	if (segmentations.length === 0) {
		throw error(404, 'No segmentations found for this motion video');
	}

	// Sort by created_at descending (newest first)
	segmentations.sort((a, b) => {
		const a_date = new Date(a.created_at);
		const b_date = new Date(b.created_at);
		return b_date.getTime() - a_date.getTime();
	});

	// Redirect to the newest segmentation
	const newestSegmentationId = segmentations[0].id;
	const curPath = url.pathname;
	const newPath = curPath.replace(/\/$/, '') + `/segmentation/${newestSegmentationId}/`;
	console.log(`Redirecting to newest segmentation, path: "${newPath}"`);
	throw redirect(302, newPath);
}
