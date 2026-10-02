import { dev } from '$app/environment';
import { error, fail, redirect } from '@sveltejs/kit';
import { isDevLocalRequestAllowed, isLoopbackClientAddress } from '$lib/server/client-address';
import { loadResearchReviewQueue } from '$lib/server/research-review-queue';
import {
	recordVideoUsabilityRating,
	researchDatabasePath,
	VIDEO_USABILITY_RATINGS,
	type VideoUsabilityRating
} from '$lib/server/research-store';
import { sha256File, validatedReviewArtifact } from '$lib/server/research-video-manifest';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ getClientAddress, params, url }) => {
	if (!dev || !isLoopbackClientAddress(getClientAddress())) error(404);
	const queue = await loadResearchReviewQueue();
	if (!queue.available) error(503, queue.reason);
	const candidate = queue.candidates.find((item) => item.task.task_id === params.taskId);
	if (!candidate) error(404, 'This task is not an eligible unrated CHI25 segment.');
	return {
		taskId: candidate.task.task_id,
		identity: candidate.identity,
		remaining: queue.candidates.length,
		fps: candidate.task.fps,
		width: candidate.task.source_dimensions.width,
		height: candidate.task.source_dimensions.height,
		annotator: process.env.RESEARCH_ANNOTATOR?.trim() ?? '',
		recorded: url.searchParams.get('recorded') === '1'
	};
};

export const actions: Actions = {
	default: async ({ request, getClientAddress, params }) => {
		if (!isDevLocalRequestAllowed(request, getClientAddress(), dev)) error(404);
		const annotator = process.env.RESEARCH_ANNOTATOR?.trim();
		if (!annotator) return fail(503, { message: 'Set RESEARCH_ANNOTATOR before saving reviews.' });
		const form = await request.formData();
		const rating = String(form.get('rating') ?? '') as VideoUsabilityRating;
		const note = String(form.get('note') ?? '').trim();
		if (!VIDEO_USABILITY_RATINGS.includes(rating) || note.length > 2000)
			return fail(400, {
				message: 'Choose one of the four usability ratings; notes must be under 2,000 characters.'
			});
		const queue = await loadResearchReviewQueue();
		if (!queue.available) return fail(503, { message: queue.reason });
		const candidate = queue.candidates.find((item) => item.task.task_id === params.taskId);
		if (!candidate)
			return fail(409, {
				message: 'This segment has already been rated or no longer matches the human-rating source.'
			});
		const { task, identity } = candidate;
		const [video, landmarks] = await Promise.all([
			validatedReviewArtifact(queue.manifest, task, 'video'),
			validatedReviewArtifact(queue.manifest, task, 'landmarks')
		]);
		const [actualVideoHash, actualLandmarksHash] = await Promise.all([
			sha256File(video.file),
			sha256File(landmarks.file)
		]);
		if (actualVideoHash !== video.sha256 || actualLandmarksHash !== landmarks.sha256)
			return fail(409, { message: 'Source media changed since the review manifest was frozen.' });
		try {
			const receipt = await recordVideoUsabilityRating(researchDatabasePath(), {
				manifestSha256: queue.manifest.sha256,
				taskId: task.task_id,
				sourceCorpus: task.source_corpus,
				sourceStem: task.source_stem,
				sourceFrameStart: task.source_frame_start,
				sourceFrameEndExclusive: task.source_frame_end_exclusive,
				sourceVideoSha256: video.sha256,
				landmarksSha256: landmarks.sha256,
				study: identity.study === 'study1' ? '1' : '2',
				dance: identity.dance,
				userId: identity.userId,
				segmentNumber: identity.segmentNumber,
				condition: identity.condition,
				annotator,
				rating,
				note
			});
			if (receipt.backupError) redirect(303, '/research/records?recorded=1&backup_warning=1');
		} catch (saveError) {
			if (
				saveError instanceof Error &&
				/already has a usability rating|No exact CHI25/.test(saveError.message)
			)
				return fail(409, { message: saveError.message });
			throw saveError;
		}
		redirect(303, '/research/records/rate?recorded=1');
	}
};
