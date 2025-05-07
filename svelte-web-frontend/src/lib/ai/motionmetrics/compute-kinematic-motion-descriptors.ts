import type { Pose2DPixelLandmarks, Pose3DLandmarkFrame } from "$lib/webcam/mediapipe-utils";
import type { Landmark } from "@mediapipe/tasks-vision";
import { Get2DScaleIndicator, getMatricesMAE, getMatricesRMSE, GetVectorNorm, Get3DScaleIndicator, GetVectorError } from "../EvaluationCommonUtils";

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

function is2DPose(
    pose: Pose2DPixelLandmarks | Pose3DLandmarkFrame
): pose is Pose2DPixelLandmarks {
    return (pose as any)?.[0]?.dist_from_camera === undefined;
}

function getVectorError(vecs: UserRefPair<VecWithVisibility[]>): ScalarWithVisibility[] {
    const { user, ref } = vecs;
    if (user.length !== ref.length) {
        throw new Error("Mismatched array lengths between user and reference vectors.");
    }
    return user.map((landmark, j) => {
        const refLandmark = ref[j];
        return {
            value: GetVectorError(landmark.vals, refLandmark.vals),
            visibility: (landmark.visibility + refLandmark.visibility) / 2,
        } as ScalarWithVisibility;
    });
}

function calculateJointVels<T extends Pose2DPixelLandmarks | Pose3DLandmarkFrame>(pose: T, pPose: T, dt: number, scale: number) {
    const is2D = is2DPose(pose);
    return pose.map((landmark, j) => {
        const prevLandmark = pPose[j];
        const x = (landmark.x - prevLandmark.x) / (dt * scale);
        const y = (landmark.y - prevLandmark.y) / (dt * scale);
        let velocity: number[];
        if (is2D) {
            velocity = [x, y];
        } else {
            // 3D case
            const lm = landmark as Landmark;
            const z = (lm.z - lm.z) / (dt * scale);
            velocity = [x, y, z];
        }
        return {
            vals: velocity,
            visibility: landmark.visibility,
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
function calculateJointDerivs(cur: VecWithVisibility[], prev: VecWithVisibility[], dt: number) {
    if (cur.length !== prev.length) throw new Error("Mismatched array lengths between current and previous joint metrics.");

    return cur.map((curVec, j) => {
        const prevVec = prev[j];
        if (curVec.vals.length !== prevVec.vals.length) {
            throw new Error(`Mismatched array lengths between current and previous joint metrics.`);
        }

        return {
            vals: curVec.vals.map((val, i) => {
                const prevVal = prevVec.vals[i];
                return (val - prevVal) / dt;
            }),
            visibility: (curVec.visibility + prevVec.visibility) / 2,
        } as VecWithVisibility;
    });
}

export type KinematicValues = ReturnType<typeof calculateKinematicValues>;

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
    usrScale?: number,
    refScale?: number
) {
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
        let pJerks: UserRefPair<VecWithVisibility[]> | undefined = undefined;
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
            const is2D = is2DPose(curPoses.user);
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
            
            const usrFrameScale = usrScale ?? 
                (is2D ? 
                    Get2DScaleIndicator(curPoses.user as Pose2DPixelLandmarks) :
                    Get3DScaleIndicator(curPoses.user as Pose3DLandmarkFrame));
            const refFrameScale = refScale ?? 
                (is2D ? 
                    Get2DScaleIndicator(curPoses.ref as Pose2DPixelLandmarks) :
                    Get3DScaleIndicator(curPoses.ref as Pose3DLandmarkFrame));


            if (pPoses) {
                const pUserPose = pPoses.user;
                const pRefPose = pPoses.ref;
                const usrVelocities = calculateJointVels(curPoses.user, pUserPose, dt, usrFrameScale);
                const refVelocities = calculateJointVels(curPoses.ref, pRefPose, dt, refFrameScale);

                curVelocities = { user: usrVelocities, ref: refVelocities };
            }

            if (pVelocities && curVelocities) {
                const usrAccelerations = calculateJointDerivs(pVelocities.user, curVelocities.user, dt);
                const refAccelerations = calculateJointDerivs(pVelocities.ref, curVelocities.ref, dt);

                // todo: weigh errors by visibility?
                // todo: weigh errors by joint importance? 
                curVelocitiesError = getVectorError(curVelocities)
                curAccelerations = { user: usrAccelerations, ref: refAccelerations };
            }

            if (pAccelerations && curAccelerations) {
                const usrJerks = calculateJointDerivs(pAccelerations.user, curAccelerations.user, dt);
                const refJerks = calculateJointDerivs(pAccelerations.ref, curAccelerations.ref, dt);

                curJerks = { user: usrJerks, ref: refJerks };
                curAccelerationsError = getVectorError(curAccelerations);
            }

            if (pJerks && curJerks) {
                curJerksError = getVectorError(curJerks);
            }

            pPoses = curPoses;
            pVelocities = curVelocities;
            pAccelerations = curAccelerations;
            pJerks = curJerks;
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


export function calculateKinematicErrorDescriptors(kinematicValues: KinematicValues, landmarkWeights?: number[]) {
    const { poses, vels, velErrors, accels, accelErrors, jerks, jerkErrors } = kinematicValues;
    
    const numFrames = poses.length;
    const numLandmarks = poses[0].user.length;
    const numLandmarkDimensions = is2DPose(poses[0].user) ? 2 : 3;

    const velMAE = new Array(numLandmarks).fill(0).map((_a, lm_i) => {
        // Open question; how to handle visibility?
        //   * how to do we rescale so that less-visible frames are less important, 
        //     without affecting the scale of the metric?
    });

    return {
        velMAE: velMAE
    }

}