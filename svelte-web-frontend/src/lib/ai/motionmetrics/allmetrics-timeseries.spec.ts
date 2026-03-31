import fs from "fs";
import path from "path";
import { beforeAll, describe, it } from "vitest";
import type { LiveEvaluationMetric, MotionMetricTimeSeries, SummaryEvaluationMetric } from "./MotionMetric";
import Qijia2DPoseEvaluationMetric from "./Qijia2DPoseEvaluationMetric";
import Jules2DPoseEvaluationMetric from "./Jules2DPoseEvaluationMetric";
import Skeleton3DVectorAngleEvaluationMetric from "./Skeleton3DVectorAngleEvaluationMetric";
import TemporalAlignmentEvaluationMetric from "./TemporalAlignmentEvaluationMetric";
import KinematicErrorEvaluationMetric from "./KinematicErrorEvaluationMetric";
import { Study } from "./PoseDataTestFile";
import { runLiveEvaluationMetricOnTestTrack } from "./testdata/metricTestingUtils";
import {
    findStudyMetricFixture,
    loadStudyMetricFixturesContext,
    type StudyMetricFixture,
    type StudyMetricFixtureSelector,
} from "./testdata/studyMetricFixtures";
import {
    getMetricArtifactDirectory,
    motionMetricTimeSeriesArtifactsRoot,
    resetMotionMetricTimeSeriesArtifactsRoot,
    writeTimeSeriesCsv,
    writeTimeSeriesPlotHtml,
} from "./testdata/metricTimeSeriesArtifacts";

type TimeSeriesMetric =
    | LiveEvaluationMetric<any, any, any>
    | SummaryEvaluationMetric<any, any>;

const TIMESERIES_FIXTURE_SELECTIONS: StudyMetricFixtureSelector[] = [
    {
        study: Study.Study1_BySegment,
        userId: 4751,
        danceName: "last-christmas",
        workflowId: "0079b262-7575-4ae7-a377-60e21070106e",
        clipNumber: 1,
    },
    {
        study: Study.Study1_BySegment,
        userId: 4751,
        danceName: "last-christmas",
        workflowId: "0079b262-7575-4ae7-a377-60e21070106e",
        clipNumber: 2,
    },
    {
        study: Study.Study1_Whole,
        userId: 4751,
        danceName: "last-christmas",
        workflowId: "0079b262-7575-4ae7-a377-60e21070106e",
        clipNumber: -1,
    },
];

function isLiveMetric(metric: TimeSeriesMetric): metric is LiveEvaluationMetric<any, any, any> {
    return "computeMetric" in metric;
}

function collectMetricTimeSeries(metric: TimeSeriesMetric, fixture: StudyMetricFixture): MotionMetricTimeSeries[] {
    if (!metric.getTimeSeries) {
        return [];
    }

    if (isLiveMetric(metric)) {
        const { summary, metricHistory } = runLiveEvaluationMetricOnTestTrack(metric, fixture.track);
        return metric.getTimeSeries({
            track: fixture.track,
            trackHistory: fixture.trackHistory,
            summary,
            metricHistory,
        });
    }

    const summary = metric.summarizeMetric(fixture.trackHistory);
    return metric.getTimeSeries({
        track: fixture.track,
        trackHistory: fixture.trackHistory,
        summary,
    });
}

async function loadSelectedFixtures() {
    const context = await loadStudyMetricFixturesContext();
    return Promise.all(TIMESERIES_FIXTURE_SELECTIONS.map((selection) => findStudyMetricFixture(context, selection)));
}

describe("AllMetricsTimeSeriesInvestigations", {}, async () => {
    const selectedFixtures = await loadSelectedFixtures();
    const testTimeout = 20 * 60 * 1000;

    beforeAll(() => {
        resetMotionMetricTimeSeriesArtifactsRoot();
    });

    it("loads the exact allowlisted fixtures for investigations", async ({ expect }) => {
        expect(selectedFixtures).toHaveLength(TIMESERIES_FIXTURE_SELECTIONS.length);
        expect(selectedFixtures.every(Boolean)).toBe(true);
        expect(new Set(selectedFixtures.map((fixture) => fixture!.clipId)).size).toBe(TIMESERIES_FIXTURE_SELECTIONS.length);
    });

    it("exports time-series csv and html artifacts for opted-in metrics only", { timeout: testTimeout }, async ({ expect }) => {
        const fixtures = selectedFixtures.filter((fixture): fixture is StudyMetricFixture => Boolean(fixture));
        const metrics = [
            { metricName: "qijia2DPoseEvaluation", metric: new Qijia2DPoseEvaluationMetric() },
            { metricName: "jules2DPoseEvaluation", metric: new Jules2DPoseEvaluationMetric() },
            { metricName: "skeleton3DVectorAngleEvaluation", metric: new Skeleton3DVectorAngleEvaluationMetric() },
            { metricName: "temporalAlignmentEvaluation", metric: new TemporalAlignmentEvaluationMetric() },
        ] satisfies Array<{ metricName: string, metric: TimeSeriesMetric }>;

        const expectedClipIds = new Set(fixtures.map((fixture) => fixture.clipId));

        for (const { metricName, metric } of metrics) {
            const producedClipIds = new Set<string>();

            for (const fixture of fixtures) {
                const seriesCollection = collectMetricTimeSeries(metric, fixture);
                expect(seriesCollection.length).toBeGreaterThan(0);

                const outputDir = getMetricArtifactDirectory(metricName, fixture.clipId);
                producedClipIds.add(fixture.clipId);

                for (const series of seriesCollection) {
                    expect(series.rows.length).toBeGreaterThan(0);
                    expect(series.yKeys.length).toBeGreaterThan(0);

                    const csvPath = writeTimeSeriesCsv(series, outputDir);
                    const htmlPath = writeTimeSeriesPlotHtml(series, outputDir);

                    expect(fs.existsSync(csvPath)).toBe(true);
                    expect(fs.existsSync(htmlPath)).toBe(true);
                }
            }

            expect(producedClipIds).toEqual(expectedClipIds);

            const metricDir = path.join(motionMetricTimeSeriesArtifactsRoot, metricName);
            expect(fs.existsSync(metricDir)).toBe(true);
            expect(new Set(fs.readdirSync(metricDir))).toEqual(expectedClipIds);
        }
    });

    it("skips metrics without time-series hooks cleanly", { timeout: testTimeout }, async ({ expect }) => {
        const metric = new KinematicErrorEvaluationMetric();
        const fixture = selectedFixtures[0]!;

        const seriesCollection = collectMetricTimeSeries(metric, fixture);
        expect(seriesCollection).toEqual([]);

        const outputDir = getMetricArtifactDirectory("kinematicErrorEvaluation", fixture.clipId);
        expect(fs.existsSync(outputDir)).toBe(false);
    });
});
