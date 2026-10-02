import { describe, expect, it } from 'vitest';
import { PoseLandmarkKeysUpperSnakeCase } from '$lib/webcam/mediapipe-utils';
import type { EvaluationTrackHistory } from './MotionMetric';
import Viona2DPoseEvaluationMetric from './Viona2DPoseEvaluationMetric';
import { compareVionaFrame } from './viona2d-inspector';
import type { Pose2DPixelLandmarks } from '$lib/webcam/mediapipe-utils';

function pose(offset = 0): Pose2DPixelLandmarks {
	return PoseLandmarkKeysUpperSnakeCase.map((_, index) => ({
		x: offset + index * 60,
		y: index * 35 + (index % 3) * 10,
		dist_from_camera: 0,
		visibility: 1
	}));
}

describe('Viona2D inspector', () => {
	it('matches the production metric for valid pose frames', () => {
		const reference = pose();
		const participant = pose(12);
		for (let index = 0; index < participant.length; index++) {
			participant[index] = {
				...participant[index],
				x: participant[index].x + index * 0.17,
				y: participant[index].y + index * index * 0.173
			};
		}
		participant[15] = { ...participant[15], x: participant[15].x + 38, y: participant[15].y - 21 };
		const inspector = compareVionaFrame(reference, participant);
		const history: EvaluationTrackHistory = {
			videoFrameTimesInSecs: [],
			actualTimesInMs: [],
			ref3DFrameHistory: [],
			ref2DFrameHistory: [],
			user3DFrameHistory: [],
			user2DFrameHistory: []
		};
		const production = new Viona2DPoseEvaluationMetric().computeMetric(
			history,
			[],
			0,
			0,
			participant,
			[],
			reference,
			[]
		);
		expect(inspector.overallDissimilarity).toBeCloseTo(production.overallDissimilarity);
		for (const [index, vector] of inspector.vectors.entries()) {
			expect(vector.dissimilarity).toBeCloseTo(
				production.vectorByVectorScores[index].dissimilarity
			);
			expect(vector.angleError).toBeCloseTo(production.vectorByVectorScores[index].angle);
			expect(vector.lengthError).toBeCloseTo(production.vectorByVectorScores[index].magnitude);
			expect(vector.angleWeight).toBeCloseTo(production.vectorByVectorScores[index].pAngle);
		}
	});

	it('keeps the raw-length gate thresholds and extrapolation unclamped', () => {
		for (const [length, expected] of [
			[25, -0.5],
			[50, 0],
			[100, 1],
			[125, 1.5]
		]) {
			const reference = pose();
			const participant = pose();
			reference[12] = { ...reference[12], x: reference[11].x + length, y: reference[11].y };
			participant[12] = {
				...participant[12],
				x: participant[11].x + length,
				y: participant[11].y
			};
			const vector = compareVionaFrame(reference, participant).vectors[0];
			expect(vector.referenceGate).toBeCloseTo(expected);
			expect(vector.participantGate).toBeCloseTo(expected);
			expect(vector.angleWeight).toBeCloseTo(expected);
			expect(vector.extrapolated).toBe(length === 25 || length === 125);
		}
	});

	it('keeps raw projected gates while body scale equalizes adjusted lengths', () => {
		const reference = pose();
		const participant = pose();
		// Pair 4 is left shoulder to elbow. Preserve an 80 px reference vector while the participant
		// vector is 40 px and participant body scale is half the reference scale.
		reference[11] = { ...reference[11], x: 100, y: 100 };
		reference[12] = { ...reference[12], x: 180, y: 100 };
		reference[23] = { ...reference[23], x: 100, y: 220 };
		reference[24] = { ...reference[24], x: 180, y: 220 };
		reference[13] = { ...reference[13], x: 180, y: 100 };
		participant[11] = { ...participant[11], x: 100, y: 100 };
		participant[12] = { ...participant[12], x: 140, y: 100 };
		participant[23] = { ...participant[23], x: 100, y: 160 };
		participant[24] = { ...participant[24], x: 140, y: 160 };
		participant[13] = { ...participant[13], x: 100, y: 140 };
		const result = compareVionaFrame(reference, participant).vectors[4];
		expect(result.rawReferenceLength).toBeCloseTo(80);
		expect(result.rawParticipantLength).toBeCloseTo(40);
		expect(result.referenceScale).toBeCloseTo(100);
		expect(result.participantScale).toBeCloseTo(50);
		expect(result.adjustedParticipantLength).toBeCloseTo(80);
		expect(result.lengthError).toBeCloseTo(0);
		expect(result.referenceGate).toBeCloseTo(0.6);
		expect(result.participantGate).toBeCloseTo(-0.2);
		expect(result.angleError).toBeCloseTo(0.5);
		expect(result.dissimilarity).toBeCloseTo(-0.1);
	});

	it('returns null scores for zero vectors, missing landmarks, and zero scales', () => {
		const reference = pose();
		const participant = pose();
		reference[12] = { ...reference[11] };
		const zeroVector = compareVionaFrame(reference, participant).vectors[0];
		expect(zeroVector.dissimilarity).toBeNull();
		expect(zeroVector.invalidReason).toMatch(/zero/);

		const missing = pose();
		(missing as unknown as (typeof missing)[number][])[13] = undefined as never;
		const missingVector = compareVionaFrame(pose(), missing).vectors[4];
		expect(missingVector.dissimilarity).toBeNull();
		expect(missingVector.invalidReason).toBeTruthy();

		const collapsed = PoseLandmarkKeysUpperSnakeCase.map(() => ({
			x: 1,
			y: 1,
			dist_from_camera: 0,
			visibility: 1
		}));
		const noScale = compareVionaFrame(collapsed, collapsed);
		expect(noScale.overallDissimilarity).toBeNull();
		expect(noScale.vectors.every((vector) => vector.dissimilarity === null)).toBe(true);
	});
});
