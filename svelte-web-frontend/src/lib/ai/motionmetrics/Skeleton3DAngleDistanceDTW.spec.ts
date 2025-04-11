import { describe, it } from "vitest";
import { readFile, writeFile } from "fs/promises";
import { loadPoses, loadTikTokClipPoses, loadTiktokWholePoses, OtherPoseSource, Study, type StudySegmentData, type DanceName, type SegmentInfo, type TiktokDanceClipData } from "./PoseDataTestFile";
import Skeleton3DAngleDistanceDTW from "./Skeleton3DAngleDistanceDTW";
import type { LiveEvaluationMetric, TrackHistory } from "./MotionMetric";
import type { Dance } from "$lib/data/dances-store";
import Papa from "papaparse";
import Qijia2DSkeletonSimilarityMetric from "./Qijia2DSkeletonSimilarityMetric";
import TemporalAlignmentMetric from "./TemporalAlignmentMetric";
import Jules2DSkeletonSimilarityMetric from "./Jules2DSkeletonSimilarityMetric";
import KinematicErrorMetric from "./KinematicErrorMetric";
import { runLiveEvaluationMetricOnTestTrack, type TestTrack } from "./testdata/metricTestingUtils";
import Skeleton3dVectorAngleSimilarityMetric from "./Skeleton3dVectorAngleSimilarityMetric";
import { N } from "vitest/dist/chunks/reporters.nr4dxCkA.js";

type HumanRating = {
    study: number;
    dance: DanceName;
    userId: number;
    segmentId: number;
    avgRatingsPercentile: number;
    rating1: number;
    rating2: number;
    rating3: number;
};

function getClipHumanRatings(
    allRatings: Awaited<ReturnType<typeof loadHumanRatings>>,
    danceName: DanceName,
    userId: number,
    clipNumber: number
) {
    return allRatings.get(Study.Study1)?.get(danceName)?.get(userId)?.get(clipNumber);
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
async function loadHumanRatings() {
    const filepath = "src/lib/ai/motionmetrics/testdata/humanratings.csv";
  
    const file = await readFile(filepath, { encoding: "utf-8" });
    const data = await (new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            dynamicTyping: true,
            complete: (results) => {
                resolve(results.data as any as HumanRating[]);
            },
            error: (error: Error) => {
                reject(error);
            }
        });
    }) as Promise<HumanRating[]>);

    // access a clip's ratings with allRatings.get(study)?.get(danceName)?.get(userID)?.get(clipNumber)
    const allRatings = new Map<Study, Map<DanceName, Map<number, Map<number, HumanRating>>>>();

    // create a map of ratings for easy lookup
    data.forEach((rating) => {
        const danceName = rating.dance as DanceName;
        const userId = rating.userId;
        const clipNumber = rating.segmentId;
        const study = rating.study == 1 ? Study.Study1 : Study.Study2;
        if (!allRatings.has(study)) {
            allRatings.set(study, new Map<DanceName, Map<number, Map<number, HumanRating>>>());
        }
       
        const danceRatings = allRatings.get(study)!.get(danceName) || new Map<number, Map<number, HumanRating>>();
        // there are typically 5 clips, create an array so we can place ratings in the correct order
        const ratingIndex = clipNumber;
        const clipRatings = danceRatings.get(userId) || new Map<number, HumanRating>();
        clipRatings.set(clipNumber, rating);
        danceRatings.set(userId, clipRatings);
        allRatings.get(study)!.set(danceName, danceRatings);
    });

    return allRatings;
}

describe('Skeleton3DAngleDistanceDTW', {}, async () => {

    const tiktokClipPoses = await loadTikTokClipPoses();
    function getReferenceClip(segmentInfo: SegmentInfo) {
        return tiktokClipPoses.get(segmentInfo.danceName)?.[segmentInfo.clipNumber];
    }
    const tiktokWholePoses = await loadTiktokWholePoses();

    it.concurrent('can load the tiktok clip pose files', {}, async ({ expect }) => {
        const allposesgenerator = await loadPoses(OtherPoseSource.TikTokClips);
        const allposes = await fromAsync(allposesgenerator, (poseData, i) => {
            console.log(`[${i}] Generating pose data for clip`, poseData.segmentInfo.danceName, poseData.segmentInfo.clipNumber);
        });
        
        expect(allposes).not.toBe(null);
        expect(allposes).toHaveLength(20); // there are 20 clip files
        expect(allposes?.[0]?.poses).not.toBe(null);

        expect(tiktokClipPoses).not.toBe(null);
        expect(tiktokClipPoses.size).toBe(4); // there are 4 different tt clips
    });

    it.concurrent('can load the tiktok whole pose files', {}, ({ expect}) => {
        expect(tiktokWholePoses).not.toBe(null)
        expect(tiktokWholePoses.size).toBe(4); // there are 4 different tt clips
    });

    describe.concurrent('study 2', async () => {

        const allPoses = await loadPoses(Study.Study2);

        it.concurrent('can compute metric for a single pose file', {}, async ({ expect }) => {

            let iterations = 0;
            for await (const poseData of takeAsnc(allPoses, 1)) {

                expect(poseData?.poses).not.toBe(null);
                expect(poseData.poses?.length).toBeGreaterThan(0);
                expect(poseData.poses?.[0]).not.toBe(null);
                const firstRow = poseData.poses?.[0];
                expect(firstRow).toHaveProperty("pixelPose");
                expect(firstRow).toHaveProperty("worldPose");
                expect(firstRow?.pixelPose).toHaveLength(33);
                expect(firstRow?.worldPose).toHaveLength(33);

                expect(firstRow?.pixelPose[0]).toHaveProperty("x");
                expect(firstRow?.pixelPose[0]).toHaveProperty("y");
                expect(firstRow?.pixelPose[0]).toHaveProperty("dist_from_camera");
                expect(firstRow?.pixelPose[0]).toHaveProperty("visibility");

                expect(firstRow?.worldPose[0]).toHaveProperty("x");
                expect(firstRow?.worldPose[0]).toHaveProperty("y");
                expect(firstRow?.worldPose[0]).toHaveProperty("z");
                expect(firstRow?.worldPose[0]).toHaveProperty("visibility");
                iterations++;
            }
            expect(iterations).toBe(1);
        });

        it.concurrent('can match a user pose file to one of the tiktok clips & run dtw', {}, async ({ expect }) => {
            let data = takeAsnc(allPoses, 1);
            let userPoseData = await data.next();
            expect(userPoseData.value).toBeTruthy();
            expect(userPoseData.value?.poses).not.toBe(null);

            if (!userPoseData.value?.poses) return;
            const poseData = userPoseData.value as StudySegmentData;
            const referenceClip = getReferenceClip(poseData.segmentInfo);
            // verify that both are not undefined or null
            expect(poseData).toBeTruthy();
            expect(referenceClip).toBeTruthy();
            if (!referenceClip) return;

            const formatSummary = runDTWMetricOnClips(poseData, referenceClip);
            expect(formatSummary).toBeTruthy();
            console.log(formatSummary);
        });
    });

    
    it.concurrent('study 1 dtw processing', {
        timeout: 1000 * 60 * 25, // 25 minutes
    }, async ({ expect }) => {
        const allPoses = await loadPoses(Study.Study1, (clipInfo) => {
            const studyInfo = clipInfo as SegmentInfo;
            return studyInfo.study1phase == "performance"; // skip slowed down clips
        });
        const allRatings = await loadHumanRatings();
        const n = Infinity; // number of clips to process (i.e. all of them)


        //  process a clip, returning the formatted summary
        function processClip(poseData: StudySegmentData) {
            const referenceClip = getReferenceClip(poseData.segmentInfo);
            if (!referenceClip) return undefined;

            // const summary = runDTWMetricOnClips(poseData, referenceClip);
            const summary = runNonDTWMetricsOnClips(poseData, referenceClip);
            return summary;
        }

        // map each item in allPoses generator to a new object with the formatted summary
        // without holding them all in memory at the same time
        async function* processClips() {
            let i = 0
            for await (const poseData of takeAsnc(allPoses, n)) {
                i++;
                const segmentData = poseData as StudySegmentData;
                const ratings = getClipHumanRatings(allRatings, segmentData.segmentInfo.danceName, segmentData.segmentInfo.userId, segmentData.segmentInfo.clipNumber);

                console.log(`Processing clip ${i} ${segmentData.segmentInfo.userId}_${segmentData.segmentInfo.danceName}_${segmentData.segmentInfo.clipNumber}...`);

                // we're only using 
                if (!ratings) {
                    console.log(`\tNo ratings found for ${segmentData.segmentInfo.userId}_${segmentData.segmentInfo.danceName}_${segmentData.segmentInfo.clipNumber}`);
                    continue;
                }
                
                const summary = processClip(segmentData);

                yield { 
                    ...segmentData.segmentInfo, 
                    frameCount: segmentData.poses.length,
                    ...summary,
                    userId: ratings.userId,
                    humanRating: ratings.avgRatingsPercentile, // scale from 0-3 to 0-1
                    rating1: ratings.rating1,
                    rating2: ratings.rating2,
                    rating3: ratings.rating3,
                };
            }
        }

        const processedClips = await fromAsync(processClips());
        expect(processedClips).not.toBe(null);
        expect(processedClips?.length).toBeGreaterThan(0);

        // write csv
        const csv = Papa.unparse(processedClips);
        await writeFile("artifacts/study1-usersegments-metrics-2.csv", csv, {
            encoding: "utf-8",
        });
    });
});

function createTrackHistoryForClips(userPoseData: StudySegmentData, referenceClip: TiktokDanceClipData) {

    const fps = 30;
    const shortestClipLength = Math.min(userPoseData.poses.length, referenceClip.poses.length);
    const trackHistory: TrackHistory = {
        videoFrameTimesInSecs: referenceClip.poses.map((_, i) => i / fps).slice(0, shortestClipLength),
        actualTimesInMs: referenceClip.poses.map((_, i) => i / (userPoseData.segmentInfo.performanceSpeed * fps)).slice(0, shortestClipLength),
        ref3DFrameHistory: referenceClip.poses.map((pose) => pose.worldPose).slice(0, shortestClipLength),
        ref2DFrameHistory: referenceClip.poses.map((pose) => pose.pixelPose).slice(0, shortestClipLength),
        user3DFrameHistory: userPoseData.poses.map((pose) => pose.worldPose).slice(0, shortestClipLength),
        user2DFrameHistory: referenceClip.poses.map((pose) => pose.pixelPose).slice(0, shortestClipLength),
    };

    return trackHistory;
}

function runDTWMetricOnClips(userData: StudySegmentData, referenceClip: TiktokDanceClipData) {
    const metric = new Skeleton3DAngleDistanceDTW();
    const trackHistory = createTrackHistoryForClips(userData, referenceClip);
    const summary = metric.summarizeMetric(trackHistory)
    const formattedSummary = metric.formatSummary(summary);
    return formattedSummary;
    // const result = metric.compute(userPoseData, referenceClip);
    // return result;
}

function runNonDTWMetricsOnClips(userData: StudySegmentData, referenceClip: TiktokDanceClipData) {
    const metricsLive = {
        qijia2D: new Qijia2DSkeletonSimilarityMetric(),
        jules2D: new Jules2DSkeletonSimilarityMetric(),
        vectorAngle3D: new Skeleton3dVectorAngleSimilarityMetric()
    }
    const metricsSummary = {
        temporalAlignment: new TemporalAlignmentMetric(),
        angle3dDTW: new Skeleton3DAngleDistanceDTW(),
        kinematicError: new KinematicErrorMetric(),
    }

    
    const fps = 30
    const shortestClipLength = Math.min(userData.poses.length, referenceClip.poses.length);
    const testTrack: TestTrack = {
        id: `${userData.segmentInfo.userId}_${userData.segmentInfo.clipNumber}`,
        danceRelativeStem: userData.segmentInfo.danceName,
        segmentDescription: userData.segmentInfo.clipNumber.toString(),
        creationDate: "",
        trackDescription: userData.segmentInfo.danceName,
        videoFrameTimesInSecs: referenceClip.poses.map((_, i) => i / fps).slice(0, shortestClipLength),
        actualTimesInMs: referenceClip.poses.map((_, i) => i / (fps * userData.segmentInfo.performanceSpeed)).slice(0, shortestClipLength),
        ref2dPoses: referenceClip.poses.map((pose) => pose.pixelPose).slice(0, shortestClipLength),
        ref3dPoses: referenceClip.poses.map((pose) => pose.worldPose).slice(0, shortestClipLength),
        user2dPoses: userData.poses.map((pose) => pose.pixelPose).slice(0, shortestClipLength),
        user3dPoses: userData.poses.map((pose) => pose.worldPose).slice(0, shortestClipLength),
    }
    const trackHistory = createTrackHistoryForClips(userData, referenceClip);

    const qijia2dOutput = runLiveEvaluationMetricOnTestTrack(metricsLive.qijia2D, testTrack);
    const jules2dOutput = runLiveEvaluationMetricOnTestTrack(metricsLive.jules2D, testTrack);
    const vectorAngle3DOutput = runLiveEvaluationMetricOnTestTrack(metricsLive.vectorAngle3D, testTrack);
    const temporalAlignmentOutput = metricsSummary.temporalAlignment.summarizeMetric(trackHistory);
    const angle3dDTWOutput = metricsSummary.angle3dDTW.summarizeMetric(trackHistory);
    const kinematicErrorOutput = metricsSummary.kinematicError.summarizeMetric(trackHistory);

    // create an object flattening the formattedSummaries, with the keys prepended with the metric name
    const flattenedSummaries = {
        invalidFrameCout: angle3dDTWOutput.invalidFramesCount,
        invalidPercent: angle3dDTWOutput.invalidPercent,
        qijia2d: qijia2dOutput.summary.overallScore / 5, // scale from 0-5 to 0-1
        jules2d: jules2dOutput.summary.overallScore,     // already scaled 0-1
        vectorAngle3D: vectorAngle3DOutput.summary.overallScore,
        temporalAlignmentSecs: temporalAlignmentOutput.temporalOffsetSecs,
        "angle3D DTW Distance": angle3dDTWOutput.dtwDistance,
        "angle3D DTW Dist Avg.": angle3dDTWOutput.dtwDistance / angle3dDTWOutput.dtwPath.length,
        "angle3D warpingFactor": angle3dDTWOutput.warpingFactor,
        "velocity 3d MAE": kinematicErrorOutput.summary3D.velsMAE,
        "accel 3d MAE": kinematicErrorOutput.summary3D.accsMAE,
        "jerk 3d MAE": kinematicErrorOutput.summary3D.jerksMAE,
        "velocity 2d MAE": kinematicErrorOutput.summary2D.velsMAE,
        "accel 2d MAE": kinematicErrorOutput.summary2D.accsMAE,
        "jerk 2d MAE": kinematicErrorOutput.summary2D.jerksMAE,
    }
    return flattenedSummaries;
}

async function* takeAsnc<T>(
    iterable: AsyncIterable<T>,
    n: number
): AsyncGenerator<T, void, unknown> {
    let count = 0;
    for await (const item of iterable) {
        if (count++ >= n) break;
        yield item;
    }
}

async function fromAsync<T>(asyncIterable: AsyncIterable<T>, printFn?: (item: T, i: number) => void): Promise<T[]> {
    const result: T[] = [];
    let i = 0;
    for await (const item of asyncIterable) {
        result.push(item);
        printFn?.(item, i);
        i++;
    }
    return result;
};