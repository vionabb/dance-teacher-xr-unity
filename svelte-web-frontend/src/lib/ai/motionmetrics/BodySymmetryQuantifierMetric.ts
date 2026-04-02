import {
	FrameAlignedMotionQuantifierMetric,
	getMeanOfFiniteValues,
	type MotionMetricTimeSeries,
	type QuantifierFrameAlignedRow,
	type SingleTrackMetricTrack
} from './MotionMetric';
import {
	distance2D,
	distance3D,
	getStandardSymmetryPairs,
	getSymmetryAxis2D,
	getSymmetryAxis3D,
	getTrackScale2D,
	getTrackScale3D,
	reflectPointAcrossLine3D
} from './quantifierUtils';

export type BodySymmetryQuantifierOptions = {
	dimension: '2d' | '3d';
	seriesId?: string;
};

export default class BodySymmetryQuantifierMetric extends FrameAlignedMotionQuantifierMetric {
	constructor(private opts: BodySymmetryQuantifierOptions) {
		super();
	}

	quantify(
		track: Readonly<SingleTrackMetricTrack>
	): MotionMetricTimeSeries<QuantifierFrameAlignedRow>[] {
		const symmetryPairs = getStandardSymmetryPairs();
		const trackScale =
			this.opts.dimension === '2d' ? getTrackScale2D(track) : getTrackScale3D(track);

		const rows = track.videoFrameTimesInSecs.map((videoTimeSecs, frameIndex) => {
			const pairScores = symmetryPairs.map(([leftIndex, rightIndex]) => {
				if (this.opts.dimension === '2d') {
					const pose = track.poses2d[frameIndex];
					const axis = getSymmetryAxis2D(pose);
					const left = pose[leftIndex];
					const right = pose[rightIndex];
					const midpoint = {
						x: 2 * axis.hipCenter.x - left.x,
						y: left.y
					};
					const distance = distance2D(midpoint, right);
					const linePenalty = Math.abs(
						distance2D(left, axis.hipCenter) - distance2D(right, axis.hipCenter)
					);
					return 1 / (1 + (distance + linePenalty) / Math.max(trackScale, 1e-6));
				}

				const pose = track.poses3d[frameIndex];
				const axis = getSymmetryAxis3D(pose);
				const reflected = reflectPointAcrossLine3D(pose[leftIndex], axis.hipCenter, axis.neckBase);
				const distance = distance3D(reflected, pose[rightIndex]);
				return 1 / (1 + distance / Math.max(trackScale, 1e-6));
			});

			return {
				frameIndex,
				videoTimeSecs,
				bodySymmetry: getMeanOfFiniteValues(pairScores) ?? 0
			};
		});

		return [
			{
				seriesId: this.opts.seriesId ?? `body_symmetry_${this.opts.dimension}`,
				title: `Body symmetry (${this.opts.dimension})`,
				xKey: 'videoTimeSecs',
				yKeys: ['bodySymmetry'],
				xLabel: 'Video time (s)',
				yLabel: 'Symmetry',
				rows
			}
		];
	}

	quantifySegmented(track: Readonly<SingleTrackMetricTrack>, segmentBoundaries: readonly number[]) {
		const series = this.quantify(track)[0];
		return this.aggregateFrameAlignedSeries(
			series.rows,
			'bodySymmetry',
			track.videoFrameTimesInSecs.length,
			segmentBoundaries,
			(values) => getMeanOfFiniteValues(values)
		);
	}

	formatSummary(summary: Readonly<Array<number | null>>) {
		return Object.fromEntries(summary.map((value, index) => [`segment_${index}`, value]));
	}
}
