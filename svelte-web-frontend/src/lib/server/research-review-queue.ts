import { readUsabilityData, researchDatabasePath } from './research-store';
import {
	humanSimilarityKey,
	legacyAnnotationDatabasePath,
	loadVideoReviewManifest,
	readLegacyTaskStatuses,
	reviewDisplayIdentity,
	reviewIdentity,
	reviewSourceKey,
	type ReviewIdentity
} from './research-video-manifest';
import { rankVideoReviewCandidates } from './research-usability-queue';

export async function loadResearchReviewQueue() {
	const [manifest, legacyPath, data] = await Promise.all([
		loadVideoReviewManifest(),
		Promise.resolve(legacyAnnotationDatabasePath()),
		readUsabilityData(researchDatabasePath())
	]);
	if (!manifest || !legacyPath)
		return {
			available: false as const,
			reason:
				'Set RESEARCH_VIDEO_MANIFEST_PATH and RESEARCH_LEGACY_ANNOTATIONS_SQLITE_PATH to enable the local rating queue.',
			data,
			candidates: []
		};
	const statuses = await readLegacyTaskStatuses(legacyPath, manifest.experimentId);
	const humanRatings = new Map(
		data.humanRatings
			.filter(
				(row) =>
					row.human_rating !== null &&
					[row.rating_1, row.rating_2, row.rating_3].some((value) => value !== null)
			)
			.map((row) => [
				[row.study, row.dance, row.user_id, row.segment_id, row.condition].join('\0'),
				row
			])
	);
	const ratedSources = new Map<string, ReviewIdentity>();
	for (const review of [...data.videoReviews, ...data.localRatings]) {
		const identity = reviewDisplayIdentity(review.source_corpus, review.source_stem);
		if (identity) ratedSources.set(reviewSourceKey(review), identity);
	}
	for (const task of manifest.tasks) {
		if (statuses.get(task.task_id) !== 'completed') continue;
		const identity = reviewDisplayIdentity(task.source_corpus, task.source_stem);
		if (identity) ratedSources.set(reviewSourceKey(task), identity);
	}
	const existingKeys = new Set(ratedSources.keys());
	const candidates = manifest.tasks.flatMap((task) => {
		if (
			statuses.get(task.task_id) === 'completed' ||
			statuses.get(task.task_id) === 'started' ||
			existingKeys.has(reviewSourceKey(task))
		)
			return [];
		const identity = reviewIdentity(task.source_corpus, task.source_stem);
		if (!identity) return [];
		const humanRating = humanRatings.get(humanSimilarityKey(identity));
		return humanRating ? [{ task, identity, humanRating }] : [];
	});
	return {
		available: true as const,
		manifest,
		data,
		candidates: rankVideoReviewCandidates({
			candidates,
			ratedIdentities: [...ratedSources.values()],
			newRatingsCount: data.localRatings.length
		})
	};
}
