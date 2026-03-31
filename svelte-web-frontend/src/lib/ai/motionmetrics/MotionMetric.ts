import type { Pose2DPixelLandmarks, Pose3DLandmarkFrame } from "$lib/webcam/mediapipe-utils";

export type EvaluationMetricTrack = {
    id: string,
    danceRelativeStem: string,
    segmentDescription: string,
    creationDate: string,
    videoFrameTimesInSecs: number[],
    actualTimesInMs: number[],
    trackDescription: string,
    user2dPoses: Pose2DPixelLandmarks[],
    user3dPoses: Pose3DLandmarkFrame[],
    ref2dPoses: Pose2DPixelLandmarks[],
    ref3dPoses: Pose3DLandmarkFrame[],
};

export type SingleTrackMetricTrack = {
    id: string,
    danceRelativeStem: string,
    segmentDescription: string,
    creationDate: string,
    videoFrameTimesInSecs: number[],
    actualTimesInMs: number[],
    trackDescription: string,
    poses2d: Pose2DPixelLandmarks[],
    poses3d: Pose3DLandmarkFrame[],
};

export type EvaluationTrackHistory = {
    videoFrameTimesInSecs: number[],
    actualTimesInMs: number[],
    ref3DFrameHistory: Pose3DLandmarkFrame[],
    ref2DFrameHistory: Pose2DPixelLandmarks[],
    user3DFrameHistory: Pose3DLandmarkFrame[],
    user2DFrameHistory: Pose2DPixelLandmarks[],
};

export type SingleTrackHistory = {
    videoFrameTimesInSecs: number[],
    actualTimesInMs: number[],
    frameHistory2D: Pose2DPixelLandmarks[],
    frameHistory3D: Pose3DLandmarkFrame[],
};

export type MotionMetricTimeSeriesRow = Record<string, number | string | null>;

export type QuantifierFrameAlignedRow = MotionMetricTimeSeriesRow & {
    frameIndex: number,
};

export type QuantifierDerivedRow = MotionMetricTimeSeriesRow & {
    sourceFrameStart: number,
    sourceFrameEnd: number,
};

export type QuantifierTimeSeriesRow = QuantifierFrameAlignedRow | QuantifierDerivedRow;

export type MotionMetricTimeSeries<RowType extends MotionMetricTimeSeriesRow = MotionMetricTimeSeriesRow> = {
    seriesId: string,
    title?: string,
    xKey: string,
    yKeys: string[],
    xLabel?: string,
    yLabel?: string,
    rows: RowType[],
};

export type EvaluationMetricTimeSeriesContext<SummaryType, FrameResultType = never> = {
    track: Readonly<EvaluationMetricTrack>,
    trackHistory: Readonly<EvaluationTrackHistory>,
    summary: Readonly<SummaryType>,
    metricHistory?: Readonly<FrameResultType[]>,
};

export type QuantifierTimeSeriesContext<QuantifiedRow extends QuantifierTimeSeriesRow = QuantifierTimeSeriesRow> = {
    track: Readonly<SingleTrackMetricTrack>,
    history: Readonly<SingleTrackHistory>,
    timeSeries: MotionMetricTimeSeries<QuantifiedRow>[],
};

export type SegmentFrameRange = {
    startFrame: number,
    endFrameExclusive: number,
};

export interface BaseMetric<SummaryType, FormattedSummaryType extends Record<string, number | string | null>> {
    formatSummary(
        summary: Readonly<SummaryType>
    ): FormattedSummaryType;
}

export function createSingleTrackHistory(track: Readonly<SingleTrackMetricTrack>): SingleTrackHistory {
    return {
        videoFrameTimesInSecs: [...track.videoFrameTimesInSecs],
        actualTimesInMs: [...track.actualTimesInMs],
        frameHistory2D: [...track.poses2d],
        frameHistory3D: [...track.poses3d],
    };
}

export function createSingleTrackMetricTrackFromEvaluationTrack(
    track: Readonly<EvaluationMetricTrack>,
    source: "user" | "reference",
): SingleTrackMetricTrack {
    return {
        id: `${track.id}-${source}`,
        danceRelativeStem: track.danceRelativeStem,
        segmentDescription: track.segmentDescription,
        creationDate: track.creationDate,
        videoFrameTimesInSecs: [...track.videoFrameTimesInSecs],
        actualTimesInMs: [...track.actualTimesInMs],
        trackDescription: `${track.trackDescription}-${source}`,
        poses2d: source === "user" ? [...track.user2dPoses] : [...track.ref2dPoses],
        poses3d: source === "user" ? [...track.user3dPoses] : [...track.ref3dPoses],
    };
}

export function getSegmentFrameRanges(frameCount: number, segmentBoundaries: readonly number[]): SegmentFrameRange[] {
    if (!Number.isInteger(frameCount) || frameCount < 0) {
        throw new Error(`frameCount must be a non-negative integer, got ${frameCount}`);
    }

    const ranges = [] as SegmentFrameRange[];
    const normalizedBoundaries = [...segmentBoundaries];

    for (let i = 0; i < normalizedBoundaries.length; i++) {
        const boundary = normalizedBoundaries[i];
        if (!Number.isInteger(boundary)) {
            throw new Error(`segment boundary ${boundary} is not an integer`);
        }
        if (boundary < 1 || boundary > frameCount - 1) {
            throw new Error(`segment boundary ${boundary} must be in [1, ${frameCount - 1}]`);
        }
        if (i > 0 && boundary <= normalizedBoundaries[i - 1]) {
            throw new Error(`segment boundaries must be strictly increasing; found ${normalizedBoundaries[i - 1]} then ${boundary}`);
        }
    }

    const allBoundaries = [0, ...normalizedBoundaries, frameCount];
    for (let i = 0; i < allBoundaries.length - 1; i++) {
        const startFrame = allBoundaries[i];
        const endFrameExclusive = allBoundaries[i + 1];
        if (endFrameExclusive <= startFrame) {
            throw new Error(`segment ${i} is empty`);
        }
        ranges.push({ startFrame, endFrameExclusive });
    }

    return ranges;
}

export function tryGetSegmentFrameRanges(frameCount: number, segmentBoundaries: readonly number[]) {
    try {
        return getSegmentFrameRanges(frameCount, segmentBoundaries);
    } catch {
        return null;
    }
}

export function aggregateSegmentedValues(
    values: readonly number[],
    segmentBoundaries: readonly number[],
    aggregator: (segmentValues: number[], range: SegmentFrameRange) => number | null,
): Array<number | null> {
    const ranges = tryGetSegmentFrameRanges(values.length, segmentBoundaries);
    if (!ranges) {
        return segmentBoundaries.length === 0 ? [null] : new Array(segmentBoundaries.length + 1).fill(null);
    }

    return ranges.map((range) => {
        const segmentValues = values
            .slice(range.startFrame, range.endFrameExclusive)
            .filter((value) => Number.isFinite(value));
        if (segmentValues.length === 0) {
            return null;
        }
        return aggregator(segmentValues, range);
    });
}

export function getMeanOfFiniteValues(values: readonly number[]) {
    const finiteValues = values.filter((value) => Number.isFinite(value));
    if (finiteValues.length === 0) {
        return null;
    }
    return finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length;
}

export interface LiveEvaluationMetric<FrameResultType, SummaryType, FormattedSummaryType extends Record<string, number | string | null>> extends BaseMetric<SummaryType, FormattedSummaryType> {
    computeMetric(
        history: Readonly<EvaluationTrackHistory>,
        metricHistory: Readonly<FrameResultType[]>,
        videoFrameTimeInSecs: number,
        actualTimesInMs: number,
        user2dPose: Readonly<Pose2DPixelLandmarks>,
        user3dPose: Readonly<Pose3DLandmarkFrame>,
        ref2dPose: Readonly<Pose2DPixelLandmarks>,
        ref3dPose: Readonly<Pose3DLandmarkFrame>,
    ): FrameResultType;

    summarizeMetric(
        history: Readonly<EvaluationTrackHistory>,
        metricHistory: Readonly<FrameResultType[]>
    ): SummaryType;

    evaluateSegmented(
        history: Readonly<EvaluationTrackHistory>,
        metricHistory: Readonly<FrameResultType[]>,
        segmentBoundaries: readonly number[],
    ): Array<number | null>;

    getTimeSeries?(
        context: EvaluationMetricTimeSeriesContext<SummaryType, FrameResultType>
    ): MotionMetricTimeSeries[];
}

export interface SummaryEvaluationMetric<SummaryType, FormattedSummaryType extends Record<string, number | string | null>> extends BaseMetric<SummaryType, FormattedSummaryType> {
    summarizeMetric(
        history: EvaluationTrackHistory,
        debugFilepathRoot?: string,
    ): SummaryType;

    evaluateSegmented(
        history: Readonly<EvaluationTrackHistory>,
        segmentBoundaries: readonly number[],
    ): Array<number | null>;

    plotSummary?(
        element: HTMLElement,
        summary: SummaryType
    ): Promise<void>;

    getTimeSeries?(
        context: EvaluationMetricTimeSeriesContext<SummaryType>
    ): MotionMetricTimeSeries[];
}

export interface MotionQuantifierMetric<
    QuantifiedRow extends QuantifierTimeSeriesRow = QuantifierTimeSeriesRow,
    FormattedSummaryType extends Record<string, number | string | null> = Record<string, number | string | null>
> extends BaseMetric<Array<number | null>, FormattedSummaryType> {
    quantify(
        track: Readonly<SingleTrackMetricTrack>,
    ): MotionMetricTimeSeries<QuantifiedRow>[];

    quantifySegmented(
        track: Readonly<SingleTrackMetricTrack>,
        segmentBoundaries: readonly number[],
    ): Array<number | null>;

    getTimeSeries?(
        context: QuantifierTimeSeriesContext<QuantifiedRow>
    ): MotionMetricTimeSeries<QuantifiedRow>[];
}

export abstract class FrameAlignedMotionQuantifierMetric<
    QuantifiedRow extends QuantifierFrameAlignedRow = QuantifierFrameAlignedRow,
    FormattedSummaryType extends Record<string, number | string | null> = Record<string, number | string | null>
> implements MotionQuantifierMetric<QuantifiedRow, FormattedSummaryType> {
    abstract quantify(track: Readonly<SingleTrackMetricTrack>): MotionMetricTimeSeries<QuantifiedRow>[];
    abstract quantifySegmented(track: Readonly<SingleTrackMetricTrack>, segmentBoundaries: readonly number[]): Array<number | null>;
    abstract formatSummary(summary: Readonly<Array<number | null>>): FormattedSummaryType;

    protected aggregateFrameAlignedSeries(
        rows: readonly QuantifiedRow[],
        valueKey: string,
        trackFrameCount: number,
        segmentBoundaries: readonly number[],
        aggregator: (values: number[], range: SegmentFrameRange) => number | null,
    ) {
        const values = new Array<number>(trackFrameCount).fill(NaN);
        rows.forEach((row) => {
            const frameIndex = row.frameIndex;
            const rawValue = row[valueKey];
            if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= trackFrameCount) {
                return;
            }
            if (typeof rawValue === "number") {
                values[frameIndex] = rawValue;
            }
        });
        return aggregateSegmentedValues(values, segmentBoundaries, aggregator);
    }
}

export abstract class DerivedSeriesMotionQuantifierMetric<
    QuantifiedRow extends QuantifierDerivedRow = QuantifierDerivedRow,
    FormattedSummaryType extends Record<string, number | string | null> = Record<string, number | string | null>
> implements MotionQuantifierMetric<QuantifiedRow, FormattedSummaryType> {
    abstract quantify(track: Readonly<SingleTrackMetricTrack>): MotionMetricTimeSeries<QuantifiedRow>[];
    abstract quantifySegmented(track: Readonly<SingleTrackMetricTrack>, segmentBoundaries: readonly number[]): Array<number | null>;
    abstract formatSummary(summary: Readonly<Array<number | null>>): FormattedSummaryType;

    protected countRowsPerSegment(
        rows: readonly QuantifiedRow[],
        trackFrameCount: number,
        segmentBoundaries: readonly number[],
    ) {
        const ranges = tryGetSegmentFrameRanges(trackFrameCount, segmentBoundaries);
        if (!ranges) {
            return segmentBoundaries.length === 0 ? [null] : new Array(segmentBoundaries.length + 1).fill(null);
        }

        return ranges.map((range) => rows.filter((row) =>
            row.sourceFrameStart >= range.startFrame &&
            row.sourceFrameStart < range.endFrameExclusive
        ).length);
    }
}
