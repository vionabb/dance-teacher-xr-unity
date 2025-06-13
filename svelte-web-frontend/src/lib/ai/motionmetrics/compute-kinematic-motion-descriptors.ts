import type { Pose2DPixelLandmarks, Pose3DLandmarkFrame } from "$lib/webcam/mediapipe-utils";
import type { Landmark } from "@mediapipe/tasks-vision";
import { Get2DScaleIndicator, Get3DScaleIndicator, GetVectorError, ComputeMAE, ComputeRMSE, getPoseType } from "../EvaluationCommonUtils";

export type VecWithVisibility = {
    vals: number[],
    visibility: number,
}
export type ScalarWithVisibility = {
    value: number,
    visibility: number,
}
export type Vec3<T> = [T, T, T];
export type Vec8<T> = [T, T, T, T, T, T, T, T];

export type UserRefPair<T> = {
    user: T,
    ref: T,
};

export function getFrameError(vecs: UserRefPair<VecWithVisibility[]>): ScalarWithVisibility[] {
    const { user, ref } = vecs;
    if (user.length !== ref.length) {
        throw new Error("Mismatched array lengths between user and reference vectors.");
    }
    return user.map((landmark, j) => {
        const refLandmark = ref[j];
        const error = GetVectorError(landmark.vals, refLandmark.vals);
        const visibility = 0.5 * ((landmark.visibility ?? 1.0) + (refLandmark.visibility ?? 1.0));
        return {
            value: error,
            visibility 
        } as ScalarWithVisibility;
    });
}

export function calculateJointVels<T extends Pose2DPixelLandmarks | Pose3DLandmarkFrame>(pose: T, pPose: T, dt: number, scale: number, opts?: {
    visibilityBehavior?: 'avg' | 'min',
}) {
    const is2D = getPoseType(pose) === '2D';
    return pose.map((landmark, j) => {
        const prevLandmark = pPose[j];
        const denominator = dt * scale;
        const x = (landmark.x - prevLandmark.x) / denominator;
        const y = (landmark.y - prevLandmark.y) / denominator;
        let velocity: number[];
        const prevVisibility = prevLandmark.visibility ?? 1.0;
        const curVisibility = landmark.visibility ?? 1.0;
        const visibilityBehavior = opts?.visibilityBehavior ?? 'avg';
        const visibility = visibilityBehavior === 'avg' ?
            0.5 * (prevVisibility + curVisibility) :
            Math.min(prevVisibility, curVisibility);

        if (is2D) {
            velocity = [x, y];
        } else {
            // 3D case
            const lm = landmark as Landmark;
            const prevLm = prevLandmark as Landmark;
            const z = (lm.z - prevLm.z) / denominator;
            velocity = [x, y, z];
        }
        return {
            vals: velocity,
            visibility,
        } as VecWithVisibility;
    });
}

/**
 * Calculates the instantenous derivitive of a kinematic metric along an array of joints.
 * Given velocities, this function calculates the instantaneous acceleration.
 * Given accelerations, this function calculates the instantaneous jerk.
 * @param cur The array of joint metrics at the current frame
 * @param prev The array of joint metrics at the previous frame
 * @param dt The time delta between the two frames
 * @returns The array of joint metrics representing the instantaneous derivitive.
 */
export function calculateJointDerivs(cur: VecWithVisibility[], prev: VecWithVisibility[], dt: number, opts?: {
    visibilityBehavior?: 'avg' | 'min',
}) {
    if (cur.length !== prev.length) throw new Error("Mismatched array lengths between current and previous joint metrics.");

    return cur.map((curVec, j) => {
        const prevVec = prev[j];
        if (curVec.vals.length !== prevVec.vals.length) {
            throw new Error(`Mismatched array lengths between current and previous joint metrics.`);
        }
        const behavior = opts?.visibilityBehavior ?? 'avg';
        const visibility = behavior === 'avg' ?
            0.5 * ((curVec.visibility ?? 1.0) + (prevVec.visibility ?? 1.0)) :
            Math.min(curVec.visibility ?? 1.0, prevVec.visibility ?? 1.0);

        return {
            vals: curVec.vals.map((val, i) => {
                const prevVal = prevVec.vals[i];
                return (val - prevVal) / dt;
            }),
            visibility,
        } as VecWithVisibility;
    });
}

export type KinematicValues = ReturnType<typeof calculateKinematicValues>;

export type KinematicComputationOptions<T extends Pose2DPixelLandmarks | Pose3DLandmarkFrame> = {
    scaleBehavior2D?: 'none' | 'scaleByFrame',
    scaleBehavior3D?: 'none' | 'scaleByFrame',
    scaleIndicator?: ((pose: T) => number) | UserRefPair<number> | null,
    visibilityBehavior?: 'avg' | 'min',
}

/**
 * Calculates the kinematic values (velocities, accelerations, jerks) for a given set of user and reference poses. 
 * The function tracks the visibility of each pose and its landmarks, retaining this information in the output 
 * so that it can be user for later weighing purposes. 
 * 
 * @template T - The type of the poses (either Pose2DPixelLandmarks or Pose3DLandmarkFrame).
 * @param matchingUserPoses - The user poses to match against the reference poses.
 * @param referencePoses - The reference poses to match against the user poses.
 * @param frameTimes - The frame times for the poses.
 * @param usrScale - The scale factor for the user poses (optional).
 * @param refScale - The scale factor for the reference poses (optional).
 * @returns An object containing the kinematic values (velocities, accelerations, jerks) for each frame.
 * 
 * @throws Error if the input data is invalid or if the lengths of the arrays do not match.
 */
export function calculateKinematicValues<T extends Pose2DPixelLandmarks | Pose3DLandmarkFrame>(
    matchingUserPoses: T[],
    referencePoses: T[],
    frameTimes: number[],
    opts?: KinematicComputationOptions<T>
) {
    const { scaleBehavior2D = 'none', scaleBehavior3D = 'none', visibilityBehavior = 'avg' } = opts || {};
    
    if (!matchingUserPoses || !referencePoses || !frameTimes) {
        throw new Error("Invalid input data. Either matchingUserPoses or referencePoses is null.");
    }

    if (matchingUserPoses.length !== referencePoses.length || matchingUserPoses.length !== frameTimes.length) {
        throw new Error("Mismatched array lengths between matchingUserPoses and referencePoses.");
    }


    const makeEmptyVector = (num_landmarks: number, dimension: number) => {
        return new Array(num_landmarks).fill(0).map(() => ({
            vals: new Array(dimension).fill(0),
            visibility: 0,
        } as VecWithVisibility));
    }
    const makeEmptyScalar = (num_landmarks: number) => {
        return new Array(num_landmarks).fill(0).map(() => ({
            value: 0,
            visibility: 0,
        } as ScalarWithVisibility));
    }
    const makeEmptyUserRefPair = (num_landmarks: number, dimension: number) => {
        return {
            user: makeEmptyVector(num_landmarks, dimension),
            ref: makeEmptyVector(num_landmarks, dimension),
        } as UserRefPair<VecWithVisibility[]>;
    }

    function* processFrames() {
        let pPoses: UserRefPair<T> | undefined = undefined;
        let pVelocities: UserRefPair<VecWithVisibility[]> | undefined = undefined;
        let pAccelerations: UserRefPair<VecWithVisibility[]> | undefined = undefined;
        let pFrameTimes: number[] = [];

        for (let i = 0; i < matchingUserPoses.length; i++) {
            const curPoses: UserRefPair<T> = {
                user: matchingUserPoses[i],
                ref: referencePoses[i],
            };
            let curVelocities: UserRefPair<VecWithVisibility[]> | undefined = undefined;
            let curVelocitiesError: ScalarWithVisibility[] | undefined = undefined;
            let curAccelerations: UserRefPair<VecWithVisibility[]> | undefined = undefined;
            let curAccelerationsError: ScalarWithVisibility[] | undefined = undefined;
            let curJerks: UserRefPair<VecWithVisibility[]> | undefined = undefined;
            let curJerksError: ScalarWithVisibility[] | undefined = undefined;
            
            const frameTime = frameTimes[i];
            const dt = frameTime - (pFrameTimes[i - 1] ?? 0);
            const is2D = getPoseType(curPoses.user) === '2D';
            const dimension = is2D ? 2 : 3;
            const landmarkCount = curPoses.user.length;

            if (curPoses.user.length !== curPoses.ref.length) {
                throw new Error("Mismatched array lengths between user and reference poses.");
            }

            if (curPoses.user[0].x === undefined || curPoses.user[0].x == null || curPoses.ref[0].x === undefined || curPoses.ref[0].x == null) {
                // the current frame is invalid, so we skip it
                continue;
            }

            // Normalize the velocities based on the scale factor
            // QUESTION: Should we update this scale factor every frame or keep it constant?
            const scaleBehavior = is2D ? scaleBehavior2D : scaleBehavior3D;
            const defaultScaleIndicatorFn = scaleBehavior == 'none' ? 
                () => 1.0: // no scaling
                (is2D ? Get2DScaleIndicator : Get3DScaleIndicator);
                

            const usrFrameScale = opts?.scaleIndicator ?
                (typeof opts.scaleIndicator === 'function' ? opts.scaleIndicator(curPoses.user) : (opts.scaleIndicator?.user ?? 1.0)) :
                defaultScaleIndicatorFn(curPoses.user as any);

            const refFrameScale = opts?.scaleIndicator ?
                (typeof opts.scaleIndicator === 'function' ? opts.scaleIndicator(curPoses.ref) : (opts.scaleIndicator?.ref ?? 1.0)) :
                defaultScaleIndicatorFn(curPoses.ref as any);

            if (dt > 0) {
                if (pPoses) {
                    const pUserPose = pPoses.user;
                    const pRefPose = pPoses.ref;
                    const usrVelocities = calculateJointVels(curPoses.user, pUserPose, dt, usrFrameScale, { visibilityBehavior });
                    const refVelocities = calculateJointVels(curPoses.ref, pRefPose, dt, refFrameScale, { visibilityBehavior });
                    curVelocities = { user: usrVelocities, ref: refVelocities };
                    curVelocitiesError = getFrameError(curVelocities)
                }

                if (pVelocities && curVelocities) {
                    const usrAccelerations = calculateJointDerivs(pVelocities.user, curVelocities.user, dt, { visibilityBehavior });
                    const refAccelerations = calculateJointDerivs(pVelocities.ref, curVelocities.ref, dt, { visibilityBehavior });
                    curAccelerations = { user: usrAccelerations, ref: refAccelerations };
                    curAccelerationsError = getFrameError(curAccelerations);
                }

                if (pAccelerations && curAccelerations) {
                    const usrJerks = calculateJointDerivs(pAccelerations.user, curAccelerations.user, dt, { visibilityBehavior });
                    const refJerks = calculateJointDerivs(pAccelerations.ref, curAccelerations.ref, dt, { visibilityBehavior });

                    curJerks = { user: usrJerks, ref: refJerks };
                    curJerksError = getFrameError(curJerks);
                }
            }

            pPoses = curPoses;
            pVelocities = curVelocities;
            pAccelerations = curAccelerations;
            pFrameTimes.push(frameTime);

            yield { 
                frameTime,
                poses: curPoses,
                // instantaneous velocity for each landmark in the frame (user)
                vels:  curVelocities ?? makeEmptyUserRefPair(landmarkCount, dimension),
                velError: curVelocitiesError ?? makeEmptyScalar(landmarkCount),

                // instantaneous acceleration for each landmark in the frame
                accels: curAccelerations ?? makeEmptyUserRefPair(landmarkCount, dimension),
                accelError: curAccelerationsError ?? makeEmptyScalar(landmarkCount),

                jerks: curJerks ?? makeEmptyUserRefPair(landmarkCount, dimension),
                jerkError: curJerksError ?? makeEmptyScalar(landmarkCount),
            };
        }
    }

    const results = [...processFrames()];

    // Reformat each value into an array of values
     return {
        poses: results.map((result) => result.poses),
        vels: results.map((result) => result.vels),
        velErrors: results.map((result) => result.velError),
        accels: results.map((result) => result.accels),
        accelErrors: results.map((result) => result.accelError),
        jerks: results.map((result) => result.jerks),
        jerkErrors: results.map((result) => result.jerkError),
    };
}

export type KinematicErrorDescriptorsOptions = {
    visibilityBehavior?: 'none' | 'scale', 
    landmarkWeights?: readonly number[]
}

export function calculateKinematicErrorDescriptors(
    kinematicValues: KinematicValues,
    options?: KinematicErrorDescriptorsOptions
) {
    const { poses, vels, velErrors, accels, accelErrors, jerks, jerkErrors } = kinematicValues;
    
    const { visibilityBehavior = 'none', landmarkWeights: optLandmarkWeights = undefined } = options || {};

    const numLandmarks = poses[0].user.length;

    if (optLandmarkWeights && optLandmarkWeights.length !== numLandmarks) {
        throw new Error(`landmarkWeights must be of length ${numLandmarks} (i.e. the number of landmarks)`);
    }

    // Default to even weighing
    const landmarkWeights = optLandmarkWeights ?? new Array(numLandmarks).fill(1);
    const landmarkWeightsTotal = landmarkWeights.reduce((a, b) => a + b, 0);

    const weighErrorValues = (allFrames: ScalarWithVisibility[][]) => {
        let weightedVals: number[][];
        let avgVisibility: number = 0;

        if (visibilityBehavior === 'none') {
            weightedVals = allFrames.map((frameVals) => {
                let frameVisibility = 0;
                const vals = frameVals.map((v, landmark_i) => {
                    frameVisibility += v.visibility;
                    return v.value
                })
                avgVisibility += frameVisibility / numLandmarks;
                return vals;
            });
            avgVisibility /= allFrames.length;
        }
        else if (visibilityBehavior === 'scale') {
            let visibilityTotals = new Array(numLandmarks).fill(0);
            weightedVals = allFrames
                .map((frameVals) => frameVals.map((v, landmark_i) => {
                    // Scale by visibility and accumulate the total    
                    visibilityTotals[landmark_i] += v.visibility;
                    return v.value * v.visibility;
                })).map((frameValsWeighted) => frameValsWeighted.map((v, landmark_i) => {

                    // Divide by the total visibility to rescale the values
                    return v / visibilityTotals[landmark_i];
                }));
            avgVisibility = visibilityTotals.reduce((a, b) => a + b, 0) / (numLandmarks * allFrames.length);
        } else {
            throw new Error(`Invalid visibilityBehavior: ${visibilityBehavior}`);
        }

        return {
            weightedValues: weightedVals.map((frameVals) => {
                // weigh each row by landmark weights
                return frameVals
                    .reduce((acc, lmVal, lmIndex) => acc + lmVal * landmarkWeights[lmIndex], 0) 
                    / landmarkWeightsTotal;
            }),

            // TODO
            visibility: avgVisibility,
        };
    }
    
    const { weightedValues: velErrorsWeighted } = weighErrorValues(velErrors);
    const { weightedValues: accelErrorsWeighted } = weighErrorValues(accelErrors);
    const { weightedValues: jerkErrorsWeighted } = weighErrorValues(jerkErrors);

    return {
        velMAE: ComputeMAE(velErrorsWeighted),
        velRMSE: ComputeRMSE(velErrorsWeighted),
        accelMAE: ComputeMAE(accelErrorsWeighted),
        accelRMSE: ComputeRMSE(accelErrorsWeighted),
        jerkMAE: ComputeMAE(jerkErrorsWeighted),
        jerkRMSE: ComputeRMSE(jerkErrorsWeighted),
    }
}