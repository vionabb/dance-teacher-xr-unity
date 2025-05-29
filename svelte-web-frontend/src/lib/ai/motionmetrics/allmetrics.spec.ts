import { afterAll, describe, it } from "vitest";
import { readFile, writeFile } from "fs/promises";
import fs from "fs";
import Papa from "papaparse";
import {
  loadPoses,
  OtherPoseSource,
  Study,
  type StudySegmentData,
  type SegmentInfo,
  type TiktokDanceClipData,
  loadTikTokClipPoses,
  loadTiktokWholePoses,
  getClipHumanRatings,
  loadHumanRatings,
  type HumanRating
} from "./PoseDataTestFile";
import {
  runLiveEvaluationMetricOnTestTrack,
  type TestTrack
} from "./testdata/metricTestingUtils";
import { dbPath, ensureMetricColumnInTable, exportCSV, loadDB, motionMetricsCsvPath, upsertMetricDbRow, type RowData } from "./testdata/metricdb";
import Qijia2DSkeletonSimilarityMetric from "./Qijia2DSkeletonSimilarityMetric";
import Jules2DSkeletonSimilarityMetric from "./Jules2DSkeletonSimilarityMetric";
import Skeleton3dVectorAngleSimilarityMetric from "./Skeleton3dVectorAngleSimilarityMetric";
import { fromAsync, getReferenceClip, takeAsnc } from "../EvaluationCommonUtils";
import TemporalAlignmentMetric from "./TemporalAlignmentMetric";
import Skeleton3DAngleDistanceDTW from "./Skeleton3DAngleDistanceDTW";
import KinematicErrorMetric from "./KinematicErrorMetric";
import type { TrackHistory } from "./MotionMetric";

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

type MetricRunner = (track: TestTrack, trackHistory: TrackHistory, ratings?: HumanRating | undefined) => Record<string, number>;

function runMetricOnClip(segmentData: StudySegmentData, referenceClip: TiktokDanceClipData, ratings: HumanRating | undefined, metric: MetricRunner) {

    const fps = 30
    const shortestClipLength = Math.min(segmentData.poses.length, referenceClip.poses.length);
    const testTrack: TestTrack = {
        id: `${segmentData.segmentInfo.userId}_${segmentData.segmentInfo.clipNumber}`,
        danceRelativeStem: segmentData.segmentInfo.danceName,
        segmentDescription: segmentData.segmentInfo.clipNumber.toString(),
        creationDate: "",
        trackDescription: segmentData.segmentInfo.danceName,
        videoFrameTimesInSecs: referenceClip.poses.map((_, i) => i / fps).slice(0, shortestClipLength),
        actualTimesInMs: referenceClip.poses.map((_, i) => i / (fps * segmentData.segmentInfo.performanceSpeed)).slice(0, shortestClipLength),
        ref2dPoses: referenceClip.poses.map((pose) => pose.pixelPose).slice(0, shortestClipLength),
        ref3dPoses: referenceClip.poses.map((pose) => pose.worldPose).slice(0, shortestClipLength),
        user2dPoses: segmentData.poses.map((pose) => pose.pixelPose).slice(0, shortestClipLength),
        user3dPoses: segmentData.poses.map((pose) => pose.worldPose).slice(0, shortestClipLength),
    }
    const trackHistory = createTrackHistoryForClips(segmentData, referenceClip);

    const result = metric(testTrack, trackHistory, ratings);
    return result;
}

describe("AllMetricsComparison", {}, async () => {

    const tiktokClipPoses = await loadTikTokClipPoses();
    const tiktokWholePoses = await loadTiktokWholePoses();
    const allRatings = await loadHumanRatings();
    const metricDb = await loadDB();

    async function updateDbWithMetric(metricName: string, metric: MetricRunner) {
        const allPoses = await loadPoses(Study.Study1, (clipInfo) => {
            const studyInfo = clipInfo as SegmentInfo;
            return studyInfo.study1phase == "performance"; // skip slowed down clips
        });
        
        const n = Infinity; // number of clips to process (i.e. all of them)

        //  process a clip, returning the formatted summary
        function processClip(studySegmentData: StudySegmentData, ratings: HumanRating | undefined) {
            const referenceClip = getReferenceClip(studySegmentData.segmentInfo, tiktokClipPoses);
            if (!referenceClip) return undefined;
        
            const summary = runMetricOnClip(studySegmentData, referenceClip, ratings, metric);
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
                
                const summary = processClip(segmentData, ratings);

                // yield information for the generator consumer to use
                // to update the db with
                yield { 
                    rowData: {
                        ...segmentData.segmentInfo,
                        frameCount: segmentData.poses.length,
                        // humanRating: ratings.avgRatingsPercentile, // scale from 0-3 to 0-1
                        // rating1: ratings.rating1,
                        // rating2: ratings.rating2,
                        // rating3: ratings.rating3,
                    },
                    metricData: summary,
                };
            }
        }
        
        
        // Update db with this new metric row
        let clipCount = 0;
        let hasEnsuredColumnsInTable = false;

        for await (const clipData of processClips()) {
            if (!clipData.metricData) { continue; }

            if (!hasEnsuredColumnsInTable) {
                for(const key in clipData.metricData) {
                   ensureMetricColumnInTable(metricDb, key);
                }
                hasEnsuredColumnsInTable = true;
            }

            clipCount++;
            const rowData: RowData = {
                userId: clipData.rowData.userId,
                danceId: clipData.rowData.danceName,
                studyName: Study.Study1,
                workflowId: clipData.rowData.workflowId,
                clipNumber: clipData.rowData.clipNumber,
                collectionId: clipData.rowData.study1phase ?? "N/A",
                danceName: clipData.rowData.danceName,
                condition: clipData.rowData.condition,
                performanceSpeed: clipData.rowData.performanceSpeed,
                frameCount: clipData.rowData.frameCount
            }
            await upsertMetricDbRow(metricDb, rowData, clipData.metricData);
            console.log(`\t[${clipCount}]\tUpdated db with ${metricName} for ${rowData.userId}_${rowData.danceName}_${rowData.clipNumber}`); 
        }        
    }
    // Set high test timeout for each test
    const testTimeout = 20 * 60 * 1000; // 20 minutes in milliseconds
    it('angle3dDTWOutput', { timeout: testTimeout }, async ({ expect }) => {
        const metric = new Skeleton3DAngleDistanceDTW();
        const metricRunner: MetricRunner = (track: TestTrack, trackHistory: TrackHistory) => {
            const summary = metric.summarizeMetric(trackHistory);
            return {
                invalidFrameCount: summary.invalidFramesCount,
                invalidPercent: summary.invalidPercent,
                angle3D_dtw_distance: summary.dtwDistance,
                angle3D_dtw_dist_avg: summary.dtwDistance / summary.dtwPath.length,
                angle3D_warping_factor: summary.warpingFactor,
            }
        }
        await updateDbWithMetric('anle3dDTW', metricRunner);
    });

    it('qijia2d', { timeout: testTimeout }, async ({ expect }) => {
        const metric = new Qijia2DSkeletonSimilarityMetric();
        const metricRunner: MetricRunner = (track: TestTrack, trackHistory: TrackHistory) => {
            const summary = runLiveEvaluationMetricOnTestTrack(metric, track);
            return {
                qijia2d: summary.summary.overallScore / 5, // scale from 0-5 to 0-1
            }
        }
        await updateDbWithMetric('qijia2d', metricRunner);
    });

    it('jules2d', { timeout: testTimeout }, async ({ expect }) => {
        const metric = new Jules2DSkeletonSimilarityMetric();
        const metricRunner: MetricRunner = (track: TestTrack, trackHistory: TrackHistory) => {
            const summary = runLiveEvaluationMetricOnTestTrack(metric, track);
            return {
                // We want the output to be an accuracy score, with 1 being the best and 0 being the worst.
                // Jules2D returns a dissimilarity score, so we reverse it to get an accuracy score.
                jules2d: 1 - summary.summary.avgDissimilarity,
            }
        }
        await updateDbWithMetric('jules2d', metricRunner);
    });

    it('vectorAngle3D', { timeout: testTimeout }, async ({ expect }) => {
        const metric = new Skeleton3dVectorAngleSimilarityMetric();
        const metricRunner: MetricRunner = (track: TestTrack, trackHistory: TrackHistory) => {
            const summary = runLiveEvaluationMetricOnTestTrack(metric, track);
            return {
                vectorAngle3D: summary.summary.overallScore,
            }
        }
        await updateDbWithMetric('vectorAngle3D', metricRunner);
    });

    it('temporalAlignment', { timeout: testTimeout }, async ({ expect }) => {
        const metric = new TemporalAlignmentMetric();
        const metricRunner: MetricRunner = (track: TestTrack, trackHistory: TrackHistory) => {
            const summary = metric.summarizeMetric(trackHistory);
            return {
                temporalAlignmentSecs: summary.temporalOffsetSecs,
            }
        }
        await updateDbWithMetric('temporalAlignment', metricRunner);
    });

    it('kinematicsError', { timeout: testTimeout }, async ({ expect }) => {
        const metric = new KinematicErrorMetric();
        const metricRunner: MetricRunner = (track: TestTrack, trackHistory: TrackHistory) => {
            const summary = metric.summarizeMetric(trackHistory);
            return {
                "velocity_3d_MAE": summary.summary3D.velMAE ?? NaN,
                "accel_3d_MAE": summary.summary3D.accelMAE ?? NaN,
                "jerk_3d_MAE": summary.summary3D.jerkMAE ?? NaN,
                "velocity_2d_MAE": summary.summary2D.velMAE ?? NaN,
                "accel_2d_MAE": summary.summary2D.accelMAE ?? NaN,
                "jerk_2d_MAE": summary.summary2D.jerkMAE ?? NaN,
            }
        }
        await updateDbWithMetric('kinematicsError', metricRunner);
    });

    it('humanRating', { timeout: testTimeout }, async ({ expect }) => {
        const metric = new KinematicErrorMetric();
        const metricRunner: MetricRunner = (track: TestTrack, trackHistory: TrackHistory, ratings: HumanRating | undefined) => {
            return {
                humanRating: ratings?.avgRatingPercentile ?? NaN,
                rating1: ratings?.rating1 ?? NaN,
                rating2: ratings?.rating2 ?? NaN,
                rating3: ratings?.rating3 ?? NaN,
            }
        }
        await updateDbWithMetric('humanRating', metricRunner);
    });


    // Export the database to a CSV file
    it('exportDb', {}, async ({ expect }) => {
        // remove existing CSV file if it exists
        if (fs.existsSync(motionMetricsCsvPath)) {
            console.log("Removing existing csv file at ", motionMetricsCsvPath);
            fs.unlinkSync(motionMetricsCsvPath);
        }
        await exportCSV(metricDb);
        console.log("Exported db to CSV: ", motionMetricsCsvPath);
        expect(fs.existsSync(motionMetricsCsvPath)).toBe(true);
    });

    afterAll(() => {
        // Close the database connection to prevent resource leaks
        if (metricDb) {
            metricDb.close();
            console.log("Database connection closed");
        }
    });
});