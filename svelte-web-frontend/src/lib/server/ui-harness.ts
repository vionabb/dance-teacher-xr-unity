/**
 * Fixture data for the dev-only UI screenshot harness (`/dev/ui-harness`).
 *
 * Each scenario renders a real page component with fixture data so that
 * `scripts/ui-screenshots/capture.mjs` can screenshot it without Supabase or a
 * sign-in. Media paths point into the git-ignored `local-data/` cache, which may
 * hold real access-controlled study media: screenshots that show it may be sent
 * to Viona in the project thread, but neither the media nor the screenshots may
 * ever be committed. When a file is missing, the media route serves a synthetic
 * test video instead.
 *
 * Fixture moves are labelled as fixtures; they are not research annotations.
 */
import { REFERENCE_VIDEO_TIMING, type KeyMove } from '$lib/research/key-moves';

const PAJAMA_VIDEO = '97c46213ae243c6f1045c82a';
const PAJAMA_SHA = '37f92d56e8e6b1c92025a039106ea35e100eb54043927c0d40232805e28a8ed0';
export const harnessMedia = (objectPath: string) =>
	`/dev/ui-harness/media/research-chi25/${objectPath}`;

const pajamaClips = [0, 2.682, 5.364, 8.046, 10.728, 13.41].map((startSeconds, index) => ({
	clipNumber: index + 1,
	startSeconds
}));
const fixtureMove = (
	n: number,
	trackId: string,
	startFrame: number,
	endFrame: number,
	described = true
): KeyMove => ({
	id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
	trackId,
	startFrame,
	endFrame,
	name: described ? `Fixture move ${n}` : '',
	description: described
		? 'Harness fixture text, not a research annotation. A description in the annotator’s own words goes here and can run to a few sentences.'
		: '',
	viewMirrored: false
});

function keyMoveEditor(withMoves: boolean) {
	const timing = REFERENCE_VIDEO_TIMING[PAJAMA_SHA];
	return {
		dance: 'pajama-party',
		label: 'Pajama Party',
		videoUrl: harnessMedia(`materials/shared/${PAJAMA_VIDEO}/video.mp4`),
		videoLabel: 'pajamaparty-tutorial.mp4',
		videoMaterialId: PAJAMA_VIDEO,
		fps: timing.fps,
		frameCount: timing.frameCount,
		clips: pajamaClips,
		canEdit: true,
		revision: withMoves
			? {
					id: 41,
					createdAt: '2026-11-20T14:30:00Z',
					tracks: [
						{ id: 'moves', label: 'Key moves' },
						{ id: 'arms', label: 'Arms' }
					],
					moves: [
						fixtureMove(1, 'moves', 12, 70),
						fixtureMove(2, 'moves', 95, 150),
						fixtureMove(3, 'moves', 180, 255),
						fixtureMove(4, 'arms', 60, 110),
						fixtureMove(5, 'moves', 300, 340, false)
					]
				}
			: null,
		defaultTracks: [{ id: 'moves', label: 'Key moves' }]
	};
}

// ---- Fixtures for the other research tools. Identities are made up ("user90xx"); ----
// ---- only the media the runner serves may be real study media.                ----
const DANCES = ['bartender', 'last-christmas', 'mad-at-disney', 'pajama-party'] as const;
const CONDITIONS = ['control', 'skeleton', 'sheetmotion'] as const;
/** Small deterministic generator so fixtures look varied but never change. */
function seeded(seed: number) {
	return () => {
		seed = (seed * 1103515245 + 12345) % 2 ** 31;
		return seed / 2 ** 31;
	};
}
export const HARNESS_PARTICIPANT_MEDIA = '3db6b63d08e0acb08dfed42e';
const fixtureStem = (user: number, dance: string, condition: string, clip: number) =>
	`user${user}____performance____userstudy1--${dance}--${condition}____workflowid-fixture____clip${clip}`;

function discrepancyTasks() {
	const random = seeded(11);
	return Array.from({ length: 14 }, (_, i) => {
		const dance = DANCES[i % DANCES.length];
		const ratings = [1, 2, 3].map(() => 1 + Math.floor(random() * 3));
		return {
			performanceId: `fixture-${dance}-${i}`,
			segmentId: `fixture-segment-${i}`,
			participantLabel: `P${9001 + i}`,
			study: i % 3 ? 'study1' : 'study2',
			dance,
			condition: CONDITIONS[i % CONDITIONS.length],
			phase: null,
			clipNumber: 1 + (i % 5),
			referenceAvailable: i !== 9,
			human: {
				human_rating: Number(
					(1 + ((ratings.reduce((a, b) => a + b, 0) / 3 - 1) / 2) * 4).toFixed(2)
				),
				rating_1: ratings[0],
				rating_2: ratings[1],
				rating_3: ratings[2]
			},
			observations: i % 4 === 0 ? [{ id: `fixture-observation-${i}` }] : []
		};
	});
}

function studyRecordings() {
	return {
		studies: ['chi25_study1', 'chi25_study2'],
		study: 'chi25_study1',
		page: 1,
		pages: 3,
		media: Array.from({ length: 8 }, (_, i) => ({
			id: i === 0 ? HARNESS_PARTICIPANT_MEDIA : `f${String(i).padStart(23, '0')}`,
			study: 'chi25_study1',
			source_stem: fixtureStem(9001 + Math.floor(i / 4), DANCES[1], CONDITIONS[0], (i % 4) + 1),
			video_bytes: 4_000_000,
			pose_bytes: 300_000
		}))
	};
}

function researchMaterials() {
	const reference = [
		['478a912dd8bcea0a12fb6cbf', 'bartender.mp4', 2774964],
		['0907884e802f43cf2623d085', 'last-christmas-tutorial.mp4', 2300134],
		['93daeade59bf35564532c6db', 'mad-at-disney-tutorial.mp4', 2766102],
		['97c46213ae243c6f1045c82a', 'pajamaparty-tutorial.mp4', 2092730]
	] as const;
	return {
		studies: ['chi25_study1', 'chi25_study2'],
		materials: [
			...reference.map(([id, label, bytes]) => ({
				id,
				scope: 'shared',
				kind: 'reference_video',
				label,
				bytes,
				source_description: null
			})),
			...[1, 2].map((n) => ({
				id: `fixture-ratings-${n}`,
				scope: `chi25_study${n}`,
				kind: 'human_ratings',
				label: `Study ${n} human ratings (fixture)`,
				bytes: 70_000,
				source_description: null
			})),
			...DANCES.map((dance) => ({
				id: `fixture-reviewed-${dance}`,
				scope: 'shared',
				kind: 'reviewed_pose',
				label: `chi-studyvideos/${dance} · reviewed pose`,
				bytes: 300_000,
				source_description: null
			})),
			...Array.from({ length: 6 }, (_, i) => ({
				id: `fixture-reviewed-${i}`,
				scope: i < 3 ? 'chi25_study1' : 'chi25_study2',
				kind: 'reviewed_pose',
				label: `${fixtureStem(9001 + i, DANCES[i % 4], CONDITIONS[i % 3], 1 + i)} · reviewed pose`,
				bytes: 280_000,
				source_description: null
			}))
		]
	};
}

function sourceRecords() {
	const random = seeded(5);
	const reviews = Array.from({ length: 8 }, (_, i) => {
		const identity = {
			paper: 'CHI25',
			study: 'Study 1',
			userId: String(9001 + i),
			dance: DANCES[i % 4],
			condition: CONDITIONS[i % 3],
			segmentNumber: 1 + (i % 4)
		};
		return {
			key: `fixture:${i}`,
			identity,
			sourceStem: fixtureStem(9001 + i, identity.dance, identity.condition, identity.segmentNumber),
			rating: ['perfect', 'correctable', 'marginal', 'unusable'][i % 4],
			originalRating: ['perfect', 'correctable', 'marginal', 'unusable'][i % 4],
			override: i === 5 ? 'unusable' : null,
			source: 'fixture-release',
			taskId: `fixture-task-${i}`,
			annotator: 'fixture',
			revisionId: `fixture-revision-${i}`,
			videoSha256: 'f'.repeat(64),
			humanRating: { human_rating: Number((1 + random() * 4).toFixed(2)) }
		};
	});
	return {
		sources: [
			{ kind: 'manual_review', source_version: 'fixture-release', source_sha256: 'a'.repeat(64) },
			{ kind: 'human_ratings', source_version: 'fixture-ratings', source_sha256: 'b'.repeat(64) }
		],
		humanRatings: reviews.map((review) => ({
			study: 'study1',
			dance: review.identity.dance,
			user_id: review.identity.userId,
			segment_id: review.identity.segmentNumber,
			condition: review.identity.condition,
			human_rating: review.humanRating.human_rating,
			rating_1: 2,
			rating_2: 3,
			rating_3: 2,
			human_rating_percentile: Math.round(random() * 100)
		})),
		recorded: false,
		backupWarning: false,
		participantVideoReviews: reviews,
		referenceVideoReviews: [],
		queue: { available: true, reason: null, remaining: 42, hasNext: true }
	};
}

export const harnessScenarios = {
	'key-moves-index': {
		title: 'Reference key moves: dance list',
		view: 'key-moves-index',
		route: '/research/key-moves',
		nav: 'hosted',
		data: {
			dances: [
				['bartender', 'Bartender', 'bartender.mp4', 5, 0, 0],
				['last-christmas', 'Last Christmas', 'last-christmas-tutorial.mp4', 4, 6, 6],
				['mad-at-disney', 'Mad at Disney', 'mad-at-disney-tutorial.mp4', 5, 3, 1],
				['pajama-party', 'Pajama Party', 'pajamaparty-tutorial.mp4', 6, 0, 0]
			].map(([dance, label, videoLabel, clipCount, moveCount, describedCount]) => ({
				dance,
				label,
				videoLabel,
				clipCount,
				timingKnown: true,
				moveCount,
				describedCount,
				updatedAt: null
			}))
		}
	},
	'key-moves-empty': {
		title: 'Reference key moves: empty editor',
		view: 'key-moves-dance',
		route: '/research/key-moves/pajama-party',
		nav: 'hosted',
		data: keyMoveEditor(false)
	},
	'key-moves-marked': {
		title: 'Reference key moves: editor with fixture moves',
		view: 'key-moves-dance',
		route: '/research/key-moves/pajama-party',
		nav: 'hosted',
		data: keyMoveEditor(true)
	},
	'research-home': {
		title: 'Performance analysis: dance and participant browser',
		view: 'research-home',
		route: '/research',
		nav: 'hosted',
		// The page fetches its catalog; scenarios.mjs mocks that request.
		data: {}
	},
	discrepancy: {
		title: 'Human–metric discrepancy review',
		view: 'discrepancy',
		route: '/research/discrepancy',
		nav: 'hosted',
		data: { tasks: discrepancyTasks(), researchBackend: 'local' }
	},
	'studies-list': {
		title: 'Research recordings list',
		view: 'studies-list',
		route: '/research/studies',
		nav: 'hosted',
		data: studyRecordings()
	},
	'study-recording': {
		title: 'Research recording with raw pose overlay',
		view: 'study-recording',
		route: '/research/studies/x',
		nav: 'hosted',
		data: {
			media: {
				id: HARNESS_PARTICIPANT_MEDIA,
				study: 'chi25_study1',
				source_stem: fixtureStem(9001, DANCES[1], CONDITIONS[0], 1)
			}
		}
	},
	materials: {
		title: 'Research materials',
		view: 'materials',
		route: '/research/materials',
		nav: 'hosted',
		data: researchMaterials()
	},
	'source-records': {
		title: 'Local source records',
		view: 'source-records',
		route: '/research/records',
		nav: 'local',
		data: sourceRecords()
	}
} as const;
export type HarnessScenarioId = keyof typeof harnessScenarios;
