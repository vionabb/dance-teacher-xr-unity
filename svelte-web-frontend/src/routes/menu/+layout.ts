import type { MotionVideo } from '$lib/ai/backend/IDataBackend';
import type { LayoutLoad } from './$types';

export const load: LayoutLoad = async ({ parent }) => {
	const { databackend } = await parent();

	const motionVideos: MotionVideo[] = await databackend.getMotionVideos();

	if (!motionVideos) {
		throw new Error('Failed to load motion videos');
	}

	return { motionVideos };
};
