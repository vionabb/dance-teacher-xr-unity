import { describe, it, expect } from 'vitest';
import {
	calculateKinematicErrorDescriptors,
	calculateJointVels,
	calculateJointDerivs,
	calculateKinematicValues,
	type VecWithVisibility,
	type UserRefPair,
	getFrameError,
	type KinematicValues,
	type ScalarWithVisibility
} from './compute-kinematic-motion-descriptors.js';
import type { Pose2DPixelLandmarks, Pose3DLandmarkFrame } from '$lib/webcam/mediapipe-utils.js';

describe('calculateJointVels', () => {
	it('should calculate correct velocities for 2D poses', () => {
		// Create simple 2D pose with 2 landmarks
		const currentPose: Pose2DPixelLandmarks = [
			{ x: 10, y: 20, dist_from_camera: 0, visibility: 0.9 },
			{ x: 30, y: 40, dist_from_camera: 0, visibility: 0.8 }
		];
		const previousPose: Pose2DPixelLandmarks = [
			{ x: 5, y: 15, dist_from_camera: 0, visibility: 0.9 },
			{ x: 25, y: 35, dist_from_camera: 0, visibility: 0.8 }
		];

		// Time delta of 0.5s and scale of 1.0
		const dt = 0.5;
		const scale = 1.0;

		const velocities = calculateJointVels(currentPose, previousPose, dt, scale);

		// Expected velocities: (current - previous) / dt
		// For landmark 0: [(10-5)/0.5, (20-15)/0.5] = [10, 10]
		// For landmark 1: [(30-25)/0.5, (40-35)/0.5] = [10, 10]
		expect(velocities[0].vals).toEqual([10, 10]);
		expect(velocities[0].visibility).toEqual(0.9);
		expect(velocities[1].vals).toEqual([10, 10]);
		expect(velocities[1].visibility).toEqual(0.8);
	});

	it('should calculate correct velocities for 3D poses', () => {
		// Create simple 3D pose with 2 landmarks
		const currentPose: Pose3DLandmarkFrame = [
			{ x: 10, y: 20, z: 30, visibility: 0.9 },
			{ x: 40, y: 50, z: 60, visibility: 0.8 }
		];
		const previousPose: Pose3DLandmarkFrame = [
			{ x: 5, y: 15, z: 25, visibility: 0.9 },
			{ x: 35, y: 45, z: 55, visibility: 0.8 }
		];

		const dt = 0.5;
		const scale = 1.0;

		const velocities = calculateJointVels(currentPose, previousPose, dt, scale);

		// Expected velocities: (current - previous) / dt
		// For landmark 0: [(10-5)/0.5, (20-15)/0.5, (30-25)/0.5] = [10, 10, 10]
		// For landmark 1: [(40-35)/0.5, (50-45)/0.5, (60-55)/0.5] = [10, 10, 10]
		expect(velocities[0].vals).toEqual([10, 10, 10]);
		expect(velocities[0].visibility).toEqual(0.9);
		expect(velocities[1].vals).toEqual([10, 10, 10]);
		expect(velocities[1].visibility).toEqual(0.8);
	});

	it('should handle scaling correctly', () => {
		const currentPose: Pose2DPixelLandmarks = [
			{ x: 10, y: 20, dist_from_camera: 0, visibility: 1.0 }
		];
		const previousPose: Pose2DPixelLandmarks = [
			{ x: 5, y: 15, dist_from_camera: 0, visibility: 1.0 }
		];

		const dt = 1.0;

		// Without scaling (scale = 1.0)
		const velocitiesNoScale = calculateJointVels(currentPose, previousPose, dt, 1.0);
		expect(velocitiesNoScale[0].vals).toEqual([5, 5]);

		// With scaling (scale = 2.0)
		const velocitiesWithScale = calculateJointVels(currentPose, previousPose, dt, 2.0);
		expect(velocitiesWithScale[0].vals).toEqual([2.5, 2.5]); // Values should be half when scale doubles
	});
});

describe('calculateJointDerivs', () => {
	it('should calculate correct derivatives between two sets of vectors', () => {
		const currentVecs: VecWithVisibility[] = [
			{ vals: [10, 20], visibility: 1.0 },
			{ vals: [30, 40], visibility: 0.9 }
		];

		const prevVecs: VecWithVisibility[] = [
			{ vals: [5, 10], visibility: 1.0 },
			{ vals: [25, 30], visibility: 0.9 }
		];

		const dt = 0.5;

		const derivs = calculateJointDerivs(currentVecs, prevVecs, dt);

		// Expected derivatives: (current - prev) / dt
		// For vec 0: [(10-5)/0.5, (20-10)/0.5] = [10, 20]
		// For vec 1: [(30-25)/0.5, (40-30)/0.5] = [10, 20]
		expect(derivs[0].vals).toEqual([10, 20]);
		expect(derivs[0].visibility).toEqual(1.0);
		expect(derivs[1].vals).toEqual([10, 20]);
		expect(derivs[1].visibility).toEqual(0.9);
	});

	it('should throw error when array lengths mismatch', () => {
		const currentVecs: VecWithVisibility[] = [
			{ vals: [10, 20], visibility: 1.0 },
			{ vals: [30, 40], visibility: 0.9 }
		];

		const prevVecs: VecWithVisibility[] = [{ vals: [5, 10], visibility: 1.0 }];

		const dt = 0.5;

		expect(() => calculateJointDerivs(currentVecs, prevVecs, dt)).toThrow(
			'Mismatched array lengths between current and previous joint metrics.'
		);
	});

	it('should throw error when vector dimensions mismatch', () => {
		const currentVecs: VecWithVisibility[] = [{ vals: [10, 20, 30], visibility: 1.0 }];

		const prevVecs: VecWithVisibility[] = [{ vals: [5, 10], visibility: 1.0 }];

		const dt = 0.5;

		expect(() => calculateJointDerivs(currentVecs, prevVecs, dt)).toThrow(
			'Mismatched array lengths between current and previous joint metrics.'
		);
	});
});

describe('calculateKinematicValues', () => {
	it('should calculate kinematic values for a sequence of poses', () => {
		// Create a simple sequence of poses with 2 frames, 1 landmark each
		const userPoses: Pose2DPixelLandmarks[] = [
			[{ x: 0, y: 0, dist_from_camera: 0, visibility: 1.0 }],
			[{ x: 10, y: 10, dist_from_camera: 0, visibility: 1.0 }]
		];

		const referencePoses: Pose2DPixelLandmarks[] = [
			[{ x: 0, y: 0, dist_from_camera: 0, visibility: 1.0 }],
			[{ x: 5, y: 5, dist_from_camera: 0, visibility: 1.0 }]
		];

		const frameTimes = [0, 1]; // 1 second apart

		const kinematicValues = calculateKinematicValues(userPoses, referencePoses, frameTimes);

		expect(kinematicValues.poses.length).toBe(2);
		expect(kinematicValues.vels.length).toBe(2);

		// First frame won't have calculation since we need two frames to compute velocity
		// Second frame should have velocity calculated
		const secondFrameVels = kinematicValues.vels[1];
		expect(secondFrameVels.user[0].vals).toEqual([10, 10]); // User moved 10 units in both x and y in 1s
		expect(secondFrameVels.ref[0].vals).toEqual([5, 5]); // Reference moved 5 units in both x and y in 1s
	});

	it('should handle different scaling behaviors correctly', () => {
		// Create poses with scaling differences
		const userPoses: Pose2DPixelLandmarks[] = [
			[{ x: 0, y: 0, dist_from_camera: 0, visibility: 1.0 }],
			[{ x: 10, y: 10, dist_from_camera: 0, visibility: 1.0 }]
		];

		const referencePoses: Pose2DPixelLandmarks[] = [
			[{ x: 0, y: 0, dist_from_camera: 0, visibility: 1.0 }],
			[{ x: 5, y: 5, dist_from_camera: 0, visibility: 1.0 }]
		];

		const frameTimes = [0, 1];

		// Test with no scaling
		const noScaling = calculateKinematicValues(userPoses, referencePoses, frameTimes, {
			scaleBehavior: 'none'
		});

		// Check velocities are calculated correctly with no scaling
		expect(noScaling.vels[1].user[0].vals).toEqual([10, 10]); // User moved 10 units in both x and y in 1s
		expect(noScaling.vels[1].ref[0].vals).toEqual([5, 5]); // Reference moved 5 units in both x and y in 1s

		// Check velocity errors
		expect(noScaling.velErrors[1][0].value).toBeCloseTo(Math.sqrt(50)); // sqrt((10-5)^2 + (10-5)^2) = sqrt(50)

		////
		//  Test with scaleByFrame
		////

		// Test with custom scale indicator function
		const customScaling = calculateKinematicValues(userPoses, referencePoses, frameTimes, {
			scaleBehavior2D: 'scaleByFrame',
			scaleBehavior3D: 'scaleByFrame',
			scaleIndicator: {
				user: 2.0,
				ref: 4.0
			}
		});

		// Check scaled velocities
		// With custom scale functions, user scale = 2.0 and ref scale = 4.0
		// User moved (10,10) in 1s, so velocity should be (10/2.0, 10/2.0) = (5, 5)
		expect(customScaling.vels[1].user[0].vals[0]).toBeCloseTo(5);
		expect(customScaling.vels[1].user[0].vals[1]).toBeCloseTo(5);

		// Reference moved (5,5) in 1s, with scale 4.0, so velocity should be (5/4.0, 5/4.0) = (1.25, 1.25)
		expect(customScaling.vels[1].ref[0].vals[0]).toBeCloseTo(1.25);
		expect(customScaling.vels[1].ref[0].vals[1]).toBeCloseTo(1.25);

		// Verify the error calculation works with the scaled values
		// The velocity error should now be sqrt((5-1.25)^2 + (5-1.25)^2) = sqrt(2*3.75^2) ≈ 5.3
		expect(customScaling.velErrors[1][0].value).toBeCloseTo(Math.sqrt(2) * 3.75, 1);
	});

	it('should throw error when input arrays have mismatched lengths', () => {
		const userPoses: Pose2DPixelLandmarks[] = [
			[{ x: 0, y: 0, dist_from_camera: 0, visibility: 1.0 }],
			[{ x: 10, y: 10, dist_from_camera: 0, visibility: 1.0 }]
		];

		const referencePoses: Pose2DPixelLandmarks[] = [
			[{ x: 0, y: 0, dist_from_camera: 0, visibility: 1.0 }]
		];

		const frameTimes = [0, 1];

		expect(() => calculateKinematicValues(userPoses, referencePoses, frameTimes)).toThrow(
			'Mismatched array lengths between matchingUserPoses and referencePoses.'
		);

		// Also test with mismatched frameTimes
		const referencePoses2: Pose2DPixelLandmarks[] = [
			[{ x: 0, y: 0, dist_from_camera: 0, visibility: 1.0 }],
			[{ x: 5, y: 5, dist_from_camera: 0, visibility: 1.0 }]
		];

		const frameTimes2 = [0];

		expect(() => calculateKinematicValues(userPoses, referencePoses2, frameTimes2)).toThrow(
			'Mismatched array lengths between matchingUserPoses and referencePoses.'
		);
	});
});

describe('calculateKinematicErrorDescriptors', () => {
	it('should calculate correct error metrics from kinematic values', () => {
		// First, create a simplified mock of kinematic values
		const mockKinematicValues: KinematicValues = {
			poses: [
				{
					user: [{ x: 0, y: 0, dist_from_camera: 0, visibility: 1.0 }],
					ref: [{ x: 0, y: 0, dist_from_camera: 0, visibility: 1.0 }]
				}
			],
			vels: [
				{
					user: [{ vals: [10, 10], visibility: 1.0 }],
					ref: [{ vals: [5, 5], visibility: 1.0 }]
				}
			],
			velErrors: [[{ value: 5, visibility: 1.0 }]], // Difference between 10 and 5
			accels: [
				{
					user: [{ vals: [2, 2], visibility: 1.0 }],
					ref: [{ vals: [1, 1], visibility: 1.0 }]
				}
			],
			accelErrors: [[{ value: 1, visibility: 1.0 }]], // Difference between 2 and 1
			jerks: [
				{
					user: [{ vals: [0.5, 0.5], visibility: 1.0 }],
					ref: [{ vals: [0.2, 0.2], visibility: 1.0 }]
				}
			],
			jerkErrors: [[{ value: 0.3, visibility: 1.0 }]] // Difference between 0.5 and 0.2
		};

		const errorMetrics = calculateKinematicErrorDescriptors(mockKinematicValues);

		// For a single value, MAE and RMSE should be the same
		expect(errorMetrics.velMAE).toBeCloseTo(5);
		expect(errorMetrics.velRMSE).toBeCloseTo(5);
		expect(errorMetrics.accelMAE).toBeCloseTo(1);
		expect(errorMetrics.accelRMSE).toBeCloseTo(1);
		expect(errorMetrics.jerkMAE).toBeCloseTo(0.3);
		expect(errorMetrics.jerkRMSE).toBeCloseTo(0.3);
	});

	it('should handle visibility behaviors correctly', () => {
		// Create mock kinematic values with varying visibility
		const mockKinematicValues = {
			poses: [
				{
					user: [{ x: 0, y: 0, dist_from_camera: 0, visibility: 1.0 }],
					ref: [{ x: 0, y: 0, dist_from_camera: 0, visibility: 1.0 }]
				}
			] as UserRefPair<Pose2DPixelLandmarks>[],
			vels: [
				{
					user: [{ vals: [10, 10], visibility: 1.0 } as VecWithVisibility],
					ref: [{ vals: [5, 5], visibility: 1.0 } as VecWithVisibility]
				}
			] as UserRefPair<VecWithVisibility[]>[],
			velErrors: [
				[{ value: 4, visibility: 0.5 }], // Less visible
				[{ value: 6, visibility: 1.0 }] // More visible
			] as ScalarWithVisibility[][],
			accels: [
				{
					user: [{ vals: [2, 2], visibility: 1.0 }],
					ref: [{ vals: [1, 1], visibility: 1.0 }]
				}
			] as UserRefPair<VecWithVisibility[]>[],
			accelErrors: [
				[{ value: 1, visibility: 0.5 }],
				[{ value: 3, visibility: 1.0 }]
			] as ScalarWithVisibility[][],
			jerks: [
				{
					user: [{ vals: [0.5, 0.5], visibility: 1.0 }],
					ref: [{ vals: [0.2, 0.2], visibility: 1.0 }]
				}
			] as UserRefPair<VecWithVisibility[]>[],
			jerkErrors: [
				[{ value: 0.2, visibility: 0.5 }],
				[{ value: 0.4, visibility: 1.0 }]
			] as ScalarWithVisibility[][]
		} as KinematicValues;

		// With 'none' behavior, visibility should be ignored
		const noVisibilityMetrics = calculateKinematicErrorDescriptors(mockKinematicValues, {
			visibilityBehavior: 'none'
		});
		expect(noVisibilityMetrics.velMAE).toBeCloseTo((4 + 6) / 2);

		// With 'scale' behavior, more visible errors should have more weight
		const scaleVisibilityMetrics = calculateKinematicErrorDescriptors(mockKinematicValues, {
			visibilityBehavior: 'scale'
		});
		// The weighted values should be different from the unweighted ones
		expect(scaleVisibilityMetrics.velMAE).not.toEqual(noVisibilityMetrics.velMAE);
	});

	it('should apply landmark weights correctly', () => {
		// Create mock kinematic values with multiple landmarks
		const mockKinematicValues: KinematicValues = {
			poses: [
				{
					user: [
						{ x: 0, y: 0, dist_from_camera: 0, visibility: 1.0 },
						{ x: 0, y: 0, dist_from_camera: 0, visibility: 1.0 }
					],
					ref: [
						{ x: 0, y: 0, dist_from_camera: 0, visibility: 1.0 },
						{ x: 0, y: 0, dist_from_camera: 0, visibility: 1.0 }
					]
				}
			],
			vels: [
				{
					user: [
						{ vals: [10, 10], visibility: 1.0 },
						{ vals: [20, 20], visibility: 1.0 }
					],
					ref: [
						{ vals: [5, 5], visibility: 1.0 },
						{ vals: [15, 15], visibility: 1.0 }
					]
				}
			],
			velErrors: [
				[
					{ value: 5, visibility: 1.0 }, // Error for landmark 0
					{ value: 10, visibility: 1.0 } // Error for landmark 1
				]
			],
			accels: [{ user: [], ref: [] }],
			accelErrors: [[]],
			jerks: [{ user: [], ref: [] }],
			jerkErrors: [[]]
		};

		// Without weights, all landmarks should have equal contribution
		const noWeightsMetrics = calculateKinematicErrorDescriptors(mockKinematicValues);
		expect(noWeightsMetrics.velMAE).toBeCloseTo((5 + 10) / 2); // Average of 5 and 10

		// With weights [1, 3], landmark 1 should have 3x the influence of landmark 0
		const weightedMetrics = calculateKinematicErrorDescriptors(mockKinematicValues, {
			landmarkWeights: [1, 3]
		});
		expect(weightedMetrics.velMAE).toBeCloseTo((5 * 1 + 10 * 3) / 4); // Weighted average
	});

	it('should throw error with invalid landmark weights', () => {
		const mockKinematicValues: KinematicValues = {
			poses: [
				{
					user: [{ x: 0, y: 0, dist_from_camera: 0, visibility: 1.0 }],
					ref: [{ x: 0, y: 0, dist_from_camera: 0, visibility: 1.0 }]
				}
			],
			vels: [{ user: [], ref: [] }],
			velErrors: [[]],
			accels: [{ user: [], ref: [] }],
			accelErrors: [[]],
			jerks: [{ user: [], ref: [] }],
			jerkErrors: [[]]
		};

		// Wrong number of weights
		expect(() =>
			calculateKinematicErrorDescriptors(mockKinematicValues, {
				landmarkWeights: [1, 2] // There's only 1 landmark in the mock
			})
		).toThrow();
	});
});

describe('getFrameError', () => {
	it('should calculate correct vector errors for matching user and reference vectors', () => {
		const user = [{ vals: [10, 20], visibility: 1.0 }];
		const ref = [{ vals: [5, 15], visibility: 0.8 }];
		const result = getFrameError({ user, ref });
		// Expected error: sqrt((10-5)^2 + (20-15)^2) = sqrt(50)
		expect(result).toEqual([{ value: Math.sqrt(50), visibility: 0.9 }]);
	});

	it('should throw an error for mismatched array lengths', () => {
		const user = [{ vals: [10, 20], visibility: 1.0 }];
		const ref: VecWithVisibility[] = [];
		expect(() => getFrameError({ user, ref })).toThrow(
			'Mismatched array lengths between user and reference vectors.'
		);
	});

	it('should throw an error for mismatched vector dimensions', () => {
		const user = [{ vals: [10, 20, 30], visibility: 1.0 }];
		const ref = [{ vals: [5, 15], visibility: 0.8 }];
		expect(() => getFrameError({ user, ref })).toThrow();
	});

	it('should return an empty array for empty input', () => {
		const user: VecWithVisibility[] = [];
		const ref: VecWithVisibility[] = [];
		const result = getFrameError({ user, ref });
		expect(result).toEqual([]);
	});

	it('should correctly average visibility values', () => {
		const user = [{ vals: [10, 20], visibility: 0.6 }];
		const ref = [{ vals: [5, 15], visibility: 0.8 }];
		const result = getFrameError({ user, ref });
		expect(result[0].visibility).toBeCloseTo(0.7);
	});
});
