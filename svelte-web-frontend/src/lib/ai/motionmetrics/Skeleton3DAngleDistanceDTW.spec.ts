import { describe, it } from "vitest";
import { createTrackHistoryForClips, fromAsync, getReferenceClip, takeAsnc } from "../EvaluationCommonUtils";
import { loadPoses, loadTikTokClipPoses, loadTiktokWholePoses, OtherPoseSource, Study, type SegmentInfo, type StudySegmentData, type TikTokClipInfo, type TiktokDanceClipData } from "./PoseDataTestFile";
import Skeleton3DAngleDistanceDTW from "./Skeleton3DAngleDistanceDTW";

function runDTWMetricOnClips(userData: StudySegmentData, referenceClip: TiktokDanceClipData) {
    const metric = new Skeleton3DAngleDistanceDTW();
    const trackHistory = createTrackHistoryForClips(userData, referenceClip);
    const summary = metric.summarizeMetric(trackHistory);
    return metric.formatSummary(summary);
}


describe('Skeleton3DAngleDistanceDTW', {}, async () => {

    const tiktokClipPoses = await loadTikTokClipPoses();
    const tiktokWholePoses = await loadTiktokWholePoses();

    it.concurrent('can load the tiktok clip pose files', {}, async ({ expect }) => {
        const allposesgenerator = await loadPoses(OtherPoseSource.TikTokClips);
        const allposes = await fromAsync(allposesgenerator, (poseData: any, i: number) => {
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

        const allPoses = await loadPoses(Study.Study2_BySegment);

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
            const referenceClip = getReferenceClip(poseData.segmentInfo, tiktokClipPoses);
            expect(poseData).toBeTruthy();
            expect(referenceClip).toBeTruthy();
            if (!referenceClip) return;

            const formatSummary = runDTWMetricOnClips(poseData, referenceClip);
            expect(formatSummary).toBeTruthy();
            console.log(formatSummary);
        });
    });
});
