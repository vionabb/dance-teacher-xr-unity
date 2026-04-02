import type { Landmark, NormalizedLandmark, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { SwapMultipleArrayElements } from '$lib/utils/array';
import type { ValueOf } from '$lib/data/dances-store';
import { simd } from 'wasm-feature-detect';
import { browser } from '$app/environment';

export const PoseLandmarkIds = Object.freeze({
	nose: 0,
	leftEyeInner: 1,
	leftEye: 2,
	leftEyeOuter: 3,
	rightEyeInner: 4,
	rightEye: 5,
	rightEyeOuter: 6,
	leftEar: 7,
	rightEar: 8,
	mouthLeft: 9,
	mouthRight: 10,
	leftShoulder: 11,
	rightShoulder: 12,
	leftElbow: 13,
	rightElbow: 14,
	leftWrist: 15,
	rightWrist: 16,
	leftPinky: 17,
	rightPinky: 18,
	leftIndex: 19,
	rightIndex: 20,
	leftThumb: 21,
	rightThumb: 22,
	leftHip: 23,
	rightHip: 24,
	leftKnee: 25,
	rightKnee: 26,
	leftAnkle: 27,
	rightAnkle: 28,
	leftHeel: 29,
	rightHeel: 30,
	leftFootIndex: 31,
	rightFootIndex: 32
});
export type PoseLandmarkIndex = ValueOf<typeof PoseLandmarkIds>;
type PoseLandmarkName = keyof typeof PoseLandmarkIds;
export const PoseLandmarkKeys = Object.freeze(
	Object.getOwnPropertyNames(PoseLandmarkIds)
) as readonly PoseLandmarkName[];

/**
 * Represents a frame with 32 normalized 2D landmarks, corresponding to different parts of the body as
 * specified by [mediapipe's documentation](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker),
 * with coordinates between 0 and 1. (0, 0) is the left, top of the image, and (1, 1) is the right,
 * bottom of the image. Note that this normalization doesn't take into account the aspect ratio of
 * the image, so the scales of the x and y components of thelandmark are of different scales.
 *
 * There is a z component, which at the same scale as the x component, corresponding to the distance
 * from the camera.
 *
 * @
 *
 * @see [Output Format](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker/web_js#handle_and_display_results)
 */
export type Pose2DNormalizedLandmarkFrame = PoseLandmarkerResult['landmarks'][0];

/**
 * Represents a 3d landmark, returned as part of mediapipe's `worldLandmarks` output. The scale here
 * is approximately in meters, but the exact scale is unknown. These are not normalized.
 */
export type Landmark3D = Landmark;

/**
 * Represents a 3d landmark, returned as part of mediapipe's `worldLandmarks` output, with an added
 * visibiltiy component between [0, 1]. The scale here is approximately in meters, but the exact
 * scale is unknown. These are not normalized.
 */
export type Landmark3DWithVisibility = Landmark3D & {
	vis: number;
};

/**
 * A frame with 32 3D landmarks, corresponding to different parts of the body as specified by
 * [mediapipe's documentation](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker).
 */
export type Pose3DLandmarkFrame = Landmark3D[];

/**
 * A frame with 32 3D landmarks, corresponding to different parts of the body as specified by
 * [mediapipe's documentation](https://developers.google.com/mediapipe/solutions/vision/pose_landmarker).
 * These landmarks also have a visibility component, which is a number between 0 and 1, where 0
 * means the landmark is not visible, and 1 means the landmark is fully visible.
 * This is returned as part of mediapipe's `worldLandmarks` output in the python solution, and is
 * stored in our .holisticdata CSV files.
 */
export type Pose3DLandmarkWithVisibilityFrame = Landmark3D[];

/**
 * Represents any landmark.
 */
export type AnyLandmark = NormalizedLandmark | PixelLandmark | Landmark3D;

/**
 * Represents a 2d landmark, converted to pixel coordinates.
 */
export type PixelLandmark = {
	x: number;
	y: number;
	dist_from_camera: number;
	visibility?: number;
};
export type Pose2DPixelLandmarks = PixelLandmark[];

/**
 * Convert a string from camelCase to snake_case
 * @param camelCaseString A string in camelCase, like "leftShoulder"
 * @returns A string in snake_case, like "left_shoulder"
 */
function convertCamelcaseStringToSnakeCase(camelCaseString: string): string {
	return (
		camelCaseString
			// Add an underscore before all capital letters
			// (other than one occuring as the first character)
			.replace(/(?<!^)[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
	);
}

export const PoseLandmarkKeysUpperSnakeCase = Object.freeze(
	PoseLandmarkKeys.map((k) => convertCamelcaseStringToSnakeCase(k).toUpperCase())
);

export function SwapLeftRightLandmarks<T extends AnyLandmark>(pose: T[]) {
	const copiedPose = [...pose];
	SwapMultipleArrayElements(copiedPose, [
		[PoseLandmarkIds.leftEyeInner, PoseLandmarkIds.rightEyeInner],
		[PoseLandmarkIds.leftEye, PoseLandmarkIds.rightEye],
		[PoseLandmarkIds.leftEyeOuter, PoseLandmarkIds.rightEyeOuter],
		[PoseLandmarkIds.leftEar, PoseLandmarkIds.rightEar],
		[PoseLandmarkIds.mouthLeft, PoseLandmarkIds.mouthRight],
		[PoseLandmarkIds.leftShoulder, PoseLandmarkIds.rightShoulder],
		[PoseLandmarkIds.leftElbow, PoseLandmarkIds.rightElbow],
		[PoseLandmarkIds.leftWrist, PoseLandmarkIds.rightWrist],
		[PoseLandmarkIds.leftPinky, PoseLandmarkIds.rightPinky],
		[PoseLandmarkIds.leftIndex, PoseLandmarkIds.rightIndex],
		[PoseLandmarkIds.leftThumb, PoseLandmarkIds.rightThumb],
		[PoseLandmarkIds.leftHip, PoseLandmarkIds.rightHip],
		[PoseLandmarkIds.leftKnee, PoseLandmarkIds.rightKnee],
		[PoseLandmarkIds.leftAnkle, PoseLandmarkIds.rightAnkle],
		[PoseLandmarkIds.leftHeel, PoseLandmarkIds.rightHeel],
		[PoseLandmarkIds.leftFootIndex, PoseLandmarkIds.rightFootIndex]
	]);
	return copiedPose;
}

/**
 * Mirror a pose frame along the x axis. This is useful for mirroring a pose frame of a user
 * in a webcam, so that the user's left side is on the left side of the frame, and the user's
 * right side is on the right side of the frame.
 * @param pose Pose Frame to mirror
 * @returns Mirrored pose frame
 */
export function MirrorXPose<T extends AnyLandmark>(poseFrame: T[]): T[] {
	const xFlipped = poseFrame.map((lm) => ({
		...lm,
		x: 1 - lm.x
	}));

	return SwapLeftRightLandmarks(xFlipped);
}

export function GetPixelLandmarksFromNormalizedLandmarks(
	normalizedLandmarks: NormalizedLandmark[],
	srcWidth: number,
	srcHeight: number
): Pose2DPixelLandmarks | null {
	if ((normalizedLandmarks?.length ?? 0) <= 0) return null;

	return normalizedLandmarks.map((lm) => {
		const landmark = {
			x: lm.x * srcWidth,
			y: lm.y * srcHeight,
			dist_from_camera: lm.z * srcWidth
		};
		const visibility_value = (lm as unknown as Record<string, number>)['visibility'];
		if (visibility_value !== undefined) {
			return {
				...landmark,
				visibility: visibility_value
			};
		}
		return landmark;
	});
}

export function GetNormalizedLandmarksFromPixelLandmarks(
	pixelLandmarks: Pose2DPixelLandmarks,
	srcWidth: number,
	srcHeight: number
): NormalizedLandmark[] {
	return pixelLandmarks.map((lm) => ({
		x: lm.x / srcWidth,
		y: lm.y / srcHeight,
		z: lm.dist_from_camera / srcWidth,
		visibility: lm.visibility ?? 1.0
	}));
}
export enum ResponseMessages {
	poseEstimation = 'poseEstimation',
	error = 'error',
	resetComplete = 'resetComplete',
	resetError = 'resetError'
}

// Create enum of PoseMessages
export enum PostMessages {
	requestPoseEstimation = 'requestPoseEstimation',
	reset = 'reset',
	confirmReady = 'confirmReady'
}

export async function loadPoseLandmarkerModel() {
	if (!browser) {
		return null;
	}

	const supportsSimd = await simd();

	const MP_FOLDER = '/mediapipe';
	const wasmVisionFileset = {
		wasmLoaderPath: `${MP_FOLDER}/vision_wasm_nosimd_internal.js`,
		wasmBinaryPath: `${MP_FOLDER}/vision_wasm_nosimd_internal.wasm`
	};
	if (supportsSimd) {
		wasmVisionFileset.wasmLoaderPath = `${MP_FOLDER}/vision_wasm_internal.js`;
		wasmVisionFileset.wasmBinaryPath = `${MP_FOLDER}/vision_wasm_internal.wasm`;
	}

	const runningMode = 'VIDEO';

	const TasksVisionModule = await import('@mediapipe/tasks-vision');
	const poseLandmarker = await TasksVisionModule.PoseLandmarker.createFromOptions(
		wasmVisionFileset,
		{
			baseOptions: {
				modelAssetPath: `/mediapipe/pose_landmarker_lite.task`,
				delegate: 'GPU'
			},
			runningMode: runningMode,
			numPoses: 2
		}
	);

	return poseLandmarker;
}
