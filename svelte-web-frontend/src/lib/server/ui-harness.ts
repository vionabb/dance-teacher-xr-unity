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

export const harnessScenarios = {
	'key-moves-index': {
		title: 'Reference key moves: dance list',
		view: 'key-moves-index',
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
		data: keyMoveEditor(false)
	},
	'key-moves-marked': {
		title: 'Reference key moves: editor with fixture moves',
		view: 'key-moves-dance',
		data: keyMoveEditor(true)
	}
} as const;
export type HarnessScenarioId = keyof typeof harnessScenarios;
