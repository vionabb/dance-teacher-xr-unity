import type { Pose2DPixelLandmarks, Pose3DLandmarkFrame } from "$lib/webcam/mediapipe-utils";
import { Get2DScaleIndicator, getMatricesMAE, getMatricesRMSE, getMagnitude2DVec } from "../EvaluationCommonUtils";


export type Vec2<T> = [T, T];
export type Vec2DVis = {
    x: number,
    y: number,
    visibility: number,
}
export type Vec3<T> = [T, T, T];
export type Vec8<T> = [T, T, T, T, T, T, T, T];

export type UserRefPair<T> = {
    user: T,
    ref: T,
};

function makeUndefinedVec8Frame2D() {
    return makeUndefined2DMatrix(8, 2) as Vec8<Vec2<undefined>>;
}

function makeUndefinedVec8Frame3D() {
    return makeUndefined2DMatrix(8, 3) as Vec8<Vec3<undefined>>;
}

function makeUndefinedArray(length: number): undefined[] {
    return new Array(length).fill(undefined);
}
function makeUndefinedMatrix(dims: number[]): any {

    if (dims.length === 1) {
        return makeUndefinedArray(dims[0])
    }

    const matrix = [];
    for (let i = 0; i < dims[0]; i++) {
        matrix.push(makeUndefinedMatrix(dims.slice(1)));
    }
    return matrix;
}
function makeUndefined2DMatrix(m: number, n: number) {
    return makeUndefinedMatrix([m, n]) as undefined[][]
}

function replaceNaNsWithUndefined(num: number) {
    return isNaN(num) ? undefined : num;
}

function calculateJointVels(pose: Pose2DPixelLandmarks, pPose: Pose2DPixelLandmarks, dt: number, scale: number) {
    return pose.map((landmark, j) => {
        const prevLandmark = pPose[j];
        return {
            x: (landmark.x - prevLandmark.x) / (dt * scale),
            y: (landmark.y - prevLandmark.y) / (dt * scale),
            visibility: landmark.visibility,
        } as Vec2DVis;
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
function calculateJointDerivs(cur: Vec2DVis[], prev: Vec2DVis[], dt: number) {
    if (cur.length !== prev.length) throw new Error("Mismatched array lengths between current and previous joint metrics.");

    return cur.map((landmark, j) => {
        const prevLandmark = prev[j];
        return {
            x: (landmark.x - prevLandmark.x) / dt,
            y: (landmark.y - prevLandmark.y) / dt,
            visibility: (landmark.visibility + prevLandmark.visibility) / 2,
        } as Vec2DVis;
    });
}

/**
 * Calculates the MAE and RMSE for velocity, acceleration, and jerk between matchingUserPoses and referencePoses.
 *
 * @param {Pose2DPixelLandmarks[]} matchingUserPoses - Array of adjusted user poses.
 * @param {Pose2DPixelLandmarks[]} referencePoses - Array of reference poses.
 * @param {number[]} frameTimes - Array of unique frame times corresponding to the poses.
 * @returns {[number, number, number, number, number, number]} MSE and RMSE between user and reference motion descriptors.
 * Both MAE and RMSE measure the how different the user's poses are from the refence poses.
 * Mean Absolute Error (MAE):
 *  Intuitive Interpretation: MAE is straightforward to understand. It measures the average absolute difference between the values in two arrays.
 *  Robustness to Outliers: MAE is less sensitive to extreme outliers compared to RMSE because it doesn't square the differences.
 *  Easy to Compute: It involves simple arithmetic operations and doesn't require complex calculations.
 * Root Mean Square Error (RMSE):
 *  Sensitivity to Large Errors: RMSE gives higher weight to larger errors due to squaring the differences. This makes it more suitable when large errors need to be penalized more.
 *  Differentiability: RMSE is differentiable at all points, which can be important for optimization problems.
 * approximate range:
 *  jerksMAE Range: Approximately 170,000 to 240,000
 *  jerksRSME Range: Approximately 14,000 to 75,000
 * accsMAE Range: Approximately 2,500 to 5,600
 *  accsRSME Range: Approximately 500 to 1,600
 *  velsMAE Range: Approximately 95 to 180
 *  velsRSME Range: Approximately 18 to 40
 * @throws {Error} Throws an error if there is invalid input data, mismatched array lengths, or bad unique frametimes.
 */
export function calculateKinematicErrorDescriptors(
    matchingUserPoses: Pose2DPixelLandmarks[],
    referencePoses: Pose2DPixelLandmarks[],
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


    function* processFrames() {
        let pPoses: UserRefPair<Pose2DPixelLandmarks> | undefined = undefined;
        let pVelocities: UserRefPair<Vec2DVis[]> | undefined = undefined;
        let pAccelerations: UserRefPair<Vec2DVis[]> | undefined = undefined;
        let pJerks: UserRefPair<Vec2DVis[]> | undefined = undefined;
        let pFrameTimes: number[] = [];

        for (let i = 0; i < matchingUserPoses.length; i++) {
            const curPoses: UserRefPair<Pose2DPixelLandmarks> = {
                user: matchingUserPoses[i],
                ref: referencePoses[i],
            };
            let curVelocities: UserRefPair<Vec2DVis[]> | undefined = undefined;
            let curVelocitiesError: number[] | undefined = undefined;
            let curAccelerations: UserRefPair<Vec2DVis[]> | undefined = undefined;
            let curAccelerationsError: number[] | undefined = undefined;
            let curJerks: UserRefPair<Vec2DVis[]> | undefined = undefined;
            let curJerksError: number[] | undefined = undefined;
            
            const frameTime = frameTimes[i];
            const dt = frameTime - (pFrameTimes[i - 1] ?? 0);

            if (curPoses.user.length !== curPoses.ref.length) {
                throw new Error("Mismatched array lengths between user and reference poses.");
            }

            if (curPoses.user[0].x === undefined || curPoses.user[0].x == null || curPoses.ref[0].x === undefined || curPoses.ref[0].x == null) {
                // the current frame is invalid, so we skip it
                continue;
            }

            // Normalize the velocities based on the scale factor
            const usrFrameScale = usrScale ?? Get2DScaleIndicator(curPoses.user);
            const refFrameScale = refScale ?? Get2DScaleIndicator(curPoses.ref);


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
                curVelocitiesError = curVelocities.user.map((landmark, j) => {
                    const refLandmark = curVelocities.ref[j];
                    return (
                        getMagnitude2DVec([
                            landmark.x - refLandmark.x,
                            landmark.y - refLandmark.y
                        ])
                    );
                });
                curAccelerations = { user: usrAccelerations, ref: refAccelerations };
            }

            if (pAccelerations && curAccelerations) {
                const usrJerks = calculateJointDerivs(pAccelerations.user, curAccelerations.user, dt);
                const refJerks = calculateJointDerivs(pAccelerations.ref, curAccelerations.ref, dt);

                curJerks = { user: usrJerks, ref: refJerks };
                curAccelerationsError = curAccelerations.user.map((landmark, j) => {
                    const refLandmark = curAccelerations.ref[j];
                    return (
                        getMagnitude2DVec([
                            landmark.x - refLandmark.x,
                            landmark.y - refLandmark.y
                        ])
                    );
                });
            }


            pPoses = curPoses;
            pVelocities = curVelocities;
            pAccelerations = curAccelerations;
            pJerks = curJerks;
            pFrameTimes.push(frameTime);

            yield { 
                // instantaneous velocity for each landmark in the frame (user)
                xyVels:  curVelocities?.user,
                scalarVelErr: [],

                // instantaneous acceleration for each landmark in the frame
                accels: [],
            };
        }
    }

    const results = [...processFrames()];

    // const velsMAE = getMatricesMAE(usrScalarVels, refScalarVels) ?? null;
    // const velsRSME = getMatricesRMSE(usrScalarVels, refScalarVels) ?? null;
    // const accsMAE = getMatricesMAE(usrScalarAccs, refScalarAccs) ?? null;
    // const accsRSME = getMatricesRMSE(usrScalarAccs, refScalarAccs) ?? null;
    // const jerksMAE = getMatricesMAE(usrScalarJerks, refScalarJerks) ?? null;
    // const jerksRSME = getMatricesRMSE(usrScalarJerks, refScalarJerks) ?? null;

    return {
        velsMAE,
        velsRSME,
        accsMAE,
        accsRSME,
        jerksMAE,
        jerksRSME,
    };
}
