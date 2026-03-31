import {
    DerivedSeriesMotionQuantifierMetric,
    type MotionMetricTimeSeries,
    type QuantifierDerivedRow,
    type SingleTrackMetricTrack
} from "./MotionMetric";
import { getFrameAlignedSeriesValues, getSeriesById, getSegmentIndexForFrame } from "./quantifierUtils";

export type ExtremaMode = "min" | "max" | "both";

export type ExtremaQuantifierOptions = {
    sourceMetric: {
        quantify(track: Readonly<SingleTrackMetricTrack>): MotionMetricTimeSeries[],
    },
    sourceSeriesId?: string,
    sourceValueKey?: string,
    mode: ExtremaMode,
    windowRadiusFrames: number,
    seriesId?: string,
};

export default class ExtremaQuantifierMetric extends DerivedSeriesMotionQuantifierMetric {
    constructor(private opts: ExtremaQuantifierOptions) {
        super();
    }

    private isSelectedExtremum(values: number[], index: number, mode: "min" | "max") {
        const current = values[index];
        const start = Math.max(0, index - this.opts.windowRadiusFrames);
        const end = Math.min(values.length - 1, index + this.opts.windowRadiusFrames);
        for (let i = start; i <= end; i++) {
            if (i === index) continue;
            if (mode === "min" && values[i] < current) return false;
            if (mode === "max" && values[i] > current) return false;
        }
        return true;
    }

    quantify(track: Readonly<SingleTrackMetricTrack>): MotionMetricTimeSeries<QuantifierDerivedRow>[] {
        const sourceSeries = getSeriesById(this.opts.sourceMetric.quantify(track), this.opts.sourceSeriesId);
        const values = getFrameAlignedSeriesValues(sourceSeries, this.opts.sourceValueKey);
        const rows = [] as QuantifierDerivedRow[];

        const modes = this.opts.mode === "both" ? ["min", "max"] as const : [this.opts.mode];
        for (const mode of modes) {
            for (let index = 1; index < values.length - 1; index++) {
                const prev = values[index - 1].value;
                const current = values[index].value;
                const next = values[index + 1].value;
                if (!Number.isFinite(prev) || !Number.isFinite(current) || !Number.isFinite(next)) {
                    continue;
                }
                const isLocal = mode === "min"
                    ? current <= prev && current <= next
                    : current >= prev && current >= next;
                if (!isLocal || !this.isSelectedExtremum(values.map((entry) => entry.value), index, mode)) {
                    continue;
                }
                rows.push({
                    sourceFrameStart: values[index].frameIndex,
                    sourceFrameEnd: values[index].frameIndex,
                    videoTimeSecs: values[index].videoTimeSecs,
                    extremumValue: current,
                    extremumType: mode,
                });
            }
        }

        rows.sort((a, b) => a.sourceFrameStart - b.sourceFrameStart);

        return [{
            seriesId: this.opts.seriesId ?? "extrema",
            title: "Extrema",
            xKey: "videoTimeSecs",
            yKeys: ["extremumValue"],
            xLabel: "Video time (s)",
            yLabel: "Value",
            rows,
        }];
    }

    quantifySegmented(track: Readonly<SingleTrackMetricTrack>, segmentBoundaries: readonly number[]) {
        const rows = this.quantify(track)[0]?.rows ?? [];
        try {
            return this.countRowsPerSegment(rows, track.videoFrameTimesInSecs.length, segmentBoundaries);
        } catch {
            return new Array(segmentBoundaries.length + 1).fill(null);
        }
    }

    getSegmentationBoundaries(track: Readonly<SingleTrackMetricTrack>) {
        const frameCount = track.videoFrameTimesInSecs.length;
        return this.quantify(track)[0].rows
            .map((row) => row.sourceFrameStart)
            .filter((frameIndex) => frameIndex > 0 && frameIndex < frameCount)
            .sort((a, b) => a - b);
    }

    formatSummary(summary: Readonly<Array<number | null>>) {
        return Object.fromEntries(summary.map((value, index) => [`segment_${index}_extremaCount`, value]));
    }
}
