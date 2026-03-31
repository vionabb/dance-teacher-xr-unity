import { getSegmentFrameRanges, type MotionMetricTimeSeries, type QuantifierDerivedRow, type SingleTrackMetricTrack } from "./MotionMetric";
import { getFrameAlignedSeriesValues, getSeriesById, pearsonCorrelation } from "./quantifierUtils";

export type CorrelationQuantifierOptions = {
    metricA: {
        quantify(track: Readonly<SingleTrackMetricTrack>): MotionMetricTimeSeries[],
    },
    metricB: {
        quantify(track: Readonly<SingleTrackMetricTrack>): MotionMetricTimeSeries[],
    },
    seriesIdA?: string,
    seriesIdB?: string,
    valueKeyA?: string,
    valueKeyB?: string,
    defaultSegmentBoundaries?: readonly number[],
    seriesId?: string,
};

export default class CorrelationQuantifierMetric {
    constructor(private opts: CorrelationQuantifierOptions) {}

    quantify(track: Readonly<SingleTrackMetricTrack>) {
        return this.quantifyWithBoundaries(track, this.opts.defaultSegmentBoundaries ?? []);
    }

    quantifyWithBoundaries(track: Readonly<SingleTrackMetricTrack>, segmentBoundaries: readonly number[]) {
        const seriesA = getSeriesById(this.opts.metricA.quantify(track), this.opts.seriesIdA);
        const seriesB = getSeriesById(this.opts.metricB.quantify(track), this.opts.seriesIdB);
        const valuesA = getFrameAlignedSeriesValues(seriesA, this.opts.valueKeyA);
        const valuesB = getFrameAlignedSeriesValues(seriesB, this.opts.valueKeyB);

        const rows = getSegmentFrameRanges(track.videoFrameTimesInSecs.length, segmentBoundaries).map((range, segmentIndex) => {
            const segmentValuesA = valuesA
                .filter((entry) => entry.frameIndex >= range.startFrame && entry.frameIndex < range.endFrameExclusive)
                .map((entry) => entry.value);
            const segmentValuesB = valuesB
                .filter((entry) => entry.frameIndex >= range.startFrame && entry.frameIndex < range.endFrameExclusive)
                .map((entry) => entry.value);
            const segmentCorrelation = pearsonCorrelation(segmentValuesA, segmentValuesB);
            return {
                sourceFrameStart: range.startFrame,
                sourceFrameEnd: range.endFrameExclusive - 1,
                segmentIndex,
                correlation: segmentCorrelation,
            } satisfies QuantifierDerivedRow;
        });

        return [{
            seriesId: this.opts.seriesId ?? "segment_correlation",
            title: "Segment correlation",
            xKey: "segmentIndex",
            yKeys: ["correlation"],
            xLabel: "Segment",
            yLabel: "Correlation",
            rows,
        }];
    }

    quantifySegmented(track: Readonly<SingleTrackMetricTrack>, segmentBoundaries: readonly number[]) {
        return this.quantifyWithBoundaries(track, segmentBoundaries)[0].rows.map((row) => {
            const value = row.correlation;
            return typeof value === "number" ? value : null;
        });
    }

    formatSummary(summary: Readonly<Array<number | null>>) {
        return Object.fromEntries(summary.map((value, index) => [`segment_${index}_correlation`, value]));
    }
}
