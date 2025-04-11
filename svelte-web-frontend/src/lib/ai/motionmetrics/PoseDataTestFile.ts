import study1CsvUrl from './testdata/user1-seg-ratings.csv?url';
import study2CsvUrl from './testdata/user2-seg-ratings.csv?url';
import Papa from 'papaparse';
import { readFile, readdir } from 'node:fs/promises';
import path from 'path';
import type { Pose2DPixelLandmarks, Pose3DLandmarkFrame } from '$lib/webcam/mediapipe-utils';
import type { ValueOf } from '$lib/data/dances-store';
import { dances, loadPoseInformation, GetPixelLandmarksFromPose2DRow, GetPixelLandmarksFromPose3DRow, type Dance } from '$lib/data/dances-store';

export const STUDY_1_SEGMENTED_POSES_FOLDER = "../motion-pipeline/data/study-poses/study1-poses-segmented/";
export const STUDY_2_SEGMENTED_POSES_FOLDER = "../motion-pipeline/data/study-poses/study2-poses-segmented/";
export const STUDY_2_WHOLE_POSES_FOLDER = "src/lib/ai/motionmetrics/testdata/study-poses/study2-whole/";
export const TIKTOK_CLIPS_POSES_FOLDER = "../motion-pipeline/data/study-poses/tiktok-clip-poses/";
export const TIKTOK_WHOLE_POSES_FOLDER_2D = "static/bundle/pose2d_data/";
export const TIKTOK_WHOLE_POSES_FOLDER_3D_HOLISTIC = "static/bundle/holistic_data/";

export const LandmarkNames = ['NOSE', 'LEFT_EYE_INNER', 'LEFT_EYE', 'LEFT_EYE_OUTER', 'RIGHT_EYE_INNER', 'RIGHT_EYE', 'RIGHT_EYE_OUTER', 'LEFT_EAR', 'RIGHT_EAR', 'MOUTH_LEFT', 'MOUTH_RIGHT', 'LEFT_SHOULDER', 'RIGHT_SHOULDER', 'LEFT_ELBOW', 'RIGHT_ELBOW', 'LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_PINKY', 'RIGHT_PINKY', 'LEFT_INDEX', 'RIGHT_INDEX', 'LEFT_THUMB', 'RIGHT_THUMB', 'LEFT_HIP', 'RIGHT_HIP', 'LEFT_KNEE', 'RIGHT_KNEE', 'LEFT_ANKLE', 'RIGHT_ANKLE', 'LEFT_HEEL', 'RIGHT_HEEL', 'LEFT_FOOT_INDEX', 'RIGHT_FOOT_INDEX'];

export enum Study {
    Study1 = "study1",
    Study2 = "study2",
}

export enum OtherPoseSource {
    TikTokClips = "tiktokclips",
    // TiktokWhole uses the loading mechanism from dances-store.ts
    // TiktokWhole = "tiktokwhole",
}

function isStudy(poseSource: Study | OtherPoseSource): poseSource is Study {
    return Object.values(Study).includes(poseSource as Study);
}
function isOtherPoseSource(poseSource: Study | OtherPoseSource): poseSource is OtherPoseSource {
    return Object.values(OtherPoseSource).includes(poseSource as OtherPoseSource);
}

export const TiktokClipIdToName = Object.freeze({
    a: "last-christmas",
    b: "mad-at-disney",
    c: "pajama-party",
    d: "bartender",
});
export const TiktokClipNameToId = Object.fromEntries(Object.entries(TiktokClipIdToName).map(([k, v]) => [v, k])) as {
    [key in ValueOf<typeof TiktokClipIdToName>]: keyof typeof TiktokClipIdToName
};
export type DanceName = keyof typeof TiktokClipNameToId;
export type DanceId = keyof typeof TiktokClipIdToName;

export type SegmentInfo = {
    userId: number;
    danceName: DanceName;
    danceId: DanceId;
    studyName: string;
    workflowId: string;
    condition: string;
    clipNumber: number;
    study1phase?: string;
    performanceSpeed: number;
}
export type TikTokClipInfo = {
    danceName: DanceName;
    danceId: DanceId;
    clipNumber: number;
}

export type TiktokDanceClipData = {
    poses: PoseFrame[],
    segmentInfo: TikTokClipInfo,
};

export type TiktokDanceWholeData = {
    danceName: DanceName,
    poses: PoseFrame[],
    dance: Dance,
};

export type StudySegmentData = {
    poses: PoseFrame[],
    segmentInfo: SegmentInfo,
};

export type PoseFrame = {
    pixelPose: Pose2DPixelLandmarks,
    worldPose: Pose3DLandmarkFrame
};

function getSegmentInfo(filename: string, study: Study): SegmentInfo | null {
    const isStudy1 = [Study.Study1].includes(study);
    const targetPartCount = isStudy1 ? 
        5 : 
        4; // study 2, study2 segmented
    const conditionSeparator = isStudy1 ? "--" : "-";

    let fileparts = filename.split("_").filter((s) => s.length > 0);
    if (fileparts.length !== targetPartCount) return null;

    let study1phase = undefined;
    if (isStudy1) {
        // extract the study 1 phase
        study1phase = fileparts.splice(1, 1)[0];
    }
    // Format (for either study case) is now [user, dance-condition, workflow, clip]

    let [userPart, danceConditionPart, workflowPart, clipPart] = fileparts;
    userPart = userPart.replace("user", "");
    let userId = Number.parseInt(userPart);
    if (Number.isNaN(userId)) return null;

    let [studyName, rawDanceName, condition] = danceConditionPart.split(conditionSeparator);
    let workflowId = workflowPart.replace("workflowid-", "");
    let clipNumber = Number.parseInt(clipPart.replace("clip", "").replace(".pose.csv", ""));
    const canonicalResult = canonicalizeDanceName(rawDanceName);

    if (!canonicalResult) return null;
    if ([Study.Study1, Study.Study2].includes(study) &&
        Number.isNaN(clipNumber)) {
            return null;
    }

    const [danceId, danceName] = canonicalResult;
    return {
        userId,
        danceName,
        danceId,
        studyName: isStudy1 ? "study1" : "study2",
        workflowId,
        condition,
        clipNumber,
        study1phase,
        performanceSpeed: isStudy1 ? 1.0 : 0.5, // study 1 videos were recorded at full speed, study 2 at half speed
    } as SegmentInfo;
}

function getTikTokClipInfo(filename: string): TikTokClipInfo | null {
    let parts = filename.split(".");
    if (parts.length != 4) {
        return null;
    }
    const [danceName, clipName, _a, _b] = parts;
    const clipNumber = Number.parseInt(clipName.replace("clip-", ""));

    // if there's an invalud dance name, disregard this segment
    if (Object.keys(TiktokClipNameToId).indexOf(danceName) == -1) {
        return null;
    }

    return {
        danceName,
        danceId: TiktokClipNameToId[danceName as keyof typeof TiktokClipNameToId],
        clipNumber
    } as TikTokClipInfo;
}
/**
 * Given a filename in the study 2 format, extract the segment info
 * @param filename The filename of the poses file
 * @returns The segment info, or null if the filename is not in the expected format
 * 
 * @example
 * With a study 1 filename like `"user4324____initial____userstudy1--last-christmas--control____workflowid-0079b262-7575-4ae7-a377-60e21070106e____clip1.pose.csv"`
 * It will return
 * ```
 * {
 *   userId: 4324,
 *   danceName: "last-christmas",
 *   condition:"control",
 *   workflowId: "0079b262-7575-4ae7-a377-60e21070106e",
 *   clipNumber: 1,
 * }
 * ```
 * 
 * @example
 * With a study 2 filename like `"user3209________userstudy2-bartender-segmented____workflowid-c096aef4-3cd9-415d-9ca1-f8709a7f770a____clip1.pose.csv"`
 * It will return
 * ```
 * {
 *  userId: 3209,
 *  danceName: "bartender",
 *  condition: "segmented",
 *  workflowId: "c096aef4-3cd9-415d-9ca1-f8709a7f770a",
 *  clipNumber: 1,
 * }
 * ```
 */
export function getClipInfo<T extends Study | OtherPoseSource>(filename: string, clipSrc: T): T extends Study ? (SegmentInfo | null) : (TikTokClipInfo | null) {
    if (isStudy(clipSrc)) {
        return getSegmentInfo(filename, clipSrc)
    }
    else if (isOtherPoseSource(clipSrc)) {
        return getTikTokClipInfo(filename) as any;
    }
    return null;
}

function canonicalizeDanceName(danceNameRaw: string): [DanceId, DanceName] | null {
    for (const danceName of Object.keys(TiktokClipNameToId)) {
        if (danceNameRaw.includes(danceName)) return [TiktokClipNameToId[danceName as keyof typeof TiktokClipNameToId], danceName as keyof typeof TiktokClipNameToId];
    }

    return null;
}

function convertCsvRow(row: Record<string, number>): PoseFrame {
    const user2dPose: Pose2DPixelLandmarks = LandmarkNames.map((name) => {
        return {
            x: row[`${name}_x_2d`],
            y: row[`${name}_y_2d`],
            dist_from_camera: row[`${name}_z_2d`],
            visibility: row[`${name}_visibility_2d`],
        }
    })

    const user3dPose: Pose3DLandmarkFrame = LandmarkNames.map((name) => {
        return {
            x: row[`${name}_x_3d`],
            y: row[`${name}_y_3d`],
            z: row[`${name}_z_3d`],
            visibility: row[`${name}_visibility_3d`],
        }
    })

    return {
        pixelPose: user2dPose,
        worldPose: user3dPose,
    }
}

function getPoseFolder(poseSource: Study | OtherPoseSource) {
    switch (poseSource) {
        case Study.Study1:
            return path.resolve(STUDY_1_SEGMENTED_POSES_FOLDER);
        case Study.Study2:
            return path.resolve(STUDY_2_SEGMENTED_POSES_FOLDER);
        // case Study.Study2Whole:
            // return path.resolve(STUDY_2_WHOLE_POSES_FOLDER);
        case OtherPoseSource.TikTokClips:
            return path.resolve(TIKTOK_CLIPS_POSES_FOLDER);
    }
    throw new Error("Invalid pose source");
}

/**
 * Generates all pose files in a folder
 */
export async function* loadPoses<T extends Study | OtherPoseSource>(poseSource: T, filter?: (clipInfo: SegmentInfo | TikTokClipInfo) => boolean): 
    AsyncGenerator<StudySegmentData | TiktokDanceClipData> {
    const folder = getPoseFolder(poseSource);

    // List all files in the folder
    const files = await readdir(folder);

    for (const file of files) {

        const segmentInfo = getClipInfo(file, poseSource);
        if (segmentInfo == null) continue; // skip invalidly named files

        if (filter && !filter(segmentInfo)) 
            continue; // skip invalidly named files

        const fullpath = `${folder}/${file}`;

        const data = await readFile(fullpath, 'utf-8');

        yield await new Promise((res, rej) => {
            Papa.parse(data, {
                header: true,
                dynamicTyping: true,
                complete: (results) => {
                    const convertedFrames = (results.data as Array<Record<string, number>>).map(convertCsvRow);
                    res({
                        poses: convertedFrames,
                        segmentInfo: segmentInfo as any,
                    });
                },
                error: (error: Error, file: Papa.LocalFile) => {
                    rej(error);
                }
            })
        });
    }
}

export async function loadTikTokClipPoses() {
    const poseFiles = await loadPoses(OtherPoseSource.TikTokClips) as AsyncGenerator<TiktokDanceClipData>;

    const clips = new Map<DanceName, TiktokDanceClipData[]>();

    for await (const clipData of poseFiles) {
        const { danceName } = clipData.segmentInfo;
        if (!clips.has(danceName)) {
            clips.set(danceName, []);
        }
        clips.get(danceName)?.push(clipData);
    }

    // sort the clipDatas by clip number
    for (const clipDatas of clips.values()) {
        clipDatas.sort((a, b) => a.segmentInfo.clipNumber - b.segmentInfo.clipNumber);
    }

    return clips;
}

function cononicalizeClipName(clipName: string): DanceName | undefined {
    const allDances = Object.keys(TiktokClipNameToId) as DanceName[];
    for (const dance of allDances) {
        if (clipName.includes(dance)) return dance;

        // special case: pajama party is spelled without a space in dances.json
        if (clipName.includes("pajamaparty")) return "pajama-party";
    }
    return undefined;
}

export async function loadTiktokWholePoses() {

    // const poseMap = new ();

    const studyDancesRequests = dances
        .filter(dance => cononicalizeClipName(dance.clipName))
        .map((dance) => {
            const danceName = cononicalizeClipName(dance.clipName) as DanceName;
            const poses2Durl = `${TIKTOK_WHOLE_POSES_FOLDER_2D}${dance.clipRelativeStem}.pose2d.csv`;
            const poses3Durl = `${TIKTOK_WHOLE_POSES_FOLDER_3D_HOLISTIC}${dance.clipRelativeStem}.holisticdata.csv`;
            const useFetch = false; // have loadPoseInformation use the node fs.

            return {
                danceName,
                dance,
                poses2Dpromise: loadPoseInformation(poses2Durl, dance.fps, useFetch, GetPixelLandmarksFromPose2DRow),
                poses3Dpromose: loadPoseInformation(poses3Durl, dance.fps, useFetch, GetPixelLandmarksFromPose3DRow),
            };
        });
    
        const studyDances = await Promise.all(studyDancesRequests.map(async (request) => {
            const [poses2D, poses3D] = await Promise.all([request.poses2Dpromise, request.poses3Dpromose]);
            const poseFrame: PoseFrame[] = poses2D.poses.map((pose2D, i) => ({
                pixelPose: pose2D,
                worldPose: poses3D.poses[i],
            }));
            return {
                danceName: request.danceName,
                dance: request.dance,
                poses: poseFrame,
            }as TiktokDanceWholeData;
        }));


    const poseMap = new Map(studyDances.map((danceData) => [danceData.danceName, danceData]));
    return poseMap;
}