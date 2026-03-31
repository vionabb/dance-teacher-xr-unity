import type { Pose2DPixelLandmarks, Pose3DLandmarkFrame } from "$lib/webcam/mediapipe-utils";
import { PoseLandmarkIds } from "$lib/webcam/mediapipe-utils";
import { Get2DScaleIndicator, Get3DScaleIndicator, getMagnitude2DVec, getMagnitude3DVec } from "../EvaluationCommonUtils";
import { getSegmentFrameRanges, type MotionMetricTimeSeries, type QuantifierFrameAlignedRow, type QuantifierTimeSeriesRow, type SingleTrackMetricTrack } from "./MotionMetric";

export function getMidpoint2D(a: { x: number, y: number }, b: { x: number, y: number }) {
    return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
    };
}

export function getMidpoint3D(a: { x: number, y: number, z: number }, b: { x: number, y: number, z: number }) {
    return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        z: (a.z + b.z) / 2,
    };
}

export function distancePointToLine2D(point: { x: number, y: number }, lineStart: { x: number, y: number }, lineEnd: { x: number, y: number }) {
    const lineDx = lineEnd.x - lineStart.x;
    const lineDy = lineEnd.y - lineStart.y;
    const denominator = Math.sqrt(lineDx ** 2 + lineDy ** 2);
    if (denominator === 0) {
        return 0;
    }
    return Math.abs(lineDy * point.x - lineDx * point.y + lineEnd.x * lineStart.y - lineEnd.y * lineStart.x) / denominator;
}

export function projectPointOntoLine3D(point: { x: number, y: number, z: number }, lineStart: { x: number, y: number, z: number }, lineEnd: { x: number, y: number, z: number }) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const dz = lineEnd.z - lineStart.z;
    const denom = dx * dx + dy * dy + dz * dz;
    if (denom === 0) {
        return lineStart;
    }
    const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy + (point.z - lineStart.z) * dz) / denom;
    return {
        x: lineStart.x + t * dx,
        y: lineStart.y + t * dy,
        z: lineStart.z + t * dz,
    };
}

export function reflectPointAcrossLine3D(point: { x: number, y: number, z: number }, lineStart: { x: number, y: number, z: number }, lineEnd: { x: number, y: number, z: number }) {
    const projection = projectPointOntoLine3D(point, lineStart, lineEnd);
    return {
        x: 2 * projection.x - point.x,
        y: 2 * projection.y - point.y,
        z: 2 * projection.z - point.z,
    };
}

export function getSymmetryAxis2D(pose: Readonly<Pose2DPixelLandmarks>) {
    const hipCenter = getMidpoint2D(pose[PoseLandmarkIds.leftHip], pose[PoseLandmarkIds.rightHip]);
    const neckBase = getMidpoint2D(pose[PoseLandmarkIds.leftShoulder], pose[PoseLandmarkIds.rightShoulder]);
    return { hipCenter, neckBase };
}

export function getSymmetryAxis3D(pose: Readonly<Pose3DLandmarkFrame>) {
    const hipCenter = getMidpoint3D(pose[PoseLandmarkIds.leftHip], pose[PoseLandmarkIds.rightHip]);
    const neckBase = getMidpoint3D(pose[PoseLandmarkIds.leftShoulder], pose[PoseLandmarkIds.rightShoulder]);
    return { hipCenter, neckBase };
}

export function getTrackScale2D(track: Readonly<SingleTrackMetricTrack>) {
    const scales = track.poses2d.map((pose) => Get2DScaleIndicator(pose)).filter((x) => Number.isFinite(x) && x > 0);
    return scales.length > 0 ? scales.reduce((sum, x) => sum + x, 0) / scales.length : 1;
}

export function getTrackScale3D(track: Readonly<SingleTrackMetricTrack>) {
    const scales = track.poses3d.map((pose) => Get3DScaleIndicator(pose)).filter((x) => Number.isFinite(x) && x > 0);
    return scales.length > 0 ? scales.reduce((sum, x) => sum + x, 0) / scales.length : 1;
}

export function getSeriesById<RowType extends QuantifierTimeSeriesRow>(seriesCollection: MotionMetricTimeSeries<RowType>[], seriesId?: string) {
    if (seriesCollection.length === 0) {
        throw new Error("Expected at least one time series");
    }
    if (!seriesId) {
        return seriesCollection[0];
    }
    const series = seriesCollection.find((entry) => entry.seriesId === seriesId);
    if (!series) {
        throw new Error(`Unable to find series '${seriesId}'`);
    }
    return series;
}

export function getFrameAlignedRows(series: MotionMetricTimeSeries): QuantifierFrameAlignedRow[] {
    return series.rows.filter((row): row is QuantifierFrameAlignedRow => typeof (row as QuantifierFrameAlignedRow).frameIndex === "number");
}

export function getFrameAlignedSeriesValues(series: MotionMetricTimeSeries, valueKey?: string) {
    const resolvedValueKey = valueKey ?? series.yKeys[0];
    const rows = getFrameAlignedRows(series);
    return rows
        .slice()
        .sort((a, b) => a.frameIndex - b.frameIndex)
        .map((row) => ({
            frameIndex: row.frameIndex,
            value: typeof row[resolvedValueKey] === "number" ? row[resolvedValueKey] as number : NaN,
            videoTimeSecs: typeof row[series.xKey] === "number" ? row[series.xKey] as number : null,
        }));
}

export function pearsonCorrelation(valuesA: readonly number[], valuesB: readonly number[]) {
    if (valuesA.length !== valuesB.length || valuesA.length < 2) {
        return null;
    }
    const pairs = valuesA.map((value, index) => [value, valuesB[index]] as const)
        .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
    if (pairs.length < 2) {
        return null;
    }
    const meanA = pairs.reduce((sum, [a]) => sum + a, 0) / pairs.length;
    const meanB = pairs.reduce((sum, [, b]) => sum + b, 0) / pairs.length;
    const numerator = pairs.reduce((sum, [a, b]) => sum + (a - meanA) * (b - meanB), 0);
    const varianceA = pairs.reduce((sum, [a]) => sum + (a - meanA) ** 2, 0);
    const varianceB = pairs.reduce((sum, [, b]) => sum + (b - meanB) ** 2, 0);
    if (varianceA === 0 || varianceB === 0) {
        return null;
    }
    return numerator / Math.sqrt(varianceA * varianceB);
}

export function getSegmentIndexForFrame(frameIndex: number, frameCount: number, boundaries: readonly number[]) {
    const ranges = getSegmentFrameRanges(frameCount, boundaries);
    return ranges.findIndex((range) => frameIndex >= range.startFrame && frameIndex < range.endFrameExclusive);
}

export function getStandardSymmetryPairs() {
    return [
        [PoseLandmarkIds.leftShoulder, PoseLandmarkIds.rightShoulder],
        [PoseLandmarkIds.leftElbow, PoseLandmarkIds.rightElbow],
        [PoseLandmarkIds.leftWrist, PoseLandmarkIds.rightWrist],
        [PoseLandmarkIds.leftHip, PoseLandmarkIds.rightHip],
        [PoseLandmarkIds.leftKnee, PoseLandmarkIds.rightKnee],
        [PoseLandmarkIds.leftAnkle, PoseLandmarkIds.rightAnkle],
        [PoseLandmarkIds.leftHeel, PoseLandmarkIds.rightHeel],
        [PoseLandmarkIds.leftFootIndex, PoseLandmarkIds.rightFootIndex],
    ] as const;
}

export function getTorsoCenter2D(pose: Readonly<Pose2DPixelLandmarks>) {
    const shoulderCenter = getMidpoint2D(pose[PoseLandmarkIds.leftShoulder], pose[PoseLandmarkIds.rightShoulder]);
    const hipCenter = getMidpoint2D(pose[PoseLandmarkIds.leftHip], pose[PoseLandmarkIds.rightHip]);
    return getMidpoint2D(shoulderCenter, hipCenter);
}

export function getTorsoCenter3D(pose: Readonly<Pose3DLandmarkFrame>) {
    const shoulderCenter = getMidpoint3D(pose[PoseLandmarkIds.leftShoulder], pose[PoseLandmarkIds.rightShoulder]);
    const hipCenter = getMidpoint3D(pose[PoseLandmarkIds.leftHip], pose[PoseLandmarkIds.rightHip]);
    return getMidpoint3D(shoulderCenter, hipCenter);
}

export function getHipCenter2D(pose: Readonly<Pose2DPixelLandmarks>) {
    return getMidpoint2D(pose[PoseLandmarkIds.leftHip], pose[PoseLandmarkIds.rightHip]);
}

export function getHipCenter3D(pose: Readonly<Pose3DLandmarkFrame>) {
    return getMidpoint3D(pose[PoseLandmarkIds.leftHip], pose[PoseLandmarkIds.rightHip]);
}

export function distance2D(a: { x: number, y: number }, b: { x: number, y: number }) {
    return getMagnitude2DVec([a.x - b.x, a.y - b.y]);
}

export function distance3D(a: { x: number, y: number, z: number }, b: { x: number, y: number, z: number }) {
    return getMagnitude3DVec([a.x - b.x, a.y - b.y, a.z - b.z]);
}
