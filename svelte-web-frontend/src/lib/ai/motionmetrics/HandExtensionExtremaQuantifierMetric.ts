import type { MotionMetricTimeSeries, SingleTrackMetricTrack } from "./MotionMetric";
import ExtremaQuantifierMetric from "./ExtremaQuantifierMetric";
import LimbExtensionQuantifierMetric, { type LimbExtensionQuantifierOptions } from "./LimbExtensionQuantifierMetric";

export type HandExtensionExtremaQuantifierOptions = Omit<LimbExtensionQuantifierOptions, "includedLimbs"> & {
    windowRadiusFrames: number,
};

export default class HandExtensionExtremaQuantifierMetric {
    private readonly extensionMetric: LimbExtensionQuantifierMetric;
    private readonly extremaMetric: ExtremaQuantifierMetric;

    constructor(opts: HandExtensionExtremaQuantifierOptions) {
        this.extensionMetric = new LimbExtensionQuantifierMetric({
            ...opts,
            includedLimbs: ["leftHand", "rightHand"],
            valueKey: "handExtension",
            seriesId: "hand_extension",
        });
        this.extremaMetric = new ExtremaQuantifierMetric({
            sourceMetric: this.extensionMetric,
            sourceSeriesId: "hand_extension",
            sourceValueKey: "handExtension",
            mode: "both",
            windowRadiusFrames: opts.windowRadiusFrames,
            seriesId: "hand_extension_extrema",
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
