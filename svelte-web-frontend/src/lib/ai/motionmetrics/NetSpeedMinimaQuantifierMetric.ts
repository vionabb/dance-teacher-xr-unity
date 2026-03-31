import type { MotionMetricTimeSeries, SingleTrackMetricTrack } from "./MotionMetric";
import ExtremaQuantifierMetric from "./ExtremaQuantifierMetric";
import NetSpeedQuantifierMetric, { type NetSpeedQuantifierOptions } from "./NetSpeedQuantifierMetric";

export type NetSpeedMinimaQuantifierOptions = NetSpeedQuantifierOptions & {
    windowRadiusFrames: number,
};

export default class NetSpeedMinimaQuantifierMetric {
    private readonly speedMetric: NetSpeedQuantifierMetric;
    private readonly extremaMetric: ExtremaQuantifierMetric;

    constructor(opts: NetSpeedMinimaQuantifierOptions) {
        this.speedMetric = new NetSpeedQuantifierMetric(opts);
        this.extremaMetric = new ExtremaQuantifierMetric({
            sourceMetric: this.speedMetric,
            sourceSeriesId: opts.seriesId ?? "net_speed",
            sourceValueKey: opts.valueKey ?? "netSpeed",
            mode: "min",
            windowRadiusFrames: opts.windowRadiusFrames,
            seriesId: "net_speed_minima",
        });
    }

    quantify(track: Readonly<SingleTrackMetricTrack>): MotionMetricTimeSeries[] {
        return this.extremaMetric.quantify(track);
    }

    quantifySegmented(track: Readonly<SingleTrackMetricTrack>, segmentBoundaries: readonly number[]) {
        return this.extremaMetric.quantifySegmented(track, segmentBoundaries);
    }

    getSegmentationBoundaries(track: Readonly<SingleTrackMetricTrack>) {
        return this.extremaMetric.getSegmentationBoundaries(track);
    }

    formatSummary(summary: Readonly<Array<number | null>>) {
        return this.extremaMetric.formatSummary(summary);
    }
}
