import { createHash } from 'node:crypto';
import { reviewCell, type ReviewIdentity, type ReviewTask } from './research-video-manifest';
import type { HumanRatingRecord } from './research-store';

export type EligibleVideoReview = {
	task: ReviewTask;
	identity: ReviewIdentity;
	humanRating: HumanRatingRecord;
	cellRatingCount: number;
	participantRatingCount: number;
	isHypothesisSegment: boolean;
	selectionReason: string;
};

const hypothesisSegments = new Set([
	'bartender\0' + 2,
	'last-christmas\0' + 3,
	'mad-at-disney\0' + 1,
	'pajama-party\0' + 4
]);

function participantKey(identity: ReviewIdentity): string {
	return `${identity.study}\0${identity.userId}`;
}

function tieBreak(task: ReviewTask): string {
	return createHash('sha256').update(`research-usability-queue-v1\0${task.task_id}`).digest('hex');
}

/** Balanced coverage first; alternate hypothesis and comparison segments within a coverage tier. */
export function rankVideoReviewCandidates(input: {
	candidates: Array<{ task: ReviewTask; identity: ReviewIdentity; humanRating: HumanRatingRecord }>;
	ratedIdentities: ReviewIdentity[];
	newRatingsCount: number;
}): EligibleVideoReview[] {
	const cellCounts = new Map<string, number>();
	const participantCounts = new Map<string, number>();
	for (const identity of input.ratedIdentities) {
		const cell = reviewCell(identity);
		const person = participantKey(identity);
		cellCounts.set(cell, (cellCounts.get(cell) ?? 0) + 1);
		participantCounts.set(person, (participantCounts.get(person) ?? 0) + 1);
	}
	const preferHypothesis = input.newRatingsCount % 2 === 0;
	return input.candidates
		.map(({ task, identity, humanRating }) => {
			const cellRatingCount = cellCounts.get(reviewCell(identity)) ?? 0;
			const participantRatingCount = participantCounts.get(participantKey(identity)) ?? 0;
			const isHypothesisSegment = hypothesisSegments.has(
				`${identity.dance}\0${identity.segmentNumber}`
			);
			const coverage =
				cellRatingCount === 0
					? 'fills a study × dance × segment × condition cell with no usability rating'
					: `adds an independent rating to a cell with ${cellRatingCount} existing ${cellRatingCount === 1 ? 'rating' : 'ratings'}`;
			return {
				task,
				identity,
				humanRating,
				cellRatingCount,
				participantRatingCount,
				isHypothesisSegment,
				selectionReason: `${coverage}; ${isHypothesisSegment ? 'replicates a suspected tracking-problem segment' : 'samples a comparison segment'}; exact CHI25 human similarity rating exists`
			};
		})
		.sort(
			(a, b) =>
				a.cellRatingCount - b.cellRatingCount ||
				a.participantRatingCount - b.participantRatingCount ||
				Number(b.isHypothesisSegment === preferHypothesis) -
					Number(a.isHypothesisSegment === preferHypothesis) ||
				tieBreak(a.task).localeCompare(tieBreak(b.task))
		);
}
