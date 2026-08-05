import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, it } from 'vitest';
import Papa from 'papaparse';
import {
	GetPixelLandmarksFromPose2DRow,
	GetPixelLandmarksFromPose3DRow,
	loadPoseInformation
} from '$lib/data/dances-store';
import { PoseLandmarkIds } from '$lib/webcam/mediapipe-utils';
import BodySymmetryQuantifierMetric from './BodySymmetryQuantifierMetric';
import HandExtensionExtremaQuantifierMetric from './HandExtensionExtremaQuantifierMetric';
import LeftVsRightLimbSpeedCorrelationQuantifierMetric from './LeftVsRightLimbSpeedCorrelationQuantifierMetric';
import LimbExtensionQuantifierMetric from './LimbExtensionQuantifierMetric';
import NetSpeedMinimaQuantifierMetric from './NetSpeedMinimaQuantifierMetric';
import NetSpeedQuantifierMetric from './NetSpeedQuantifierMetric';
import type { MotionMetricTimeSeries, SingleTrackMetricTrack } from './MotionMetric';

type SmokeManifest = {
	cases: Record<
		string,
		{
			video: string;
			stages: {
				database: string;
				pose_raw: string[];
			};
		}
	>;
};

type SmokeQuantifier = {
	name: string;
	metric: {
		quantify(track: Readonly<SingleTrackMetricTrack>): MotionMetricTimeSeries[];
		quantifySegmented(
			track: Readonly<SingleTrackMetricTrack>,
			segmentBoundaries: readonly number[]
		): Array<number | null>;
		formatSummary(summary: Readonly<Array<number | null>>): Record<string, number | string | null>;
	};
};

const REPOSITORY_ROOT = path.resolve(process.cwd(), '..');
const SMOKE_ROOT = path.join(REPOSITORY_ROOT, 'data', 'test-fixtures', 'smoketest');
const SMOKE_CASE_NAME = 'attention_zoom_out';

function loadSmokeManifest(): SmokeManifest {
	return JSON.parse(
		fs.readFileSync(path.join(SMOKE_ROOT, 'manifest.json'), 'utf8')
	) as SmokeManifest;
}

async function loadSingleInputSmokeTrack(): Promise<SingleTrackMetricTrack> {
	const smokeCase = loadSmokeManifest().cases[SMOKE_CASE_NAME];
	if (!smokeCase) {
		throw new Error(`Missing smoke-test case ${SMOKE_CASE_NAME}`);
	}

	const databasePath = path.join(SMOKE_ROOT, smokeCase.stages.database);
	const databaseRows = Papa.parse<Record<string, unknown>>(fs.readFileSync(databasePath, 'utf8'), {
		header: true,
		dynamicTyping: true
	}).data;
	const fps = Number(databaseRows[0]?.fps);
	if (!(fps > 0)) {
		throw new Error(`Smoke-test case ${SMOKE_CASE_NAME} has no positive FPS`);
	}

	const pose2dRelativePath = smokeCase.stages.pose_raw.find((value) =>
		value.endsWith('.pose2d.raw.csv')
	);
	const pose3dRelativePath = smokeCase.stages.pose_raw.find((value) =>
		value.endsWith('.holisticdata.raw.csv')
	);
	if (!pose2dRelativePath || !pose3dRelativePath) {
		throw new Error(`Smoke-test case ${SMOKE_CASE_NAME} is missing 2D or 3D pose data`);
	}

	const [pose2d, pose3d] = await Promise.all([
		loadPoseInformation(
			path.join(SMOKE_ROOT, pose2dRelativePath),
			fps,
			false,
			GetPixelLandmarksFromPose2DRow
		),
		loadPoseInformation(
			path.join(SMOKE_ROOT, pose3dRelativePath),
			fps,
			false,
			GetPixelLandmarksFromPose3DRow
		)
	]);

	if (pose2d.poses.length !== pose3d.poses.length) {
		throw new Error(
			`Smoke-test pose modalities differ in length: ${pose2d.poses.length} vs ${pose3d.poses.length}`
		);
	}

	const frameCount = pose2d.poses.length;
	return {
		id: SMOKE_CASE_NAME,
		danceRelativeStem: SMOKE_CASE_NAME,
		segmentDescription: 'whole',
		creationDate: '',
		videoFrameTimesInSecs: Array.from({ length: frameCount }, (_, index) => index / fps),
		actualTimesInMs: Array.from({ length: frameCount }, (_, index) => (index / fps) * 1000),
		trackDescription: 'single-input frontend quantifier smoke fixture',
		poses2d: pose2d.poses,
		poses3d: pose3d.poses
	};
}

function createSmokeQuantifiers(): SmokeQuantifier[] {
	const bilateralHands = [PoseLandmarkIds.leftWrist, PoseLandmarkIds.rightWrist];
	return [
		{
			name: 'body symmetry 2D',
			metric: new BodySymmetryQuantifierMetric({ dimension: '2d' })
		},
		{
			name: 'body symmetry 3D',
			metric: new BodySymmetryQuantifierMetric({ dimension: '3d' })
		},
		{
			name: 'net speed 2D',
			metric: new NetSpeedQuantifierMetric({
				dimension: '2d',
				includedLandmarks: bilateralHands
			})
		},
		{
			name: 'net speed 3D',
			metric: new NetSpeedQuantifierMetric({
				dimension: '3d',
				includedLandmarks: bilateralHands
			})
		},
		{
			name: 'net speed minima 2D',
			metric: new NetSpeedMinimaQuantifierMetric({
				dimension: '2d',
				includedLandmarks: bilateralHands,
				windowRadiusFrames: 6
			})
		},
		{
			name: 'net speed minima 3D',
			metric: new NetSpeedMinimaQuantifierMetric({
				dimension: '3d',
				includedLandmarks: bilateralHands,
				windowRadiusFrames: 6
			})
		},
		{
			name: 'limb extension 2D',
			metric: new LimbExtensionQuantifierMetric({
				dimension: '2d',
				includedLimbs: ['leftHand', 'rightHand']
			})
		},
		{
			name: 'limb extension 3D',
			metric: new LimbExtensionQuantifierMetric({
				dimension: '3d',
				includedLimbs: ['leftHand', 'rightHand']
			})
		},
		{
			name: 'hand extension extrema 2D',
			metric: new HandExtensionExtremaQuantifierMetric({
				dimension: '2d',
				windowRadiusFrames: 6
			})
		},
		{
			name: 'hand extension extrema 3D',
			metric: new HandExtensionExtremaQuantifierMetric({
				dimension: '3d',
				windowRadiusFrames: 6
			})
		},
		{
			name: 'left versus right speed correlation 2D',
			metric: new LeftVsRightLimbSpeedCorrelationQuantifierMetric({
				dimension: '2d',
				leftLandmarks: [PoseLandmarkIds.leftWrist],
				rightLandmarks: [PoseLandmarkIds.rightWrist]
			})
		},
		{
			name: 'left versus right speed correlation 3D',
			metric: new LeftVsRightLimbSpeedCorrelationQuantifierMetric({
				dimension: '3d',
				leftLandmarks: [PoseLandmarkIds.leftWrist],
				rightLandmarks: [PoseLandmarkIds.rightWrist]
			})
		}
	];
}

function assertFiniteSeries(series: MotionMetricTimeSeries[]) {
	if (series.length === 0) {
		throw new Error('Quantifier returned no time series');
	}

	const seriesIds = new Set(series.map((item) => item.seriesId));
	if (seriesIds.size !== series.length) {
		throw new Error('Quantifier returned duplicate series IDs');
	}

	for (const item of series) {
		if (item.rows.length === 0) {
			throw new Error(`Quantifier series ${item.seriesId} has no rows`);
		}
		for (const row of item.rows) {
			const xValue = row[item.xKey];
			if (typeof xValue !== 'number' || !Number.isFinite(xValue)) {
				throw new Error(`Quantifier series ${item.seriesId} has an invalid x value`);
			}
			for (const yKey of item.yKeys) {
				const value = row[yKey];
				if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
					throw new Error(`Quantifier series ${item.seriesId} has an invalid ${yKey} value`);
				}
			}
		}
	}
}

describe('Frontend single-input quantifier smoke tests', () => {
	let track: SingleTrackMetricTrack;
	let segmentBoundaries: number[];

	beforeAll(async () => {
		track = await loadSingleInputSmokeTrack();
		const frameCount = track.videoFrameTimesInSecs.length;
		segmentBoundaries = [Math.floor(frameCount / 3), Math.floor((frameCount * 2) / 3)];
	});

	it('loads the shared example video pose fixture as one input track', ({ expect }) => {
		expect(track.videoFrameTimesInSecs.length).toBeGreaterThan(100);
		expect(track.videoFrameTimesInSecs.length).toBe(track.poses2d.length);
		expect(track.videoFrameTimesInSecs.length).toBe(track.poses3d.length);
		expect(track.poses2d[0]).toHaveLength(33);
		expect(track.poses3d[0]).toHaveLength(33);
	});

	for (const { name, metric } of createSmokeQuantifiers()) {
		it(`${name} returns valid series and segmented summaries`, ({ expect }) => {
			const series = metric.quantify(track);
			assertFiniteSeries(series);

			const segmentedSummary = metric.quantifySegmented(track, segmentBoundaries);
			expect(segmentedSummary).toHaveLength(segmentBoundaries.length + 1);
			expect(() => metric.formatSummary(segmentedSummary)).not.toThrow();
		});
	}

	it('reports non-zero motion for the moving example fixture', ({ expect }) => {
		const metric = new NetSpeedQuantifierMetric({
			dimension: '2d',
			includedLandmarks: [PoseLandmarkIds.leftWrist, PoseLandmarkIds.rightWrist]
		});
		const speedValues = metric.quantify(track)[0].rows.map((row) => row.netSpeed);
		expect(speedValues.some((value) => typeof value === 'number' && value > 0)).toBe(true);
	});
});
