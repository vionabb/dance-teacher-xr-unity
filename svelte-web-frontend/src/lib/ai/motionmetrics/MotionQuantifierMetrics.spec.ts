import { describe, it } from 'vitest';
import { PoseLandmarkIds } from '$lib/webcam/mediapipe-utils';
import {
	FrameAlignedMotionQuantifierMetric,
	getSegmentFrameRanges,
	type MotionMetricTimeSeries,
	type QuantifierFrameAlignedRow,
	type SingleTrackMetricTrack
} from './MotionMetric';
import BodySymmetryQuantifierMetric from './BodySymmetryQuantifierMetric';
import NetSpeedQuantifierMetric from './NetSpeedQuantifierMetric';
import ExtremaQuantifierMetric from './ExtremaQuantifierMetric';
import CorrelationQuantifierMetric from './CorrelationQuantifierMetric';
import LimbExtensionQuantifierMetric from './LimbExtensionQuantifierMetric';
import NetSpeedMinimaQuantifierMetric from './NetSpeedMinimaQuantifierMetric';
import LeftVsRightLimbSpeedCorrelationQuantifierMetric from './LeftVsRightLimbSpeedCorrelationQuantifierMetric';
import HandExtensionExtremaQuantifierMetric from './HandExtensionExtremaQuantifierMetric';
import {
	createEmptyPose2D,
	createEmptyPose3D,
	createTrackFromFrames,
	setBilateralTorsoPose2D,
	setBilateralTorsoPose3D
} from './testdata/singleTrackTestingUtils';

class FakeFrameSeriesMetric extends FrameAlignedMotionQuantifierMetric {
	constructor(
		private values: number[],
		private valueKey = 'value',
		private seriesId = 'fake'
	) {
		super();
	}

	quantify(
		_track: Readonly<SingleTrackMetricTrack>
	): MotionMetricTimeSeries<QuantifierFrameAlignedRow>[] {
		return [
			{
				seriesId: this.seriesId,
				title: this.seriesId,
				xKey: 'frameIndex',
				yKeys: [this.valueKey],
				rows: this.values.map((value, frameIndex) => ({ frameIndex, [this.valueKey]: value }))
			}
		];
	}

	quantifySegmented(track: Readonly<SingleTrackMetricTrack>, segmentBoundaries: readonly number[]) {
		return this.aggregateFrameAlignedSeries(
			this.quantify(track)[0].rows,
			this.valueKey,
			this.values.length,
			segmentBoundaries,
			(values) => values.reduce((sum, value) => sum + value, 0) / values.length
		);
	}

	formatSummary(summary: Readonly<Array<number | null>>) {
		return Object.fromEntries(summary.map((value, index) => [`segment_${index}`, value]));
	}
}

describe('MotionMetric segmentation helper', () => {
	it('returns a whole-track segment for empty boundaries', ({ expect }) => {
		expect(getSegmentFrameRanges(5, [])).toEqual([{ startFrame: 0, endFrameExclusive: 5 }]);
	});

	it('returns strict increasing segment slices', ({ expect }) => {
		expect(getSegmentFrameRanges(8, [2, 5])).toEqual([
			{ startFrame: 0, endFrameExclusive: 2 },
			{ startFrame: 2, endFrameExclusive: 5 },
			{ startFrame: 5, endFrameExclusive: 8 }
		]);
	});

	it('rejects invalid boundaries', ({ expect }) => {
		expect(() => getSegmentFrameRanges(5, [0, 3])).toThrow();
		expect(() => getSegmentFrameRanges(5, [3, 3])).toThrow();
		expect(() => getSegmentFrameRanges(5, [6])).toThrow();
	});
});

describe('Motion quantifier metrics', () => {
	it('body symmetry is higher for symmetric 2D/3D poses', ({ expect }) => {
		const sym2d = setBilateralTorsoPose2D(createEmptyPose2D());
		const asym2d = setBilateralTorsoPose2D(createEmptyPose2D());
		asym2d[PoseLandmarkIds.rightWrist].x = 5;

		const sym3d = setBilateralTorsoPose3D(createEmptyPose3D());
		const asym3d = setBilateralTorsoPose3D(createEmptyPose3D());
		asym3d[PoseLandmarkIds.rightWrist].x = 5;

		const track2d = createTrackFromFrames([
			{ timeSecs: 0, pose2d: sym2d, pose3d: sym3d },
			{ timeSecs: 1, pose2d: asym2d, pose3d: asym3d }
		]);
		const metric2d = new BodySymmetryQuantifierMetric({ dimension: '2d' });
		const metric3d = new BodySymmetryQuantifierMetric({ dimension: '3d' });

		const scores2d = metric2d.quantify(track2d)[0].rows.map((row) => row.bodySymmetry as number);
		const scores3d = metric3d.quantify(track2d)[0].rows.map((row) => row.bodySymmetry as number);

		expect(scores2d[0]).toBeGreaterThan(scores2d[1]);
		expect(scores3d[0]).toBeGreaterThan(scores3d[1]);
	});

	it('net speed returns frame-aligned values for configured landmarks', ({ expect }) => {
		const poseA = setBilateralTorsoPose2D(createEmptyPose2D());
		const poseB = setBilateralTorsoPose2D(createEmptyPose2D());
		poseB[PoseLandmarkIds.leftWrist].x += 2;
		const poseC = setBilateralTorsoPose2D(createEmptyPose2D());
		poseC[PoseLandmarkIds.leftWrist].x += 5;
		const track = createTrackFromFrames([
			{ timeSecs: 0, pose2d: poseA, pose3d: createEmptyPose3D() },
			{ timeSecs: 1, pose2d: poseB, pose3d: createEmptyPose3D() },
			{ timeSecs: 2, pose2d: poseC, pose3d: createEmptyPose3D() }
		]);
		const metric = new NetSpeedQuantifierMetric({
			dimension: '2d',
			includedLandmarks: [PoseLandmarkIds.leftWrist]
		});
		const values = metric.quantify(track)[0].rows.map((row) => row.netSpeed as number);
		expect(values).toEqual([0, 2, 3]);
	});

	it('extrema window suppression keeps stronger extrema only', ({ expect }) => {
		const track = createTrackFromFrames(
			new Array(7)
				.fill(0)
				.map((_, i) => ({ timeSecs: i, pose2d: createEmptyPose2D(), pose3d: createEmptyPose3D() }))
		);
		const metric = new ExtremaQuantifierMetric({
			sourceMetric: new FakeFrameSeriesMetric([3, 1, 2, 0, 4, 3, 5]),
			mode: 'min',
			windowRadiusFrames: 2
		});
		const rows = metric.quantify(track)[0].rows;
		expect(rows.map((row) => row.sourceFrameStart)).toEqual([3]);
	});

	it('correlation returns positive, negative, and null cases', ({ expect }) => {
		const track = createTrackFromFrames(
			new Array(6)
				.fill(0)
				.map((_, i) => ({ timeSecs: i, pose2d: createEmptyPose2D(), pose3d: createEmptyPose3D() }))
		);
		const positiveMetric = new CorrelationQuantifierMetric({
			metricA: new FakeFrameSeriesMetric([1, 2, 3, 4, 5, 6], 'a', 'a'),
			metricB: new FakeFrameSeriesMetric([2, 4, 6, 8, 10, 12], 'b', 'b'),
			seriesIdA: 'a',
			seriesIdB: 'b',
			valueKeyA: 'a',
			valueKeyB: 'b'
		});
		const negativeMetric = new CorrelationQuantifierMetric({
			metricA: new FakeFrameSeriesMetric([1, 2, 3, 4], 'a', 'a'),
			metricB: new FakeFrameSeriesMetric([4, 3, 2, 1], 'b', 'b'),
			seriesIdA: 'a',
			seriesIdB: 'b',
			valueKeyA: 'a',
			valueKeyB: 'b'
		});
		const nullMetric = new CorrelationQuantifierMetric({
			metricA: new FakeFrameSeriesMetric([1, 1, 1], 'a', 'a'),
			metricB: new FakeFrameSeriesMetric([2, 2, 2], 'b', 'b'),
			seriesIdA: 'a',
			seriesIdB: 'b',
			valueKeyA: 'a',
			valueKeyB: 'b'
		});

		expect(positiveMetric.quantify(track)[0].rows[0].correlation).toBeCloseTo(1);
		expect(
			negativeMetric.quantify(
				createTrackFromFrames(new Array(4).fill(0).map((_, i) => ({ timeSecs: i })) as any)
			)[0].rows[0].correlation
		).toBeCloseTo(-1);
		expect(
			nullMetric.quantify(
				createTrackFromFrames(new Array(3).fill(0).map((_, i) => ({ timeSecs: i })) as any)
			)[0].rows[0].correlation
		).toBeNull();
	});

	it('limb extension increases with greater displacement', ({ expect }) => {
		const poseNear = setBilateralTorsoPose2D(createEmptyPose2D());
		poseNear[PoseLandmarkIds.leftWrist].x = -1.5;
		poseNear[PoseLandmarkIds.rightWrist].x = 1.5;
		const poseFar = setBilateralTorsoPose2D(createEmptyPose2D());
		poseFar[PoseLandmarkIds.leftWrist].x = -4;
		poseFar[PoseLandmarkIds.rightWrist].x = 4;
		const track = createTrackFromFrames([
			{ timeSecs: 0, pose2d: poseNear, pose3d: createEmptyPose3D() },
			{ timeSecs: 1, pose2d: poseFar, pose3d: createEmptyPose3D() }
		]);
		const metric = new LimbExtensionQuantifierMetric({
			dimension: '2d',
			includedLimbs: ['leftHand', 'rightHand']
		});
		const values = metric.quantify(track)[0].rows.map((row) => row.extension as number);
		expect(values[1]).toBeGreaterThan(values[0]);
	});

	it('composite quantifiers produce usable boundaries and segment outputs', ({ expect }) => {
		const poseFrames = [0, 1, 2, 3, 4, 5].map((timeSecs) => {
			const pose = setBilateralTorsoPose2D(createEmptyPose2D());
			pose[PoseLandmarkIds.leftWrist].x += [0, 3, 1, 4, 1, 3][timeSecs];
			pose[PoseLandmarkIds.rightWrist].x -= [0, 3, 1, 4, 1, 3][timeSecs];
			return { timeSecs, pose2d: pose, pose3d: createEmptyPose3D() };
		});
		const track = createTrackFromFrames(poseFrames);

		const minimaMetric = new NetSpeedMinimaQuantifierMetric({
			dimension: '2d',
			includedLandmarks: [PoseLandmarkIds.leftWrist, PoseLandmarkIds.rightWrist],
			windowRadiusFrames: 1
		});
		const boundaries = minimaMetric.getSegmentationBoundaries(track);
		expect(boundaries.length).toBeGreaterThan(0);

		const correlationMetric = new LeftVsRightLimbSpeedCorrelationQuantifierMetric({
			dimension: '2d',
			leftLandmarks: [PoseLandmarkIds.leftWrist],
			rightLandmarks: [PoseLandmarkIds.rightWrist]
		});
		const correlations = correlationMetric.quantifySegmented(track, boundaries);
		expect(correlations).toHaveLength(boundaries.length + 1);

		const extensionExtrema = new HandExtensionExtremaQuantifierMetric({
			dimension: '2d',
			windowRadiusFrames: 1
		});
		const extremaRows = extensionExtrema.quantify(track)[0].rows;
		expect(extremaRows.every((row) => typeof row.sourceFrameStart === 'number')).toBe(true);
		expect(extremaRows.some((row) => row.extremumType === 'min')).toBe(true);
		expect(extremaRows.some((row) => row.extremumType === 'max')).toBe(true);
	});
});
