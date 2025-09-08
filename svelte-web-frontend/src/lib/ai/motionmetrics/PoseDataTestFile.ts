import study1CsvUrl from './testdata/user1-seg-ratings.csv?url';
import study2CsvUrl from './testdata/user2-seg-ratings.csv?url';
import Papa from 'papaparse';
import { readFile, readdir } from 'node:fs/promises';
import path from 'path';
import type { Pose2DPixelLandmarks, Pose3DLandmarkFrame } from '$lib/webcam/mediapipe-utils';
import type { ValueOf } from '$lib/data/dances-store';
import { dances, loadPoseInformation, GetPixelLandmarksFromPose2DRow, GetPixelLandmarksFromPose3DRow, type Dance } from '$lib/data/dances-store';

export const STUDY_1_SEGMENTED_POSES_FOLDER = "testResults/study1-pixelposes-segmented/";
export const STUDY_1_WHOLE_POSES_FOLDER = "testResults/study1-pixelposes-whole/";
export const STUDY_2_SEGMENTED_POSES_FOLDER = "testResults/study2-pixelposes-segmented/";
export const STUDY_2_WHOLE_POSES_FOLDER = "testResults/study2-pixelposes-whole/";
export const TIKTOK_CLIPS_POSES_FOLDER = "testResults/tiktoks-pixelposes-segmented/";
export const TIKTOK_WHOLE_POSES_FOLDER_2D = "static/bundle/pose2d_data/";
export const TIKTOK_WHOLE_POSES_FOLDER_3D_HOLISTIC = "static/bundle/holistic_data/";

export const LandmarkNames = ['NOSE', 'LEFT_EYE_INNER', 'LEFT_EYE', 'LEFT_EYE_OUTER', 'RIGHT_EYE_INNER', 'RIGHT_EYE', 'RIGHT_EYE_OUTER', 'LEFT_EAR', 'RIGHT_EAR', 'MOUTH_LEFT', 'MOUTH_RIGHT', 'LEFT_SHOULDER', 'RIGHT_SHOULDER', 'LEFT_ELBOW', 'RIGHT_ELBOW', 'LEFT_WRIST', 'RIGHT_WRIST', 'LEFT_PINKY', 'RIGHT_PINKY', 'LEFT_INDEX', 'RIGHT_INDEX', 'LEFT_THUMB', 'RIGHT_THUMB', 'LEFT_HIP', 'RIGHT_HIP', 'LEFT_KNEE', 'RIGHT_KNEE', 'LEFT_ANKLE', 'RIGHT_ANKLE', 'LEFT_HEEL', 'RIGHT_HEEL', 'LEFT_FOOT_INDEX', 'RIGHT_FOOT_INDEX'];

export enum Study {
    Study1_BySegment = "study1",
    Study1_Whole = "study1whole",
    Study2_BySegment = "study2",
    Study2_Whole = "study2whole",
}
const Study1Studies = [Study.Study1_BySegment, Study.Study1_Whole];
const WholeStudies = [Study.Study1_Whole, Study.Study2_Whole];

export enum OtherPoseSource {
    TikTokClips = "tiktokclips",
    // TiktokWhole uses the loading mechanism from dances-store.ts
    // TiktokWhole = "tiktokwhole",
}

export function isStudy(poseSource: Study | OtherPoseSource): poseSource is Study {
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
    studyName: "study1" | "study2";
    segmentation: "whole" | "segmented"; // whole or segmented
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
    study: Study,
};

export type PoseFrame = {
    pixelPose: Pose2DPixelLandmarks,
    worldPose: Pose3DLandmarkFrame
};

const WORKFLOW_STUDY1_ID_TO_CONDITION: Readonly<Record<string, 'control' | 'skeleton' | 'sheetmotion'>> = Object.freeze({
    "0079b262-7575-4ae7-a377-60e21070106e": "control", // last-christmas
    "e525302b-2740-4e73-aa37-170bd8ceb8d1": "control", // mad-at-disney
    "917fe4e1-9590-44eb-a541-1cef13e4f1ea": "control", // pajama-party

    "02883b27-c152-4415-ae7a-1cb4c5f086e5": "skeleton", // last-christmas
    "44e54afd-19c0-4342-b753-fb4ab123aaad": "skeleton", // mad-at-disney
    "102d5dd7-f1f4-447d-9c0c-6e10a8afc4c3": "skeleton", // pajama-party

    "ec8fbc4c-bf9d-404d-a4ab-c626e23a4d2e": "sheetmotion", // last-christmas
    "d6ad5749-50d4-4cc7-99b5-6b9ddecebbf4": "sheetmotion", // mad-at-disney
    "00388bd7-d313-4ce1-89e5-c88091f25357": "sheetmotion", // pajama-party
});

function getWholePixelPoseData(filename: string, study: Study): SegmentInfo | null {
    
    if (!filename.endsWith(".csv")) {
        return null; // not a valid pose data file
    }
    const cleanname = filename.replace(".pose.csv", "").replace(".pixel_cords", "");

    if (Study1Studies.includes(study)) {
        // example study 1_whole filename: "44e54afd-19c0-4342-b753-fb4ab123aaad-4324-mad-at-disney-tutorial-blurred-44e54afd-19c0-4342-b753-fb4ab123aaad-initial-0.5"
        // pattern is: "{workflow_uuid}-{4_digit_userid}-{dance_name}-{workflow_uuid}-{study1phase}-{speed}"
        // a bit tricky since the workflow UUID has dashes in it, and we need to lookup the condition by this UUID.
        // also, the dances have various amount of dashes. To account for this, we split my dashes, then index by the fixed parts at front and end. 
        // the remaining parts are the dance name.
        const parts = cleanname.split("-");
        const MIN_PARTS = 14; 
            // 5 for workflow ID, 
            // 1 for user ID, 
            // 1+ for dance name, 
            // 5 for workflow ID again, 
            // 1 for study phase, and 
            // 1 for speed
        if (parts.length < MIN_PARTS) {
            console.warn(`Filename ${filename} does not have enough parts to be a valid study 1 whole pose data file`);
            return null;
        };
        const workflowId1 = parts.splice(0, 5).join("-"); // first 5 parts are the workflow ID, user ID, dance name, workflow ID again, and study phase
        const userIdRaw = parts.splice(0, 1)[0]; // next part is the user ID
        let userId = Number.parseInt(userIdRaw);
        if (Number.isNaN(userId)) {
            // some filenames have "anonomous" as the user ID, which is not a valid number
            // we don't use these (so return null), but no need to warn about it
            if (userIdRaw.toLowerCase() !== "anonomous") {
                console.warn(`Filename ${filename} does not have a valid user ID`);
            }
            return null;
        }
        const speedOrPhase = parts.pop()!; // last part is the speed or study phase
        let study1phase: string;
        let speed: number;
        if (!Number.isNaN(Number.parseFloat(speedOrPhase))) {
            // most filenames have speed as the last part
            speed = Number.parseFloat(speedOrPhase);
            study1phase = parts.pop()!;
            if (Number.isNaN(speed)) {
                console.warn(`Filename ${filename} does not have a valid speed`);
                return null;
            }
        } else if (speedOrPhase === "performance") {
            // some filenames are missing the speed, so we infer from the phase.
            study1phase = speedOrPhase;
            speed = 1.0; 
        } else if (speedOrPhase === "initial") {
            study1phase = speedOrPhase;
            speed = 0.5; 
        } else {
            throw new Error(`Filename ${filename} does not have a valid speed or study phase: ${speedOrPhase}`);
        }
        // next 5 parts are also workflowid
        const workflowId2 = parts.splice(parts.length - 5, 5).join("-");
        if (workflowId1 !== workflowId2) {
            throw new Error(`Workflow IDs do not match in filename: ${filename}`);
        }
        const rawDanceName = parts.join("-"); // the remaining parts are the dance name
        const danceName = cononicalizeClipName(rawDanceName);
        if (!danceName) {
            console.warn(`Filename ${filename} does not have a valid dance name`);
            return null;
        }
        const condition = WORKFLOW_STUDY1_ID_TO_CONDITION[workflowId1];

        return {
            userId,
            danceName,
            danceId: TiktokClipNameToId[danceName],
            studyName: "study1",
            segmentation: "whole",
            workflowId: workflowId1,
            condition: condition ?? "unknown", // whole pose data does not have a condition
            study1phase: study1phase,
            clipNumber: -1, // whole pose data does not have a clip number
            performanceSpeed: speed, // study 1 videos were recorded at full speed
        } as SegmentInfo;
    } else if (Study.Study2_Whole) {
        // example study 2_whole filename: "user5349________userstudy2-madatdisney-emojiandsegmented____workflowid-568e88b5-0a90-4755-bef4-3132efd7ffa1____whole.pixel_cords.pose.csv"
        const parts = cleanname.split("_").filter((s => s.length > 0));
        if (parts.length < 4) {
            return null;
        }
        const userPart = parts[0].replace("user", "");
        const userId = Number.parseInt(userPart);
        if (userPart.includes("idmissing")) {
            return null;
        }
        if (Number.isNaN(userId)) {
            return null;
        }

        const userDanceConditionParts = parts[1].split("-");
        if (userDanceConditionParts.length < 2) {
            return null;
        }
        const studyName = userDanceConditionParts[0].replace("userstudy2", "study2");
        if (!studyName.includes("study2")) {
            throw new Error(`Filename ${filename} does not contain "study2" but is being parsed as study 2 whole pose data`);
        }
        // get the last part of the userDanceConditionParts as the condition
        // and the middle parts joined as dance name
        const danceConditionParts = userDanceConditionParts.slice(1);
        const condition = danceConditionParts.pop();
        const rawDanceName = danceConditionParts.join("-");
        if (!rawDanceName || !condition) {
            return null;
        }

        const danceName = cononicalizeClipName(rawDanceName);
        if (!danceName) {
            return null;
        }

        const workflowId = parts[2].replace("workflowid-", "");
        return {
            userId,
            danceName,
            danceId: TiktokClipNameToId[danceName],
            studyName: "study2",
            segmentation: "whole",
            workflowId,
            condition,
            clipNumber: -1,
            performanceSpeed: 0.5, // study 2 videos were recorded at half speed
        } as SegmentInfo;
    }
    throw new Error(`Can't get SegmentInfo from filename: ${filename}. Expected study 1 or study 2 whole pose file format.`);        
}

function getSegmentInfo(filename: string, study: Study): SegmentInfo | null {
    if (WholeStudies.includes(study)) {
        return getWholePixelPoseData(filename, study);
    }

    // Study 1 example filename: user4751____performance____userstudy1--last-christmas--control____workflowid-0079b262-7575-4ae7-a377-60e21070106e____clip1.pose
    // Study 2 example filename: user3209________userstudy2-bartender-segmented____workflowid-c096aef4-3cd9-415d-9ca1-f8709a7f770a____clip2.pose
    filename = filename
        .replace(".pose.csv", "")
        .replace(".pixel_cords", "");
    const isStudy1 = Study1Studies.includes(study);
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
        if (!filename.includes("study1")) {
            throw new Error(`Filename ${filename} does not contain "study1" but is being parsed as study 1`);
        }
    } else {
        if (!filename.includes("study2")) {
            throw new Error(`Filename ${filename} does not contain "study2" but is being parsed as study 2`);
        }
    }
    // Format (for either study case) is now [user, dance-condition, workflow, clip]

    if (fileparts.length !== 4) throw new Error(`Something is wrong with: ${filename}. Expected 4 parts, got ${fileparts.length}`);

    let [userPart, danceConditionPart, workflowPart, clipPart] = fileparts;
    userPart = userPart.replace("user", "");
    let userId = Number.parseInt(userPart);
    if (Number.isNaN(userId)) return null;

    let [studyName, rawDanceName, condition] = danceConditionPart.split(conditionSeparator);
    
    let workflowId = workflowPart.replace("workflowid-", "");
    let clipNumber = Number.parseInt(clipPart.replace("clip", "").replace(".pose.csv", ""));
    const canonicalResult = canonicalizeDanceName(rawDanceName);

    if (!canonicalResult) return null;
    if ([Study.Study1_BySegment, Study.Study2_BySegment].includes(study) &&
        Number.isNaN(clipNumber)) {
            return null;
    }

    const [danceId, danceName] = canonicalResult;
    return {
        userId,
        danceName,
        danceId,
        studyName: isStudy1 ? "study1" : "study2",
        segmentation: "segmented",
        workflowId,
        condition,
        clipNumber,
        study1phase,
        performanceSpeed: isStudy1 ? 1.0 : 0.5, // study 1 videos were recorded at full speed, study 2 at half speed
    } as SegmentInfo;
}

function getTikTokClipInfo(filename: string): TikTokClipInfo | null {
    let parts = filename.replace(".pixel_cords.", "").replace(".pose.csv", "").split(".");
    if (parts.length != 2) {
        return null;
    }
    const [danceName, clipName] = parts;
    const clipNumber = Number.parseInt(clipName.replace("clip-", ""));

    // if there's an invalid dance name, disregard this segment
    if (Object.keys(TiktokClipNameToId).indexOf(danceName) == -1 || Number.isNaN(clipNumber)) {
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
        case Study.Study1_BySegment:
            return path.resolve(STUDY_1_SEGMENTED_POSES_FOLDER);
        case Study.Study2_BySegment:
            return path.resolve(STUDY_2_SEGMENTED_POSES_FOLDER);
        case Study.Study1_Whole:
            return path.resolve(STUDY_1_WHOLE_POSES_FOLDER);
        case Study.Study2_Whole:
            return path.resolve(STUDY_2_WHOLE_POSES_FOLDER);
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
                    
                    if (isStudy(poseSource)) {
                        res({
                            poses: convertedFrames,
                            segmentInfo: segmentInfo as SegmentInfo,
                            study: poseSource,
                        } as StudySegmentData);
                    } else {
                        res({
                            poses: convertedFrames,
                            segmentInfo: segmentInfo as SegmentInfo,
                        });
                    }
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

        // some dances have a dash in the name, but the clip name does not
        // ex: pajama-party is spelled pajamaparty in dances.json
        if (clipName.includes(dance.replaceAll("-", ""))) return dance; 
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


export type HumanRating = {
    study: number;
    dance: DanceName;
    userId: number;
    segmentId: number | "whole";
    condition: string;
    humanRatingPercentile: number;            // mean of all human ratings, as a percentile, 0-1 scale   
    autoRatingPercentile: number | undefined; // qijia's calculated rating percentile, 0-1 scale
    humanRating: number;                      // mean of all human ratings, on a 1-5 scale
    autoRating: number | undefined;           // qijia's calculated rating, 1-5 scale
    rating1: number | undefined;              // rater 1 rating, 1-3 scale
    rating2: number | undefined;              // rater 2 rating, 1-3 scale
    rating3: number | undefined;              // rater 3 rating, 1-3 scale
    lessonOrder: number | undefined;          // order in the user study, 1-4
    reportedHelpfulness: number | undefined;  // self-reported helpfulness of the intervention, out of 10
    reportedDifficulty: number | undefined;   // self-reported difficulty of the dance, out of 10
};

export function getClipHumanRatings(args: {
    allRatings: Awaited<ReturnType<typeof loadHumanRatings>>,
    info: SegmentInfo,
    study: Study,
}) {
    const { allRatings, info, study } = args;
    const { danceName, userId, clipNumber } = info;
    return allRatings.get(study)?.get(danceName)?.get(userId)?.get(clipNumber);
}

/**
 * Load the user study 1 segment ratings from the csv files
 * @returns a map of dance names to a map of user IDs to a map of clip numbers to ratings
 * @example
 * ```
 * const allRatings = await loadUserStudy1SegRatings();
 * const user42Ratings = allRatings.get("mad-at-disney")?.get(42);
 * const clip1Ratings = user42Ratings?.[1];
 * const meanRating = clip1Ratings?.meanRatingPercentage;
 * 
 * # or, in a single line
 * const meanRating = (await loadUserStudy1SegRatings()).get("mad-at-disney")?.get(42)?.[1]?.meanRatingPercentage;
 * ```
 */
export async function loadHumanRatings() {
    const filepath = "src/lib/ai/motionmetrics/testdata/humanratings.csv";
  
    const file = await readFile(filepath, { encoding: "utf-8" });
    const data = await (new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            dynamicTyping: false,
            complete: (results) => {
                const rawData = results.data as Array<Record<string, string>>;
                const data: HumanRating[] = rawData.map((row) => {
                    const { study, dance, userId, segmentId, condition, humanRatingPercentile, autoRatingPercentile, humanRating, autoRating, rating1, rating2, rating3, lessonOrder, reportedHelpfulness, reportedDifficulty } = row;
                    
                    const parseNullableFloat = (value: string) => value !== undefined && value !== null && value.length > 0 ? Number.parseFloat(value) : undefined;
                    const parseNullableInt = (value: string) => value !== undefined && value !== null && value.length > 0 ? Number.parseInt(value) : undefined; 
                    return {
                        study: Number.parseInt(study), 
                        dance, 
                        userId: Number.parseInt(userId), 
                        segmentId: segmentId === "whole" ? "whole" : Number.parseInt(segmentId), 
                        condition, 
                        humanRatingPercentile: parseNullableFloat(humanRatingPercentile), 
                        autoRatingPercentile: parseNullableFloat(autoRatingPercentile), 
                        humanRating: parseNullableFloat(humanRating), 
                        autoRating: parseNullableFloat(autoRating), 
                        rating1: parseNullableInt(rating1), 
                        rating2: parseNullableInt(rating2), 
                        rating3: parseNullableInt(rating3), 
                        lessonOrder: parseNullableInt(lessonOrder), 
                        reportedHelpfulness: parseNullableInt(reportedHelpfulness), 
                        reportedDifficulty: parseNullableInt(reportedDifficulty)
                    } as HumanRating
                });
                resolve(data);
            },
            error: (error: Error) => {
                reject(error);
            }
        });
    }) as Promise<HumanRating[]>);

    // access a clip's ratings with allRatings.get(study)?.get(danceName)?.get(userID)?.get(clipNumber)
    const allRatings = new Map<Study, Map<DanceName, Map<number, Map<number, HumanRating>>>>();
    const WHOLE_DANCE_SEGMENT_ID = -1;

    // create a map of ratings for easy lookup
    data.forEach((rating) => {
        const danceName = rating.dance as DanceName;
        const userId = rating.userId;
        const clipNumber = rating.segmentId;
        const isWholeSegment = clipNumber === "whole";
        const study = rating.study == 1 ? 
            (isWholeSegment ? Study.Study1_Whole : Study.Study1_BySegment) : 
            (isWholeSegment ? Study.Study2_Whole : Study.Study2_BySegment);
        if (!allRatings.has(study)) {
            allRatings.set(study, new Map<DanceName, Map<number, Map<number, HumanRating>>>());
        }
       
        const danceRatings = allRatings.get(study)!.get(danceName) || new Map<number, Map<number, HumanRating>>();
        const clipRatings = danceRatings.get(userId) || new Map<number, HumanRating>();
        clipRatings.set(isWholeSegment ? WHOLE_DANCE_SEGMENT_ID : clipNumber, rating);
        danceRatings.set(userId, clipRatings);
        allRatings.get(study)!.set(danceName, danceRatings);
    });

    return allRatings;
}
