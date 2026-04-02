import fs from 'fs';
import path from 'path';
import { beforeAll, describe, it } from 'vitest';
import { PoseLandmarkIds } from '$lib/webcam/mediapipe-utils';
import {
	createSingleTrackMetricTrackFromEvaluationTrack,
	type SingleTrackMetricTrack
} from './MotionMetric';
import { Study } from './PoseDataTestFile';
import NetSpeedQuantifierMetric from './NetSpeedQuantifierMetric';
import NetSpeedMinimaQuantifierMetric from './NetSpeedMinimaQuantifierMetric';
import LimbExtensionQuantifierMetric from './LimbExtensionQuantifierMetric';
import HandExtensionExtremaQuantifierMetric from './HandExtensionExtremaQuantifierMetric';
import LeftVsRightLimbSpeedCorrelationQuantifierMetric from './LeftVsRightLimbSpeedCorrelationQuantifierMetric';
import {
	findStudyMetricFixture,
	loadStudyMetricFixturesContext,
	type StudyMetricFixture,
	type StudyMetricFixtureSelector
} from './testdata/studyMetricFixtures';
import {
	getMetricArtifactDirectory,
	motionMetricTimeSeriesArtifactsRoot,
	resetMotionMetricTimeSeriesArtifactsRoot,
	writeTimeSeriesCsv,
	writeTimeSeriesPlotHtml
} from './testdata/metricTimeSeriesArtifacts';

const QUANTIFIER_FIXTURE_SELECTIONS: StudyMetricFixtureSelector[] = [
	{
		study: Study.Study1_BySegment,
		userId: 4751,
		danceName: 'last-christmas',
		workflowId: '0079b262-7575-4ae7-a377-60e21070106e',
		clipNumber: 1
	},
	{
		study: Study.Study1_BySegment,
		userId: 4751,
		danceName: 'last-christmas',
		workflowId: '0079b262-7575-4ae7-a377-60e21070106e',
		clipNumber: 2
	}
];

function writeCompositePlotHtml(args: {
	outputDir: string;
	track: SingleTrackMetricTrack;
	leftSpeedRows: Record<string, unknown>[];
	rightSpeedRows: Record<string, unknown>[];
	correlationRows: Record<string, unknown>[];
	netSpeedRows: Record<string, unknown>[];
	minimaRows: Record<string, unknown>[];
	extensionRows: Record<string, unknown>[];
	extensionExtremaRows: Record<string, unknown>[];
}) {
	const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Motion Quantifiers</title>
  <script src="https://cdn.plot.ly/plotly-2.35.3.min.js"></script>
</head>
<body>
  <div id="speed" style="height: 360px;"></div>
  <div id="correlation" style="height: 240px;"></div>
  <div id="netSpeed" style="height: 300px;"></div>
  <div id="extension" style="height: 300px;"></div>
  <script>
    const leftSpeed = ${JSON.stringify(args.leftSpeedRows).replace(/</g, '\\u003c')};
    const rightSpeed = ${JSON.stringify(args.rightSpeedRows).replace(/</g, '\\u003c')};
    const correlation = ${JSON.stringify(args.correlationRows).replace(/</g, '\\u003c')};
    const netSpeed = ${JSON.stringify(args.netSpeedRows).replace(/</g, '\\u003c')};
    const minima = ${JSON.stringify(args.minimaRows).replace(/</g, '\\u003c')};
    const extension = ${JSON.stringify(args.extensionRows).replace(/</g, '\\u003c')};
    const extensionExtrema = ${JSON.stringify(args.extensionExtremaRows).replace(/</g, '\\u003c')};

    Plotly.newPlot('speed', [
      { x: leftSpeed.map(r => r.videoTimeSecs), y: leftSpeed.map(r => r.leftWristSpeed), type: 'scatter', mode: 'lines', name: 'leftWrist_relative' },
      { x: rightSpeed.map(r => r.videoTimeSecs), y: rightSpeed.map(r => r.rightWristSpeed), type: 'scatter', mode: 'lines', name: 'rightWrist_relative' },
    ], { yaxis: { title: 'Speeds' }, xaxis: { title: 'Time' } }, { responsive: true });

    Plotly.newPlot('correlation', [
      { x: correlation.map(r => r.segmentIndex), y: correlation.map(r => r.correlation), type: 'bar', name: 'Correlation' },
    ], { yaxis: { title: 'Correlation' }, xaxis: { title: 'Segment' } }, { responsive: true });

    Plotly.newPlot('netSpeed', [
      { x: netSpeed.map(r => r.videoTimeSecs), y: netSpeed.map(r => r.netSpeed), type: 'scatter', mode: 'lines', name: 'Net Speed' },
      { x: minima.map(r => r.videoTimeSecs), y: minima.map(r => r.extremumValue), type: 'scatter', mode: 'markers+text', text: minima.map(r => Number(r.videoTimeSecs).toFixed(2) + 's'), textposition: 'bottom center', name: 'Minima' },
    ], { yaxis: { title: 'Net Speed' }, xaxis: { title: 'Time' } }, { responsive: true });

    Plotly.newPlot('extension', [
      { x: extension.map(r => r.videoTimeSecs), y: extension.map(r => r.handExtension), type: 'scatter', mode: 'lines', name: 'Extension' },
      { x: extensionExtrema.map(r => r.videoTimeSecs), y: extensionExtrema.map(r => r.extremumValue), type: 'scatter', mode: 'markers+text', text: extensionExtrema.map(r => Number(r.videoTimeSecs).toFixed(2) + 's'), textposition: 'top center', marker: { color: extensionExtrema.map(r => r.extremumType === 'max' ? 'orange' : 'green') }, name: 'Extrema' },
    ], { yaxis: { title: 'Extension' }, xaxis: { title: 'Time' } }, { responsive: true });
  </script>
</body>
</html>`;

	fs.writeFileSync(path.join(args.outputDir, 'quantifier_composite.html'), html, 'utf8');
	return path.join(args.outputDir, 'quantifier_composite.html');
}

async function loadSelectedFixtures() {
	const context = await loadStudyMetricFixturesContext();
	return Promise.all(
		QUANTIFIER_FIXTURE_SELECTIONS.map((selection) => findStudyMetricFixture(context, selection))
	);
}

describe('AllQuantifiersTimeSeriesInvestigations', {}, async () => {
	const selectedFixtures = await loadSelectedFixtures();
	const testTimeout = 20 * 60 * 1000;

	beforeAll(() => {
		resetMotionMetricTimeSeriesArtifactsRoot();
	});

	it('loads hardcoded exact clips for quantifier investigations', ({ expect }) => {
		expect(selectedFixtures.every(Boolean)).toBe(true);
	});

	it(
		'exports csv and html artifacts for quantifier investigations',
		{ timeout: testTimeout },
		async ({ expect }) => {
			const fixtures = selectedFixtures.filter((fixture): fixture is StudyMetricFixture =>
				Boolean(fixture)
			);
			const producedClipIds = new Set<string>();

			for (const fixture of fixtures) {
				const track = createSingleTrackMetricTrackFromEvaluationTrack(fixture.track, 'user');
				const outputDir = getMetricArtifactDirectory('motion_quantifiers', fixture.clipId);
				producedClipIds.add(fixture.clipId);

				const leftSpeedMetric = new NetSpeedQuantifierMetric({
					dimension: '2d',
					includedLandmarks: [PoseLandmarkIds.leftWrist],
					seriesId: 'left_wrist_speed',
					valueKey: 'leftWristSpeed'
				});
				const rightSpeedMetric = new NetSpeedQuantifierMetric({
					dimension: '2d',
					includedLandmarks: [PoseLandmarkIds.rightWrist],
					seriesId: 'right_wrist_speed',
					valueKey: 'rightWristSpeed'
				});
				const netSpeedMetric = new NetSpeedQuantifierMetric({
					dimension: '2d',
					includedLandmarks: [PoseLandmarkIds.leftWrist, PoseLandmarkIds.rightWrist],
					seriesId: 'net_speed',
					valueKey: 'netSpeed'
				});
				const minimaMetric = new NetSpeedMinimaQuantifierMetric({
					dimension: '2d',
					includedLandmarks: [PoseLandmarkIds.leftWrist, PoseLandmarkIds.rightWrist],
					seriesId: 'net_speed',
					valueKey: 'netSpeed',
					windowRadiusFrames: 6
				});
				const handExtensionMetric = new LimbExtensionQuantifierMetric({
					dimension: '2d',
					includedLimbs: ['leftHand', 'rightHand'],
					seriesId: 'hand_extension',
					valueKey: 'handExtension'
				});
				const handExtremaMetric = new HandExtensionExtremaQuantifierMetric({
					dimension: '2d',
					windowRadiusFrames: 6
				});
				const boundaries = minimaMetric.getSegmentationBoundaries(track);
				const correlationMetric = new LeftVsRightLimbSpeedCorrelationQuantifierMetric({
					dimension: '2d',
					leftLandmarks: [PoseLandmarkIds.leftWrist],
					rightLandmarks: [PoseLandmarkIds.rightWrist],
					defaultSegmentBoundaries: boundaries
				});

				const leftSpeedSeries = leftSpeedMetric.quantify(track)[0];
				const rightSpeedSeries = rightSpeedMetric.quantify(track)[0];
				const netSpeedSeries = netSpeedMetric.quantify(track)[0];
				const minimaSeries = minimaMetric.quantify(track)[0];
				const correlationSeries = correlationMetric.quantify(track)[0];
				const extensionSeries = handExtensionMetric.quantify(track)[0];
				const extensionExtremaSeries = handExtremaMetric.quantify(track)[0];

				for (const series of [
					leftSpeedSeries,
					rightSpeedSeries,
					netSpeedSeries,
					minimaSeries,
					correlationSeries,
					extensionSeries,
					extensionExtremaSeries
				]) {
					const csvPath = writeTimeSeriesCsv(series, outputDir);
					const htmlPath = writeTimeSeriesPlotHtml(series as any, outputDir);
					expect(fs.existsSync(csvPath)).toBe(true);
					expect(fs.existsSync(htmlPath)).toBe(true);
				}

				const compositePath = writeCompositePlotHtml({
					outputDir,
					track,
					leftSpeedRows: leftSpeedSeries.rows,
					rightSpeedRows: rightSpeedSeries.rows,
					correlationRows: correlationSeries.rows,
					netSpeedRows: netSpeedSeries.rows,
					minimaRows: minimaSeries.rows,
					extensionRows: extensionSeries.rows,
					extensionExtremaRows: extensionExtremaSeries.rows
				});
				expect(fs.existsSync(compositePath)).toBe(true);
			}

			const quantifierRoot = path.join(motionMetricTimeSeriesArtifactsRoot, 'motion_quantifiers');
			expect(fs.existsSync(quantifierRoot)).toBe(true);
			expect(new Set(fs.readdirSync(quantifierRoot))).toEqual(producedClipIds);
		}
	);
});
