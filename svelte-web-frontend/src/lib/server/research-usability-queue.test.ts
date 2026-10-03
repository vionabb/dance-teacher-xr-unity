import { expect, test } from 'vitest';
import {
	humanSimilarityKey,
	reviewDisplayIdentity,
	reviewIdentity,
	type ReviewIdentity,
	type ReviewTask
} from './research-video-manifest';
import { rankVideoReviewCandidates } from './research-usability-queue';

test('CHI25 source stems resolve study, person, dance, condition, and segment', () => {
	expect(
		reviewIdentity(
			'chi25_study1',
			'user5387____performance____userstudy1--pajama-party--skeleton____workflowid-102d5dd7-f1f4-447d-9c0c-6e10a8afc4c3____clip1'
		)
	).toMatchObject({
		paper: 'chi25',
		study: 'study1',
		userId: '5387',
		dance: 'pajama-party',
		condition: 'skeleton',
		segmentNumber: 1
	});
	expect(
		reviewIdentity(
			'chi25_study2',
			'user4701________userstudy2-pajamaparty-control____workflowid-0b78f385-a6be-41d7-8898-57f075f777ab____clip2'
		)
	).toMatchObject({
		paper: 'chi25',
		study: 'study2',
		userId: '4701',
		dance: 'pajama-party',
		condition: 'control',
		segmentNumber: 2
	});
	expect(reviewIdentity('chi_reference', 'chi-studyvideos/bartender')).toBeNull();
	expect(
		reviewDisplayIdentity(
			'chi25_study2',
			'useruseridmissing________userstudy2-madatdisney-emojiandsegmented____workflowid-568e88b5-0a90-4755-bef4-3132efd7ffa1____clip2'
		)
	).toMatchObject({
		userId: 'missing',
		dance: 'mad-at-disney',
		condition: 'emojiandsegmented',
		segmentNumber: 2
	});
});

test('human similarity keys require the same segment and condition', () => {
	const identity = {
		paper: 'chi25',
		study: 'study2',
		userId: '4701',
		dance: 'pajama-party',
		condition: 'control',
		segmentNumber: 2
	} as const;
	expect(humanSimilarityKey(identity)).toBe(
		['2', 'pajama-party', '4701', '2', 'control'].join('\0')
	);
	expect(humanSimilarityKey({ ...identity, study: 'study1', condition: 'sheetmotion' })).toBe(
		['1', 'pajama-party', '4701', '2', 'sheet'].join('\0')
	);
});

test('queue fills sparse cells before alternating suspected and comparison segments', () => {
	const make = (taskId: string, identity: ReviewIdentity) => ({
		task: { task_id: taskId } as ReviewTask,
		identity,
		humanRating: { human_rating: 4 } as never
	});
	const base = {
		paper: 'chi25',
		study: 'study2',
		userId: '42',
		dance: 'bartender',
		condition: 'segmented'
	} as const;
	const rated = { ...base, segmentNumber: 1 };
	const focus = make('video-usability-2', { ...base, userId: '43', segmentNumber: 2 });
	const comparison = make('video-usability-3', { ...base, userId: '44', segmentNumber: 3 });
	const covered = make('video-usability-1', { ...base, userId: '45', segmentNumber: 1 });
	const candidates = [comparison, covered, focus];
	expect(
		rankVideoReviewCandidates({ candidates, ratedIdentities: [rated], newRatingsCount: 0 }).map(
			(row) => row.task.task_id
		)
	).toEqual(['video-usability-2', 'video-usability-3', 'video-usability-1']);
	expect(
		rankVideoReviewCandidates({ candidates, ratedIdentities: [rated], newRatingsCount: 1 }).map(
			(row) => row.task.task_id
		)
	).toEqual(['video-usability-3', 'video-usability-2', 'video-usability-1']);
});
