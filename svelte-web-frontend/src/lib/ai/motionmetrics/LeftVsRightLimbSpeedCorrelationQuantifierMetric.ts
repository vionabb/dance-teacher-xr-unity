import type { MotionMetricTimeSeries, SingleTrackMetricTrack } from "./MotionMetric";
import CorrelationQuantifierMetric from "./CorrelationQuantifierMetric";
import NetSpeedQuantifierMetric from "./NetSpeedQuantifierMetric";

export type LeftVsRightLimbSpeedCorrelationQuantifierOptions = {
    dimension: "2d" | "3d",
    leftLandmarks: readonly number[],
    rightLandmarks: readonly number[],
    defaultSegmentBoundaries?: readonly number[],
};

export default class LeftVsRightLimbSpeedCorrelationQuantifierMetric {
    private readonly correlationMetric: CorrelationQuantifierMetric;

    constructor(opts: LeftVsRightLimbSpeedCorrelationQuantifierOptions) {
        const leftMetric = new NetSpeedQuantifierMetric({
            dimension: opts.dimension,
            includedLandmarks: opts.leftLandmarks,
            seriesId: "left_limb_speed",
            valueKey: "leftLimbSpeed",
            title: "Left limb speed",
        });
        const rightMetric = new NetSpeedQuantifierMetric({
            dimension: opts.dimension,
            includedLandmarks: opts.rightLandmarks,
            seriesId: "right_limb_speed",
            valueKey: "rightLimbSpeed",
            title: "Right limb speed",
        });
        this.correlationMetric = new CorrelationQuantifierMetric({
            metricA: leftMetric,
            metricB: rightMetric,
            seriesIdA: "left_limb_speed",
            seriesIdB: "right_limb_speed",
            valueKeyA: "leftLimbSpeed",
            valueKeyB: "rightLimbSpeed",
            defaultSegmentBoundaries: opts.defaultSegmentBoundaries,
            seriesId: "left_vs_right_limb_speed_correlation",
        });
    }

    quantify(track: Readonly<SingleTrackMetricTrack>): MotionMetricTimeSeries[] {
        return this.correlationMetric.quantify(track);
    }

    quantifyWithBoundaries(track: Readonly<SingleTrackMetricTrack>, segmentBoundaries: readonly number[]) {
        return this.correlationMetric.quantifyWithBoundaries(track, segmentBoundaries);
    }

    quantifySegmented(track: Readonly<SingleTrackMetricTrack>, segmentBoundaries: readonly number[]) {
        return this.correlationMetric.quantifySegmented(track, segmentBoundaries);
    }

    formatSummary(summary: Readonly<Array<number | null>>) {
        return this.correlationMetric.formatSummary(summary);
    }
}
