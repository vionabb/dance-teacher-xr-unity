import { getMagnitude2DVec, getMagnitude3DVec } from '../EvaluationCommonUtils';
import {
	FrameAlignedMotionQuantifierMetric,
	getMeanOfFiniteValues,
	type MotionMetricTimeSeries,
	type QuantifierFrameAlignedRow,
	type SingleTrackMetricTrack
} from './MotionMetric';

export type NetSpeedQuantifierOptions = {
	dimension: '2d' | '3d';
	includedLandmarks: readonly number[];
	seriesId?: string;
	title?: string;
	valueKey?: string;
};

export default class NetSpeedQuantifierMetric extends FrameAlignedMotionQuantifierMetric {
	constructor(private opts: NetSpeedQuantifierOptions) {
		super();
	}

	private get valueKey() {
		return this.opts.valueKey ?? 'netSpeed';
	}

	quantify(
		track: Readonly<SingleTrackMetricTrack>
	): MotionMetricTimeSeries<QuantifierFrameAlignedRow>[] {
		const rows = track.videoFrameTimesInSecs.map((videoTimeSecs, frameIndex) => {
			if (frameIndex === 0) {
				return {
					frameIndex,
					videoTimeSecs,
					[this.valueKey]: 0
				};
			}

			const deltaTimeSecs =
				track.videoFrameTimesInSecs[frameIndex] - track.videoFrameTimesInSecs[frameIndex - 1];
			if (!(deltaTimeSecs > 0)) {
				return {
					frameIndex,
					videoTimeSecs,
					[this.valueKey]: 0
				};
			}

			const currentPose =
				this.opts.dimension === '2d' ? track.poses2d[frameIndex] : track.poses3d[frameIndex];
			const previousPose =
				this.opts.dimension === '2d'
					? track.poses2d[frameIndex - 1]
					: track.poses3d[frameIndex - 1];

			const landmarkSpeeds = this.opts.includedLandmarks.map((landmarkIndex) => {
				const current = currentPose[landmarkIndex];
				const previous = previousPose[landmarkIndex];
				if (this.opts.dimension === '2d') {
					return (
						getMagnitude2DVec([current.x - previous.x, current.y - previous.y]) / deltaTimeSecs
					);
				}
				// 3D mode only runs on poses with z coordinates.
				const current3D = current as { x: number; y: number; z: number };
				const previous3D = previous as { x: number; y: number; z: number };
				return (
					getMagnitude3DVec([
						current3D.x - previous3D.x,
						current3D.y - previous3D.y,
						current3D.z - previous3D.z
					]) / deltaTimeSecs
				);
			});

			return {
				frameIndex,
				videoTimeSecs,
				[this.valueKey]: getMeanOfFiniteValues(landmarkSpeeds) ?? 0
			};
		});

		return [
			{
				seriesId: this.opts.seriesId ?? 'net_speed',
				title: this.opts.title ?? 'Net speed',
				xKey: 'videoTimeSecs',
				yKeys: [this.valueKey],
				xLabel: 'Video time (s)',
				yLabel: 'Speed',
				rows
			}
		];
	}

	quantifySegmented(track: Readonly<SingleTrackMetricTrack>, segmentBoundaries: readonly number[]) {
		const series = this.quantify(track)[0];
		return this.aggregateFrameAlignedSeries(
			series.rows,
			this.valueKey,
			track.videoFrameTimesInSecs.length,
			segmentBoundaries,
			(values) => getMeanOfFiniteValues(values)
		);
	}

	formatSummary(summary: Readonly<Array<number | null>>) {
		return Object.fromEntries(summary.map((value, index) => [`segment_${index}`, value]));
	}
}
