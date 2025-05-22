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
import { fromAsync, takeAsnc } from "../EvaluationCommonUtils";

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
        "velocity 3d MAE": kinematicErrorOutput.summary3D.velMAE,
        "accel 3d MAE": kinematicErrorOutput.summary3D.accelMAE,
        "jerk 3d MAE": kinematicErrorOutput.summary3D.jerkMAE,
        "velocity 2d MAE": kinematicErrorOutput.summary2D.velMAE,
        "accel 2d MAE": kinematicErrorOutput.summary2D.accelMAE,
        "jerk 2d MAE": kinematicErrorOutput.summary2D.jerkMAE,
    }
    return flattenedSummaries;
}

describe.concurrent("AllMetricsComparison", async () => {

    const tiktokClipPoses = await loadTikTokClipPoses();
    function getReferenceClip(segmentInfo: SegmentInfo) {
        return tiktokClipPoses.get(segmentInfo.danceName)?.[segmentInfo.clipNumber];
    }
    const tiktokWholePoses = await loadTiktokWholePoses();


    it.concurrent('study 1 processing', {
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