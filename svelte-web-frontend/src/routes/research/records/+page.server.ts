import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { isLoopbackClientAddress } from '$lib/server/client-address';
import { readResearchRecords, researchDatabasePath } from '$lib/server/research-store';
import { loadResearchReviewQueue } from '$lib/server/research-review-queue';
import {
	humanSimilarityKey,
	reviewDisplayIdentity,
	reviewIdentity
} from '$lib/server/research-video-manifest';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ getClientAddress, url }) => {
	if (!dev || !isLoopbackClientAddress(getClientAddress())) error(404);
	const [records, queue] = await Promise.all([
		readResearchRecords(researchDatabasePath()),
		loadResearchReviewQueue()
	]);
	const humanByKey = new Map(
		queue.data.humanRatings.map((rating) => [
			[rating.study, rating.dance, rating.user_id, rating.segment_id, rating.condition].join('\0'),
			rating
		])
	);
	const videoReviews = [
		...queue.data.videoReviews.map((review) => ({
			key: `frozen:${review.release_id}:${review.segment_id}`,
			identity: reviewDisplayIdentity(review.source_corpus, review.source_stem),
			exactIdentity: reviewIdentity(review.source_corpus, review.source_stem),
			sourceStem: review.source_stem,
			sourceCorpus: review.source_corpus,
			rating: review.effective_rating,
			originalRating: review.video_usability_rating,
			override: review.video_usability_rating_override,
			source: review.release_id,
			taskId: review.task_id,
			annotator: review.annotator,
			revisionId: review.revision_id,
			videoSha256: review.source_video_sha256
		})),
		...queue.data.localRatings.map((review) => ({
			key: `local:${review.revision_id}`,
			identity: reviewDisplayIdentity(review.source_corpus, review.source_stem),
			exactIdentity: reviewIdentity(review.source_corpus, review.source_stem),
			sourceStem: review.source_stem,
			sourceCorpus: review.source_corpus,
			rating: review.rating,
			originalRating: review.rating,
			override: null,
			source: 'local research DB',
			taskId: review.task_id,
			annotator: review.annotator,
			revisionId: review.revision_id,
			videoSha256: review.source_video_sha256
		}))
	].map((review) => ({
		...review,
		humanRating: review.exactIdentity
			? (humanByKey.get(humanSimilarityKey(review.exactIdentity)) ?? null)
			: null
	}));
	const compare = (a: (typeof videoReviews)[number], b: (typeof videoReviews)[number]) =>
		[
			a.identity?.study ?? '',
			a.identity?.dance ?? '',
			a.identity?.condition ?? '',
			a.identity?.userId ?? '',
			String(a.identity?.segmentNumber ?? 0)
		]
			.join('\0')
			.localeCompare(
				[
					b.identity?.study ?? '',
					b.identity?.dance ?? '',
					b.identity?.condition ?? '',
					b.identity?.userId ?? '',
					String(b.identity?.segmentNumber ?? 0)
				].join('\0')
			);
	return {
		...records,
		recorded: url.searchParams.get('recorded') === '1',
		backupWarning: url.searchParams.get('backup_warning') === '1',
		participantVideoReviews: videoReviews
			.filter((review) => review.sourceCorpus.startsWith('chi25_study'))
			.sort(compare),
		referenceVideoReviews: videoReviews
			.filter((review) => review.sourceCorpus === 'chi_reference')
			.sort(compare),
		queue: {
			available: queue.available,
			reason: 'reason' in queue ? queue.reason : null,
			remaining: queue.candidates.length,
			hasNext: queue.candidates.length > 0
		}
	};
};
