import type { TerminalFeedbackBodyPart, TerminalFeedbackBodyPartIndex } from "$lib/model/TerminalFeedback";
import {PoseLandmarkIds, type PoseLandmarkIndex, type Pose2DPixelLandmarks, PoseLandmarkKeys, type Pose3DLandmarkFrame } from  "$lib/webcam/mediapipe-utils";
import type { StudySegmentData, SegmentInfo, TiktokDanceClipData } from "./motionmetrics/PoseDataTestFile";

export type PoseVectorIdPair = [PoseLandmarkIndex, PoseLandmarkIndex]
export type VectorAngleComparisonInfo = { vec1: PoseVectorIdPair, vec2: PoseVectorIdPair, rangeOfMotion: number};
export type ReadonlyPoseVectorIdPair = Readonly<PoseVectorIdPair>;
export type ReadonlyVectorAngleComparisonInfo = Readonly<{vec1: ReadonlyPoseVectorIdPair, vec2: ReadonlyPoseVectorIdPair, rangeOfMotion: number}>;

/**
 * Calculate the norm of a vector.
 * @param v Vector as an 1D array
 * @param norm The norm to use for the vector. Defaults to 2 (Euclidean norm).
 * 
 * Using a higher norm will emphasize larger values in the vector, while using a lower norm weight
 * the contributions more evenly.
 * 
 * Given X = [x1, x2, ..., xn] with norm L, the norm is calculated as:
 *   (x1^L + x2^L + ... + xn^L)^(1/L)
 * 
 * @example
 * ```
 * GetVectorNorm([0.2, 0.8], 1) // 1.0  manhatten distance
 * GetVectorNorm([0.2, 0.8], 2) // 0.82 euclidean distance
 * GetVectorNorm([0.2, 0.8], 3) // 0.804 3rd root distance
 * GetVectorNorm([0.2, 0.8], 100) // 0.8 100th root distance (aprooaching a max function)
 * ```
 */
export function GetVectorPNorm(v: number[], pnorm = 2) {
    const sum = v.reduce((sum, val) => sum + Math.pow(val, pnorm), 0)
    return Math.pow(sum, 1 / pnorm)
}

export function GetVectorAbsDifferences<
    T extends [number, number] | [number, number, number] | (number[])>
    (v1: T, v2: T): T 
{
    if (v1.length !== v2.length) throw new Error("Vectors must have the same length");
    return v1.map((val, index) => Math.abs(val - v2[index])) as T
}

export const GetVectorNorm = GetVectorPNorm;

export function GetVectorError(v1: number[], v2: number[]) {
    return GetVectorNorm(GetVectorAbsDifferences<number[]>(v1, v2));
}

export function GetPNormalizedVector(v: number[], pnorm = 2) {
    const mag = GetVectorPNorm(v, pnorm);
    return v.map((val) => val / mag);
}

export function GetMean(v: number[]) {
    return v.reduce((sum, val) => sum + val, 0) / v.length;
}

export function ComputeMAE(errors: number[]) {
    return errors.reduce((sum, val) => sum + Math.abs(val), 0) / errors.length;
}
export function ComputeRMSE(errors: number[]) {
    return Math.sqrt(errors.reduce((sum, val) => sum + Math.pow(val, 2), 0) / errors.length);
}

export function getPoseType(
    pose: Pose2DPixelLandmarks | Pose3DLandmarkFrame | null
): '2D' | '3D' | 'invalid' {
    if (!pose || !Array.isArray(pose) || pose.length === 0) {
        return 'invalid';
    }
    if ((pose as any)?.[0]?.dist_from_camera !== undefined) {
        return '2D';
    }
    if ((pose as any)?.[0]?.z !== undefined) {
        return '3D';
    }
    return 'invalid';
}

/**
 * Calculates an average of the vector elements, normalized by the vector length.
 * @param v 1D vector as an array
 * @param norm The norm to use for calculating the average. Defaults to 2 (Euclidean norm)
 * @returns An average of the vector elements, normalized by the vector length
 * 
 * Using a higher norm will emphasize larger values in the vector, while using a lower norm will
 * emphasize smaller values in the vector.
 * 
 * Given X = [x1, x2, ..., xn] with norm L, the norm average is calculated as:
 *   (x1^L + x2^L + ... + xn^L)^(1/L) / n^(1/L)
 * 
 * @example```
 * GetVectorNormAverage([0, 1], 1.0) // 0.5, even weighting
 * GetVectorNormAverage([0, 1], 0.5) // 0.25, tends towards smaller values
 * GetVectorNormAverage([0, 1], 2.0) // 0.7, tends towards larger values
 * GetVectorNormAverage([0, 1], 100) // 0.99, like a max function
 * GetVectorNormAverage([0, 1], 0.01) // 0.0009, like a min function
 * ```
 */
export function GetVectorPNormAverage(v: number[], pnorm = 2) { 
    return GetVectorPNorm(v, pnorm) / Math.pow(v.length, 1 / pnorm) 
}

export function GetHarmonicMean(v: number[], weights?: number[]) {
    if (weights) {
        if (weights.length !== v.length) throw new Error("weights and v must have the same length");
        const totalWeight = weights.reduce((sum, w) => sum + w, 0);
        return totalWeight / v.reduce((sum, val, index) => sum + (weights[index] / val), 0);
    }
    return v.length / v.reduce((sum, val) => sum + 1 / val, 0);
}
export function GetGeometricMean(v: number[]) {
    return Math.pow(v.reduce((prod, val) => prod * val, 1), 1 / v.length)
}
export function GetGeometricMeanAdjustedForZero(v: number[]) {
    return Math.pow(v.reduce((prod, val) => prod * (val + 1), 1), 1 / v.length) - 1
}

/**
 * Calculate a scale indicator for a set of 2D pose landmarks. The size of people in pixels
 * can vary greatly, so we need to standardize the measurements based on the user's body size.
 * The function computes a scale indicator based on the heights of the torso and shoulder width.
 * This is used to standardize measurements based on the user's body size in the reference space.
 * @param pixelLandmarks - 2D pixel coordinates of pose landmarks
 * @returns Scale indicator value
 */
export function Get2DScaleIndicator(pixelLandmarks: Readonly<Pose2DPixelLandmarks>){

    // Calculate torso heights and shoulder width
    const leftTorsoHeight = getMagnitude2DVec(Get2DVector(pixelLandmarks, PoseLandmarkIds.leftShoulder, PoseLandmarkIds.leftHip))
    const rightTorsoHeight = getMagnitude2DVec(Get2DVector(pixelLandmarks, PoseLandmarkIds.rightShoulder, PoseLandmarkIds.rightHip))
    const shoulderWidth = getMagnitude2DVec(Get2DVector(pixelLandmarks, PoseLandmarkIds.leftShoulder, PoseLandmarkIds.rightShoulder))
    
    // Combine the measurements to compute the scale indicator
    return 0.25 * leftTorsoHeight + 
           0.25 * rightTorsoHeight +
           0.5 * shoulderWidth
}

export function Get3DScaleIndicator(pixelLandmarks: Readonly<Pose3DLandmarkFrame>){

    // Calculate torso heights and shoulder width
    const leftTorsoHeight = getMagnitude3DVec(Get3DVector(pixelLandmarks, PoseLandmarkIds.leftShoulder, PoseLandmarkIds.leftHip))
    const rightTorsoHeight = getMagnitude3DVec(Get3DVector(pixelLandmarks, PoseLandmarkIds.rightShoulder, PoseLandmarkIds.rightHip))
    const shoulderWidth = getMagnitude3DVec(Get3DVector(pixelLandmarks, PoseLandmarkIds.leftShoulder, PoseLandmarkIds.rightShoulder))
    
    // Combine the measurements to compute the scale indicator
    return 0.25 * leftTorsoHeight + 
           0.25 * rightTorsoHeight +
           0.5 * shoulderWidth
}

/**
 * Definition of comparison vectors for the Qijia method.
 * These vectors represent pairs of pose landmarks used for similarity calculations.
 */
export const QijiaMethodComparisonVectors: Readonly<PoseVectorIdPair[]> = Object.freeze([
    [PoseLandmarkIds.leftShoulder,  PoseLandmarkIds.rightShoulder],
    [PoseLandmarkIds.leftShoulder,  PoseLandmarkIds.leftHip],
    [PoseLandmarkIds.leftHip,       PoseLandmarkIds.rightHip],
    [PoseLandmarkIds.rightHip,      PoseLandmarkIds.rightShoulder],
    [PoseLandmarkIds.leftShoulder,  PoseLandmarkIds.leftElbow],
    [PoseLandmarkIds.leftElbow,     PoseLandmarkIds.leftWrist],
    [PoseLandmarkIds.rightShoulder, PoseLandmarkIds.rightElbow],
    [PoseLandmarkIds.rightElbow,    PoseLandmarkIds.rightWrist]
])

function getWeightsListFromWeightsDict(weightsDict: Record<PoseLandmarkIndex, number>) {
    const weights = [];
    const landmarkIndices = [...Object.values(PoseLandmarkIds)] as PoseLandmarkIndex[];
    for (let i = 0; i < landmarkIndices.length; i++) {
        const lmId = landmarkIndices[i];
        if (lmId !== i) throw new Error(`Landmark ID ${lmId} does not match index ${i}`);
        weights.push(weightsDict[lmId] ?? 0.0);
    }
    return Object.freeze(weights);
}

/** Landmark weighting based on motion energy across the dataset of learner's dances in CHI 2025 
user  study 2. Landmarks that are visible and move more earn a higher weighing */
export const LandmarkWeightingDict_MotionEnergy = Object.freeze({
    
    // Head landmarks: 0.18 total
    [PoseLandmarkIds.nose]:       0.18 / 7,
    [PoseLandmarkIds.leftEye]:    0.18 / 7,
    [PoseLandmarkIds.rightEye]:   0.18 / 7,
    [PoseLandmarkIds.mouthLeft]:  0.18 / 7,
    [PoseLandmarkIds.mouthRight]: 0.18 / 7,
    [PoseLandmarkIds.leftEar]:    0.18 / 7,
    [PoseLandmarkIds.rightEar]:   0.18 / 7,

    // Shoulders: 0.10 total
    [PoseLandmarkIds.leftShoulder]:  0.10 / 2,
    [PoseLandmarkIds.rightShoulder]: 0.10 / 2,

    // Elbows: 0.15 total
    [PoseLandmarkIds.leftElbow]:  0.15 / 2,
    [PoseLandmarkIds.rightElbow]: 0.15 / 2,

    // Hands: 0.44 total (0.22 each)
    [PoseLandmarkIds.leftWrist]:  0.22 / 3,
    [PoseLandmarkIds.leftIndex]:  0.22 / 3,
    [PoseLandmarkIds.leftThumb]:  0.22 / 3,
    [PoseLandmarkIds.rightWrist]: 0.22 / 3,
    [PoseLandmarkIds.rightIndex]: 0.22 / 3,
    [PoseLandmarkIds.rightThumb]: 0.22 / 3,

    // Hips: 0.13 total
    [PoseLandmarkIds.leftHip]:  0.13 / 2,
    [PoseLandmarkIds.rightHip]: 0.13 / 2,

} as Record<PoseLandmarkIndex, number>);
export const LandmarkWeighting_MotionEnergy = getWeightsListFromWeightsDict(LandmarkWeightingDict_MotionEnergy);

/**
 * Names of the comparison vectors for the Qijia method.
 * These names are generated based on the landmark IDs.
 */
export const QijiaMethodComparisionVectorNames = QijiaMethodComparisonVectors.map((vec) => {
    const [lmSrc, lmDest] = vec;
    const [srcName, destName] = [PoseLandmarkKeys[lmSrc], PoseLandmarkKeys[lmDest]];
    const key = `${srcName} -> ${destName}`
    return key;
});

// Mapping of comparison vector names to their index in the comparison vectors array.
export const QijiaMethodComparisionVectorNamesToIndexMap = new Map(QijiaMethodComparisionVectorNames.map((name, i) => [name, i]))

/**
 * Map that associates comparison vector indices to terminal feedback body parts.
 * Used for highlighting body parts in feedback.
 */
export const ComparisonVectorToTerminalFeedbackBodyPartMap = new Map<TerminalFeedbackBodyPartIndex, TerminalFeedbackBodyPart>([
    [0, "torso"], // leftShoulder -> rightShoulder
    [1, "torso"], // leftShoulder -> leftHip
    [2, "torso"], // leftHip -> rightHip
    [3, "torso"], // rightHip -> rightShoulder
    [4, "leftarm"], // leftShoulder -> leftElbow
    [5, "leftarm"], // leftElbow -> leftWrist
    [6, "rightarm"], // rightShoulder -> rightElbow
    [7, "rightarm"], // rightElbow -> rightWrist
]);

/**
 * A set of angles between adjacent body parts that are used for similarity calculations. Each angle
 * can be calculated as the inner angle between two vectors. The vectors are defined by pairs of
 * pose landmarks.
 * 
 * Different body joints may be capable of different ranges of motion, so the range of motion of 
 * joint is included in the comparison info, to allow for normalization of the angle values if needed.
 */
export const BodyInnerAnglesComparisons = {
   'left-shoulder-pitch': {
        vec1: [PoseLandmarkIds.leftShoulder, PoseLandmarkIds.leftElbow], 
        vec2: [PoseLandmarkIds.leftShoulder, PoseLandmarkIds.leftHip],
        // we can roughly pitch the shoulder from 90 degrees (beside hip) 
        // to -90 degrees (straight up), for a total range of 180 degrees
        rangeOfMotion: Math.PI 
   },
   'left-shoudler-yaw': {
        vec1: [PoseLandmarkIds.leftShoulder, PoseLandmarkIds.leftElbow],
        vec2: [PoseLandmarkIds.leftShoulder, PoseLandmarkIds.rightShoulder],
        // we can roughtly pivot the shoulder from +90 degrees (pointing forward)
        // to -90 degrees (pointing backward), for a total range of 180 degrees
        rangeOfMotion: Math.PI
   },
   'left-elbow-bend': {
        vec1: [PoseLandmarkIds.leftElbow, PoseLandmarkIds.leftShoulder],
        vec2: [PoseLandmarkIds.leftElbow, PoseLandmarkIds.leftWrist],
        // we can roughly bend the elbow from 0 degrees (straight) to 180 degrees (fully bent)
        // for a total range of 180 degrees
        rangeOfMotion: Math.PI
   },
   'neck-shoulderline-angle': {
        vec1: [PoseLandmarkIds.leftShoulder, PoseLandmarkIds.rightShoulder],
        vec2: [PoseLandmarkIds.leftShoulder, PoseLandmarkIds.nose],
        // we can roughtly bend the neck from -90 degrees (on right shoulder) 
        // to 90 deg (on left shoulder)
        rangeOfMotion: Math.PI
   },
   'right-shoulder-pitch': {
        vec1: [PoseLandmarkIds.rightShoulder, PoseLandmarkIds.rightElbow],
        vec2: [PoseLandmarkIds.rightShoulder, PoseLandmarkIds.rightHip],
        rangeOfMotion: Math.PI,
   },
    'right-shoulder-yaw': {
        vec1: [PoseLandmarkIds.rightShoulder, PoseLandmarkIds.rightElbow],
        vec2: [PoseLandmarkIds.rightShoulder, PoseLandmarkIds.leftShoulder],
        rangeOfMotion: Math.PI,
    },
    'right-elbow-bend': {
        vec1: [PoseLandmarkIds.rightElbow, PoseLandmarkIds.rightShoulder],
        vec2: [PoseLandmarkIds.rightElbow, PoseLandmarkIds.rightWrist],
        rangeOfMotion: Math.PI
    },
} as const;

/**
 * Calculate the inner angle between two 3D vectors, in radians. 
 * 
 * The inner angle is the smallest possible angle between the two vectors, measured from the first 
 * vector to the second, in the range [0, pi]. This angle is on the plane defined by the two vectors.
 * 
 * @param vec1 The first vector as an array [x, y, z]
 * @param vec2 The second vector as an array [x, y, z]
 * @returns The inner angle between the two vectors in radians
 */
export function getInnerAngleBetweenVectors(vec1: Readonly<[number, number, number]>, vec2: Readonly<[number, number, number]>) {
    const [x1, y1, z1] = vec1;
    const [x2, y2, z2] = vec2;
    const dotProduct = x1 * x2 + y1 * y2 + z1 * z2;
    const mag1 = Math.pow(x1 * x1 + y1 * y1 + z1 * z1, 0.5);
    const mag2 = Math.pow(x2 * x2 + y2 * y2 + z2 * z2, 0.5);
    const cosTheta = dotProduct / (mag1 * mag2);
    return Math.acos(cosTheta);    
}

/**
 * Calcualte the inner angle between two 3D vectors, in radians, from a given pose frame.
 * @param frame Pose estimation result frame
 * @param srcVectorIds IDs of the source vector landmarks
 * @param destVectorIDs IDs of the destination vector landmarks
 * @returns The inner angle between the two vectors in radians
 */
export function getInnerAngleFromFrame(frame: Readonly<Pose3DLandmarkFrame>, srcVectorIds: Readonly<PoseVectorIdPair>, destVectorIDs: Readonly<PoseVectorIdPair>) {
    const vec1 = Get3DNormalizedVector(frame, srcVectorIds[0], srcVectorIds[1]);
    const vec2 = Get3DNormalizedVector(frame, destVectorIDs[0], destVectorIDs[1]);
    return getInnerAngleBetweenVectors(vec1, vec2);
}

/**
 * Calculate the magnitude of a 2D vector.
 * @param v - 2D vector as an array [x, y]
 * @returns Magnitude of the vector
 */
export function getMagnitude2DVec(v: Readonly<[number, number]>) {
    return Math.pow(Math.pow(v[0], 2) + Math.pow(v[1], 2), 0.5)
}


/**
 * Calculate the magnitude of a 3D vector.
 * @param v - 3D vector as an array [x, y, z]
 * @returns Magnitude of the vector
 */
export function getMagnitude3DVec(v: Readonly<[number, number, number]>) {
    return Math.pow(Math.pow(v[0], 2) + Math.pow(v[1], 2) + Math.pow(v[2], 2), 0.5)
}

/**
 * Calculate the inner angle between two 2D vectors.
 * @param v1 - First vector as an array [x, y]
 * @param v2 - Second vector as an array [x, y]
 * @returns Inner angle between the two vectors in radians
 */
export function getInnerAngle(v1: Readonly<[number, number]>, v2: Readonly<[number, number]>) {
    return Math.acos((v1[0] * v2[0] + v1[1] * v2[1]) / (getMagnitude2DVec(v1) * getMagnitude2DVec(v2)))
}

/**
 * Add two 2D vectors element-wise.
 * @param v1 - First vector as an array [x, y]
 * @param v2 - Second vector as an array [x, y]
 * @returns Resulting vector as an array [x, y]
 */
export function addVectors(v1: Readonly<[number, number]>, v2: Readonly<[number, number]>) {
    return [v1[0] + v2[0], v1[1] + v2[1]]
}

/**
 * Calculate the sum of elements in an array of numbers.
 * @param v - Array of numbers
 * @returns Sum of the array elements
 */
export function getArraySum(v: Readonly<Array<number>>) {
    return v.reduce((a, b) => a + b, 0)
}

/**
 * Calculate the mean (average) of elements in an array of numbers.
 * @param v - Array of numbers
 * @returns Mean of the array elements
 */
export function GetArithmeticMean(v: Readonly<Array<number>>) {
    return getArraySum(v) / v.length
}

/**
 * Calculates the standard deviation of an array of numbers.
 * @param {Array<number>} v - The array of numbers
 * @returns {number} - The standard deviation
 */
 export function getArraySD(v: Array<number>) {
    if (v.length === 0) {
      return 0; // Handle empty array case
    }
  
    const mean = v.reduce((sum, value) => sum + value, 0) / v.length;
    const squaredDifferences = v.map(value => Math.pow(value - mean, 2));
    const variance = squaredDifferences.reduce((sum, squaredDiff) => sum + squaredDiff, 0) / v.length;
    const standardDeviation = Math.sqrt(variance);
  
    return standardDeviation;
  }

/**
 * Calculate the Mean Absolute Error (MAE) between two matrices.
 *
 * @param v1 - The first matrix.
 * @param v2 - The second matrix.
 * @returns {number | undefined} The MAE between the two matrices.
 */
export function getMatricesMAE(v1: readonly (number | undefined)[][], v2: readonly (number | undefined)[][]): number | undefined {

    if (v1.length !== v2.length) {
        throw new Error("Matrices must have the same dimension (but they have different m)");
    }

    const m = v1.length;
    
    let mae = 0;

    let undefined_m_count = 0;

    for (let i = 0; i < m; i++) {

        if (v1[i].length !== v2[i].length) {
            throw new Error("Matrices must have the same dimension (but they have different n)");
        }

        const n = v1[i].length;
        let undefined_n_count = 0;
        let row_mae = 0;

        for (let j = 0; j < n; j++) {
            const val1 = v1[i][j];
            const val2 = v2[i][j];

            if (val1 === undefined || val2 === undefined) {
                undefined_n_count += 1;
                continue;   
            }

            row_mae += Math.abs(val1 - val2);
        }

        if (undefined_n_count === n) {
            undefined_m_count += 1;
            continue;
        }
        row_mae = row_mae / (n - undefined_n_count);
        mae += row_mae; 
    }

    if (undefined_m_count === m) {
        return undefined;
    }
    return mae / (m - undefined_m_count);
}

/**
 * Calculate the Root Mean Square Error (RMSE) between two matrices.
 *
 * @param v1 - The first matrix.
 * @param v2 - The second matrix.
 * @returns {number} The RMSE between the two matrices.
 */
export function getMatricesRMSE(v1: readonly (number | undefined)[][], v2: readonly (number | undefined)[][]): number | undefined {
    if (v1.length !== v2.length || v1[0].length !== v2[0].length) {
        throw new Error("Matrices must have the same dimension (but they have different m)");
    }

    const m = v1.length;
    let rmse = 0;
    let denominator = 0;

    const errors = []

    for(let i = 0; i < m; i++) {
        if (v1[i].length !== v2[i].length) {
            throw new Error("Matrices must have the same dimension (but they have different n)");
        }
        const n = v1[i].length;

        for(let j = 0; j < n; j++) {
            const val1 = v1[i][j];
            const val2 = v2[i][j];

            if (val1 === undefined || val2 === undefined) {
                continue;
            }

            const squaredError = Math.pow(val1 - val2, 2);
            rmse += squaredError
            errors.push(squaredError)
            denominator += 1;
        }
    }

    if (denominator === 0) {
        return undefined;
    }

    rmse /= denominator;
    rmse = Math.pow(rmse, 0.5);

    return rmse;
}
  
  

/**
 * Calculate a 2D vector between two pose landmarks.
 * @param pixelLandmarks - 2D pixel coordinates of pose landmarks
 * @param srcLandmark - Index of the source landmark
 * @param destLandmark - Index of the destination landmark
 * @returns 2D vector as an array [x, y]
 */
export function Get2DVector(    
    pixelLandmarks: Readonly<Pose2DPixelLandmarks>,
    srcLandmark: number,
    destLandmark: number
) {
    const {x: sx, y: sy } = pixelLandmarks[srcLandmark]
    const {x: dx, y: dy } = pixelLandmarks[destLandmark]
    return [dx - sx, dy - sy] as [number, number]
}

/**
 * Calculate a normalized 2D vector between two pose landmarks. Note: this is distinct from the
 * normalization that mediapipe does (which isn't useful since it skews that aspect ratio. In this
 * case, normalization simply means scaling the vector to have a magnitude of 1.
 * @param pixelLandmarks - 2D pixel coordinates of pose landmarks
 * @param srcLandmark - Index of the source landmark
 * @param destLandmark - Index of the destination landmark
 * @returns Normalized 2D vector as an array [x, y]
 */
export function GetNormalized2DVector(
    pixelLandmarks: Readonly<Pose2DPixelLandmarks>,
    srcLandmark: number,
    destLandmark: number, 
){
    // TODO: utilize a vector arithmetic library?
    const [vec_x, vec_y] = Get2DVector(pixelLandmarks, srcLandmark, destLandmark)
    return GetPNormalizedVector([vec_x, vec_y], 2)
}

/**
 * Calculates the 3D vector between two pose landmarks.
 * @param landmarks - 3D coordinates of pose landmarks
 * @param srcLandmark - Index of the source landmark
 * @param destLandmark - Index of the destination landmark
 * @returns Vector pointing from source to destination as an array [x, y, z]
 */
export function Get3DVector(
    landmarks: Readonly<Pose3DLandmarkFrame>,
    srcLandmark: number,
    destLandmark: number
) {
    const {x: sx, y: sy, z: sz } = landmarks[srcLandmark]
    const {x: dx, y: dy, z: dz } = landmarks[destLandmark]
    return [dx - sx, dy - sy, dz - sz] as [number, number, number]
}

export function Get3DNormalizedVector(
    landmarks: Readonly<Pose3DLandmarkFrame>,
    srcLandmark: number,
    destLandmark: number
) {
    const [vec_x, vec_y, vec_z] = Get3DVector(landmarks, srcLandmark, destLandmark)
    return GetPNormalizedVector([vec_x, vec_y, vec_z], 2) as [number, number, number]
}

/**
 * Creates a track history object for user and reference clip data.
 */
export function createTrackHistoryForClips(userPoseData: StudySegmentData, referenceClip: TiktokDanceClipData) {
    const fps = 30;
    const shortestClipLength = Math.min(userPoseData.poses.length, referenceClip.poses.length);
    return {
        videoFrameTimesInSecs: referenceClip.poses.map((_, i) => i / fps).slice(0, shortestClipLength),
        actualTimesInMs: referenceClip.poses.map((_, i) => i / (userPoseData.segmentInfo.performanceSpeed * fps)).slice(0, shortestClipLength),
        ref3DFrameHistory: referenceClip.poses.map((pose) => pose.worldPose).slice(0, shortestClipLength),
        ref2DFrameHistory: referenceClip.poses.map((pose) => pose.pixelPose).slice(0, shortestClipLength),
        user3DFrameHistory: userPoseData.poses.map((pose) => pose.worldPose).slice(0, shortestClipLength),
        user2DFrameHistory: referenceClip.poses.map((pose) => pose.pixelPose).slice(0, shortestClipLength),
    };
}

/**
 * Retrieves the reference clip for a given segment.
 */
export function getReferenceClip(segmentInfo: SegmentInfo, tiktokClipPoses: Map<string, TiktokDanceClipData[]>) {
    const refClipNumber = segmentInfo.clipNumber;
    const clipIndex = refClipNumber - 1; // Adjust for zero-based index of arrays
    return tiktokClipPoses.get(segmentInfo.danceName)?.[clipIndex];
}


export async function* takeAsnc<T>(
    iterable: AsyncIterable<T>,
    n: number
): AsyncGenerator<T, void, unknown> {
    let count = 0;
    for await (const item of iterable) {
        if (count++ >= n) break;
        yield item;
    }
}

export async function fromAsync<T>(asyncIterable: AsyncIterable<T>, printFn?: (item: T, i: number) => void): Promise<T[]> {
    const result: T[] = [];
    let i = 0;
    for await (const item of asyncIterable) {
        result.push(item);
        printFn?.(item, i);
        i++;
    }
    return result;
};

