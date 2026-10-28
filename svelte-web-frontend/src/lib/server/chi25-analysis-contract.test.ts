import { describe, expect, it } from 'vitest';
import { getClipInfo, Study } from '$lib/ai/motionmetrics/PoseDataTestFile';
import {
	analysisHumanRating,
	analysisRatingKey,
	analysisRecordingIdentity
} from './chi25-analysis-contract.js';

describe('hosted CHI25 analysis identities', () => {
	it.each([
		[
			'chi25_study1',
			Study.Study1_BySegment,
			'user4324____initial____userstudy1--last-christmas--sheetmotion____workflowid-ec8fbc4c-bf9d-404d-a4ab-c626e23a4d2e____clip1'
		],
		[
			'chi25_study2',
			Study.Study2_BySegment,
			'user3209________userstudy2-bartender-segmented____workflowid-c096aef4-3cd9-415d-9ca1-f8709a7f770a____clip2'
		]
	] as const)('matches the existing local parser for %s', (study, local, stem) => {
		const hosted = analysisRecordingIdentity(study, stem)!;
		const prior = getClipInfo(`${stem}.pose2d.raw.csv`, local)!;
		expect([
			hosted.participantId,
			hosted.dance,
			hosted.condition,
			hosted.workflowId,
			hosted.clipNumber,
			hosted.phase
		]).toEqual([
			prior.userId,
			prior.danceName,
			prior.condition,
			prior.workflowId,
			prior.clipNumber,
			prior.study1phase ?? null
		]);
		expect(hosted.legacyId).not.toBe(hosted.id);
	});
	it('does not invent a participant for an unidentified recording', () => {
		expect(
			analysisRecordingIdentity(
				'chi25_study2',
				'useruseridmissing________userstudy2-bartender-control____workflowid-c096aef4-3cd9-415d-9ca1-f8709a7f770a____clip1'
			)
		).toBeNull();
	});
	it('preserves an out-of-scale whole rating but excludes it from segment review', () => {
		const row = {
			study: '2',
			dance: 'bartender',
			userId: '42',
			segmentId: 'whole',
			condition: 'control',
			humanRating: '6.2'
		};
		const imported = analysisHumanRating(row, 'a'.repeat(64), 3, 'b'.repeat(24));
		expect(imported.human_rating).toBe(6.2);
		expect(imported.original_row).toEqual(row);
		expect(imported.segment_eligible).toBe(false);
	});
	it('keeps conditions in the key and applies only the documented sheet alias', () => {
		expect(analysisRatingKey('chi25_study1', 'last-christmas', 42, 1, 'sheetmotion')).toBe(
			analysisRatingKey('chi25_study1', 'last-christmas', 42, 1, 'sheet')
		);
		expect(analysisRatingKey('chi25_study1', 'last-christmas', 42, 1, 'control')).not.toBe(
			analysisRatingKey('chi25_study1', 'last-christmas', 42, 1, 'sheet')
		);
	});
});
