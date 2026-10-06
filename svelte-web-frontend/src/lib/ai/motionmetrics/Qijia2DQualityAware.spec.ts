import { describe, expect, it } from 'vitest';
import type { Pose2DPixelLandmarks } from '$lib/webcam/mediapipe-utils';
import Qijia2DPoseEvaluationMetric from './Qijia2DPoseEvaluationMetric';
import {
	computeQijia2DQualityAwareFrame,
	summarizeQijia2DQualityAware
} from './Qijia2DQualityAware';

function pose(visibility?: number): Pose2DPixelLandmarks {
	return Array.from({ length: 33 }, (_, index) => ({
		x: index * 10,
		y: index * index + 1,
		dist_from_camera: 0,
		visibility
	}));
}

describe('opt-in Qijia2D quality contract', () => {
	it('scores complete visible geometry and gives a tight sufficiency interval', () => {
		const frame = computeQijia2DQualityAwareFrame(pose(1), pose(1));
		expect(frame.contract).toBe('qijia2d-quality-v1');
		expect(frame.score).toBeCloseTo(5);
		expect(frame.validComparisons).toBe(8);
		expect(frame.coverage).toBe(1);
		expect(frame.effectiveCoverage).toBe(1);
		expect(frame.calculationQuality).toBe(1);
		expect([frame.unweightedGridLowerBound, frame.unweightedGridUpperBound]).toEqual([5, 5]);
	});

	it('records low visibility without a default exclusion or legacy score change', () => {
		const reference = pose(1);
		const user = pose(0.2);
		const frame = computeQijia2DQualityAwareFrame(reference, user, {
			user: { predictedUsability: 0.01 }
		});
		expect(frame.score).toBeCloseTo(5);
		expect(frame.coverage).toBe(1);
		expect(frame.calculationQuality).toBeCloseTo(0.2);
		expect(frame.predictedUsability.user).toBe(0.01);
		const gated = computeQijia2DQualityAwareFrame(reference, user, {}, { minVisibility: 0.5 });
		expect(gated.score).toBeNull();
		expect(gated.coverage).toBe(0);
		const legacy = new Qijia2DPoseEvaluationMetric().computeMetric(
			{} as never,
			[],
			0,
			0,
			user,
			[] as never,
			reference,
			[] as never
		);
		expect(legacy.overallScore).toBeCloseTo(5);
	});

	it('preserves unusable frames in the expected denominator and abstains', () => {
		const valid = computeQijia2DQualityAwareFrame(pose(1), pose(1));
		const unusable = computeQijia2DQualityAwareFrame(pose(1), pose(1), {
			user: { unusable: true }
		});
		expect(unusable.score).toBeNull();
		expect(unusable.expectedComparisons).toBe(8);
		const summary = summarizeQijia2DQualityAware([valid, unusable]);
		expect(summary.frameCount).toBe(2);
		expect(summary.validFrameCount).toBe(1);
		expect(summary.expectedComparisons).toBe(16);
		expect(summary.validComparisons).toBe(8);
		expect(summary.score).toBeCloseTo(5);
		expect(summary.coverage).toBe(0.5);
		expect(summary.unweightedGridLowerBound).toBe(2.5);
		expect(summary.unweightedGridUpperBound).toBe(5);
	});

	it('keeps partial vector geometry and reduces measurement sufficiency', () => {
		const user = pose(1);
		user[12] = { ...user[11] };
		const frame = computeQijia2DQualityAwareFrame(pose(1), user);
		expect(frame.vectorScores[0]).toBeNull();
		expect(frame.validComparisons).toBeLessThan(8);
		expect(frame.score).not.toBeNull();
		expect(frame.unweightedGridLowerBound).toBeLessThan(frame.unweightedGridUpperBound);
		expect(frame.calculationQuality).toBeLessThan(1);
	});

	it('separates unknown visibility from low visibility and calibrated reliability', () => {
		const unknown = computeQijia2DQualityAwareFrame(pose(), pose(), {
			user: { predictedUsability: 0 }
		});
		expect(unknown.score).toBeCloseTo(5);
		expect(unknown.visibilityEvidenceCoverage).toBe(0);
		expect(unknown.meanKnownVisibility).toBeNull();
		expect(unknown.calculationQuality).toBeNull();
		expect(unknown.calibratedReliabilityUsed).toBe(false);
		expect(unknown.calibratedReliability.user).toBeNull();
		const calibrated = computeQijia2DQualityAwareFrame(pose(1), pose(1), {
			user: {
				calibratedReliability: {
					value: 0.5,
					calibrationSource: 'synthetic test fixture',
					calibrationVersion: 'test-v1'
				},
				landmarks: [
					{},
					{},
					{},
					{},
					{},
					{},
					{},
					{},
					{},
					{},
					{},
					{
						provenance: 'manual_corrected'
					}
				]
			}
		});
		expect(calibrated.score).toBeCloseTo(5);
		expect(calibrated.effectiveCoverage).toBe(0.5);
		expect(calibrated.unweightedGridLowerBound).toBe(5);
		expect(calibrated.unweightedGridUpperBound).toBe(5);
		expect(calibrated.calibratedReliabilityUsed).toBe(true);
		expect(calibrated.calibratedReliability.reference).toBeNull();
		expect(calibrated.calibratedReliability.user?.calibrationVersion).toBe('test-v1');
		expect(calibrated.provenanceCounts.manual_corrected).toBeGreaterThan(0);
		expect(calibrated.knownVisibilityInputs).toBe(32);
		expect(calibrated.expectedVisibilityInputs).toBe(32);
	});

	it('keeps unweighted completion bounds distinct from a weighted candidate score', () => {
		const perfect = computeQijia2DQualityAwareFrame(pose(1), pose(1));
		const reversed = pose(1).map((landmark) => ({
			...landmark,
			x: -landmark.x,
			y: -landmark.y
		}));
		const weak = computeQijia2DQualityAwareFrame(pose(1), reversed, {
			user: {
				calibratedReliability: {
					value: 0.1,
					calibrationSource: 'synthetic test fixture',
					calibrationVersion: 'test-v1'
				}
			}
		});
		const summary = summarizeQijia2DQualityAware([perfect, weak]);
		expect(summary.coverage).toBe(1);
		expect(summary.effectiveCoverage).toBeCloseTo(0.55);
		expect(summary.calibratedReliabilityInputCount).toBe(1);
		expect(summary.expectedCalibratedReliabilityInputs).toBe(4);
		expect(summary.unweightedGridLowerBound).toBeCloseTo(2.5);
		expect(summary.unweightedGridUpperBound).toBeCloseTo(2.5);
		expect(summary.score).toBeGreaterThan(summary.unweightedGridUpperBound);
	});

	it('abstains with no usable geometry while preserving full uncertainty', () => {
		const absent = pose(1).map((landmark) => ({ ...landmark, x: Number.NaN }));
		const frame = computeQijia2DQualityAwareFrame(absent, pose(1));
		const summary = summarizeQijia2DQualityAware([frame]);
		expect(frame.score).toBeNull();
		expect(frame.validComparisons).toBe(0);
		expect(frame.calculationQuality).toBeNull();
		expect(summary.score).toBeNull();
		expect(summary.unweightedGridLowerBound).toBe(0);
		expect(summary.unweightedGridUpperBound).toBe(5);
	});
});
