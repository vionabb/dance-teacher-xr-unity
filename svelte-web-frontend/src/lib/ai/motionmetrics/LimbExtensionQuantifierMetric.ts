import { PoseLandmarkIds } from "$lib/webcam/mediapipe-utils";
import {
    FrameAlignedMotionQuantifierMetric,
    getMeanOfFiniteValues,
    type MotionMetricTimeSeries,
    type QuantifierFrameAlignedRow,
    type SingleTrackMetricTrack
} from "./MotionMetric";
import {
    distance2D,
    distance3D,
    getHipCenter2D,
    getHipCenter3D,
    getTorsoCenter2D,
    getTorsoCenter3D,
    getTrackScale2D,
    getTrackScale3D,
} from "./quantifierUtils";

export type ExtensionLimb = "leftHand" | "rightHand" | "leftFoot" | "rightFoot";

export type LimbExtensionQuantifierOptions = {
    dimension: "2d" | "3d",
    includedLimbs: readonly ExtensionLimb[],
    seriesId?: string,
    valueKey?: string,
};

export default class LimbExtensionQuantifierMetric extends FrameAlignedMotionQuantifierMetric {
    constructor(private opts: LimbExtensionQuantifierOptions) {
        super();
    }

    private get valueKey() {
        return this.opts.valueKey ?? "extension";
    }

    quantify(track: Readonly<SingleTrackMetricTrack>): MotionMetricTimeSeries<QuantifierFrameAlignedRow>[] {
        const trackScale = this.opts.dimension === "2d" ? getTrackScale2D(track) : getTrackScale3D(track);

        const rows = track.videoFrameTimesInSecs.map((videoTimeSecs, frameIndex) => {
            const extensionValues = this.opts.includedLimbs.map((limb) => {
                if (this.opts.dimension === "2d") {
                    const pose = track.poses2d[frameIndex];
                    if (limb === "leftHand") return distance2D(pose[PoseLandmarkIds.leftWrist], getTorsoCenter2D(pose)) / Math.max(trackScale, 1e-6);
                    if (limb === "rightHand") return distance2D(pose[PoseLandmarkIds.rightWrist], getTorsoCenter2D(pose)) / Math.max(trackScale, 1e-6);
                    if (limb === "leftFoot") return distance2D(pose[PoseLandmarkIds.leftAnkle], getHipCenter2D(pose)) / Math.max(trackScale, 1e-6);
                    return distance2D(pose[PoseLandmarkIds.rightAnkle], getHipCenter2D(pose)) / Math.max(trackScale, 1e-6);
                }

                const pose = track.poses3d[frameIndex];
                if (limb === "leftHand") return distance3D(pose[PoseLandmarkIds.leftWrist], getTorsoCenter3D(pose)) / Math.max(trackScale, 1e-6);
                if (limb === "rightHand") return distance3D(pose[PoseLandmarkIds.rightWrist], getTorsoCenter3D(pose)) / Math.max(trackScale, 1e-6);
                if (limb === "leftFoot") return distance3D(pose[PoseLandmarkIds.leftAnkle], getHipCenter3D(pose)) / Math.max(trackScale, 1e-6);
                return distance3D(pose[PoseLandmarkIds.rightAnkle], getHipCenter3D(pose)) / Math.max(trackScale, 1e-6);
            });

            return {
                frameIndex,
                videoTimeSecs,
                [this.valueKey]: getMeanOfFiniteValues(extensionValues) ?? 0,
            };
        });

        return [{
            seriesId: this.opts.seriesId ?? `limb_extension_${this.opts.dimension}`,
            title: "Limb extension",
            xKey: "videoTimeSecs",
            yKeys: [this.valueKey],
            xLabel: "Video time (s)",
            yLabel: "Extension",
            rows,
        }];
    }

    quantifySegmented(track: Readonly<SingleTrackMetricTrack>, segmentBoundaries: readonly number[]) {
        const series = this.quantify(track)[0];
        return this.aggregateFrameAlignedSeries(
            series.rows,
            this.valueKey,
            track.videoFrameTimesInSecs.length,
            segmentBoundaries,
            (values) => getMeanOfFiniteValues(values),
        );
    }

    formatSummary(summary: Readonly<Array<number | null>>) {
        return Object.fromEntries(summary.map((value, index) => [`segment_${index}`, value]));
    }
}
