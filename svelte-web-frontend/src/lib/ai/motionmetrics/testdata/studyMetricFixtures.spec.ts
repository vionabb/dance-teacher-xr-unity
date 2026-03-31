import { describe, it } from "vitest";
import { Study } from "../PoseDataTestFile";
import {
    buildTestTrackForStudyClip,
    buildTrackHistoryForStudyClip,
    findStudyMetricFixture,
    generateStudyMetricFixtures,
    loadStudyMetricFixturesContext,
} from "./studyMetricFixtures";

describe("studyMetricFixtures", {}, async () => {
    const context = await loadStudyMetricFixturesContext();
    const testTimeout = 60 * 1000;

    it("builds track and track history for an exact rated segmented clip", { timeout: testTimeout }, async ({ expect }) => {
        const fixture = await findStudyMetricFixture(context, {
            study: Study.Study1_BySegment,
            userId: 4751,
            danceName: "last-christmas",
            workflowId: "0079b262-7575-4ae7-a377-60e21070106e",
            clipNumber: 1,
        });

        expect(fixture).toBeTruthy();
        if (!fixture) return;

        const track = buildTestTrackForStudyClip(fixture.segmentData, fixture.referencePoses);
        const trackHistory = buildTrackHistoryForStudyClip(fixture.segmentData, fixture.referencePoses);

        expect(fixture.ratings).toBeTruthy();
        expect(track.danceRelativeStem).toBe("last-christmas");
        expect(track.segmentDescription).toBe("1");
        expect(trackHistory.user2DFrameHistory.length).toBeGreaterThan(0);
        expect(trackHistory.user2DFrameHistory.length).toBe(track.user2dPoses.length);
        expect(trackHistory.ref2DFrameHistory.length).toBe(track.ref2dPoses.length);
    });

    it("iterates fixtures with ratings and stable clip identities", { timeout: testTimeout }, async ({ expect }) => {
        const fixtures = [] as Awaited<ReturnType<typeof findStudyMetricFixture>>[];

        for await (const fixture of generateStudyMetricFixtures(context, { requireRatings: true, limit: 3 })) {
            fixtures.push(fixture);
        }

        expect(fixtures.length).toBe(3);
        expect(fixtures.every((fixture) => fixture?.ratings)).toBe(true);
        expect(fixtures.every((fixture) => fixture?.clipId.includes("user"))).toBe(true);
        expect(fixtures.every((fixture) => fixture?.identity.workflowId.length)).toBe(true);
    });
});
