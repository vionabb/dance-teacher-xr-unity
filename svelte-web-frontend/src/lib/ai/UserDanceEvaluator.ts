import { browser } from "$app/environment";
import type { PoseReferenceData } from "$lib/data/dances-store";
import type { Pose2DPixelLandmarks, Pose3DLandmarkFrame } from  "$lib/webcam/mediapipe-utils";
import type { EvaluationTrackHistory, LiveEvaluationMetric, SummaryEvaluationMetric } from "./motionmetrics/MotionMetric";
import type { PerformanceHistoryStore } from "./performanceHistory";
import { UserEvaluationTrackRecorder } from "./UserEvaluationTrackRecorder";

/**
 * Evaluates a user's dance performance against a reference dance. This class is responsible for
 * computing the metrics for each frame, and for computing the summary metrics for the entire dance.
 * The metrics are provided by the caller, and can be any metric that implements the
 * LiveEvaluationMetric or SummaryEvaluationMetric interfaces. As such, this class is generic over the types
 * of the live and summary metrics.
 */
export default class UserDanceEvaluator<
    T extends Record<string, LiveEvaluationMetric<any, any, any>>,
    U extends Record<string, SummaryEvaluationMetric<any, any>>,
> {
    public trackRecorder = new 
        UserEvaluationTrackRecorder<
            {[K in keyof T]: ReturnType<T[K]["computeMetric"]>}
        >();

    constructor(
        private reference2DData: PoseReferenceData<Pose2DPixelLandmarks>, 
        private reference3DData: PoseReferenceData<Pose3DLandmarkFrame>,
        private liveMetrics: T,
        private summaryMetrics: U,
        private performanceHistoryStore?: PerformanceHistoryStore<T & U>,
    ) {};

    /**
     * Evaluates a single frame of a user's motion performance.
     * @param trialId Identifier of the current attempt, used to separate recordings into tracks
     * @param motionIdentifier Identifier of the motion which is being evaluated
     * @param videoTimeSecs Timestamp of the video, in seconds
     * @param actualTimeMs Actual time this pose was captured, in milliseconds
     * @param userPose2D User's pose at the given frame time
     * @param userPose3D User's pose at the given frame time
     * @param disableRecording If true, the evaluation will not be recorded in the evaluation history
     */
    evaluateFrame(
        trialId: string | null, 
        motionId: number, 
        segmentDescription: string, 
        videoTimeSecs: number, 
        actualTimeMs: number, 
        userPose2D: Pose2DPixelLandmarks, 
        userPose3D: Pose3DLandmarkFrame,
        disableRecording = false) {

        const referencePose2D = this.reference2DData.getReferencePoseAtTime(videoTimeSecs);
        const referencePose3D = this.reference3DData.getReferencePoseAtTime(videoTimeSecs);
        if (!referencePose2D || !referencePose3D) {
            return null;
        }
        
        if (!disableRecording && trialId !== null && !this.trackRecorder.tracks.has(trialId)) {
            this.trackRecorder.startNewTrack(trialId, motionId, segmentDescription);
        }
        
        const track = trialId !== null ? this.trackRecorder.tracks.get(trialId) : null;
        
        const liveMetricKeys = Object.keys(this.liveMetrics) as (keyof T)[];
        const metricResults = Object.fromEntries(liveMetricKeys.map((liveMetricKey) => {
            const metric = this.liveMetrics[liveMetricKey];

            return [liveMetricKey, (metric).computeMetric(
                {
                    videoFrameTimesInSecs: track?.videoFrameTimesInSecs ?? [],
                    actualTimesInMs: track?.actualTimesInMs ?? [],
                    ref3DFrameHistory: track?.ref3dPoses ?? [],
                    ref2DFrameHistory: track?.ref2dPoses ?? [],
                    user3DFrameHistory: track?.user3dPoses ?? [],
                    user2DFrameHistory: track?.user2dPoses ?? [],
                },
                (track?.timeSeriesResults?.[liveMetricKey] ?? []) as any,
                videoTimeSecs,
                actualTimeMs,
                userPose2D,
                userPose3D,
                referencePose2D,
                referencePose3D,
            )]
        })) as {[K in keyof T]: ReturnType<T[K]["computeMetric"]>};

        if (!disableRecording && trialId !== null) {
            if (!track) { 
                throw new Error('User Evaluation Track does not exist for trial ID ' + trialId);
            }
            this.trackRecorder.recordEvaluationFrame(
                trialId,
                videoTimeSecs,
                actualTimeMs,
                userPose2D,
                userPose3D,
                referencePose3D,
                referencePose2D,
                metricResults,
            )
        }
        return metricResults;
    }

    /**
     * Generates a summary of the performance for a given track. This summary is computed from the
     * live metrics and summary metrics provided to the constructor.
     * @param id Id of the track to get the performance summary for
     * @param subsections A mapping of subsection names to start and end times for each subsection.
     * @returns Performance summary for the given track, accululated from the live metrics and
     * summary metrics provided to the constructor.
     */
    generatePerformanceSummary<S extends Record<string, { startTime: number, endTime: number}>>(
        id: string, 
        subsections: S,
        plotElement?: string,
    ) {

        const track = this.trackRecorder.tracks.get(id)
        if (!track) {
            return null;
        }
        const {
            track: adjustedTrack,
            discardedEndFrames,
            discardedStartFrames,
            interpolatedFrameCount,
        } = track.withRecomputedFrameTimes(
            this.reference2DData,
            this.reference3DData
        )

        if (plotElement && document.getElementById(plotElement)) {
            // clear the plot element
            document.getElementById(plotElement)!.innerHTML = '';
        }
        const perfTrackWholePerformance = this.generateMetricSummariesForTrackSection(
            adjustedTrack.segmentDescription,
            adjustedTrack,
            false,
            plotElement,
        );

        return {
            trackId: id,
            segmentDescription: track.segmentDescription,
            wholePerformance: perfTrackWholePerformance,
            subsections: Object.fromEntries(Object.entries(subsections).map(([subsectionName, {startTime, endTime}]) => {
                const subsectionTrack = adjustedTrack.getSubTrack(startTime, endTime)
                if (!subsectionTrack) {
                    return [subsectionName, null];
                }
                return [subsectionName, this.generateMetricSummariesForTrackSection(subsectionName, subsectionTrack, true)];
            })) as {[K in keyof T]: ReturnType<typeof this.generateMetricSummariesForTrackSection>},
            discardedStartFrames,
            discardedEndFrames,
            interpolatedFrameCount,
            adjustedTrack,
        }
    }

    private generateMetricSummariesForTrackSection(
        sectionName: string,
        track: NonNullable<ReturnType<typeof this.trackRecorder.tracks["get"]>>,
        partOfLargerPerformance: boolean,
        plotElement?: string,
    ) {
        const liveMetricKeys = Object.keys(this.liveMetrics) as (keyof T)[];

        const trackHistory: EvaluationTrackHistory = {
            videoFrameTimesInSecs: track.videoFrameTimesInSecs,
            actualTimesInMs: track.actualTimesInMs,
            ref3DFrameHistory: track.ref3dPoses,
            ref2DFrameHistory: track.ref2dPoses,
            user3DFrameHistory: track.user3dPoses,
            user2DFrameHistory: track.user2dPoses,
        };

        const liveMetricSummaryResults = Object.fromEntries(liveMetricKeys.map((liveMetricKey) => {

            const metric = this.liveMetrics[liveMetricKey];
            const recomputedMetricHistory = trackHistory.videoFrameTimesInSecs.reduce((metricHistorySoFar, frameTime, i) => {
                const partialHistory = {
                    videoFrameTimesInSecs: trackHistory.videoFrameTimesInSecs.slice(0, i+1),
                    actualTimesInMs: trackHistory.actualTimesInMs.slice(0, i+1),
                    ref3DFrameHistory: trackHistory.ref3DFrameHistory.slice(0, i+1),
                    ref2DFrameHistory: trackHistory.ref2DFrameHistory.slice(0, i+1),
                    user3DFrameHistory: trackHistory.user3DFrameHistory.slice(0, i+1),
                    user2DFrameHistory: trackHistory.user2DFrameHistory.slice(0, i+1),
                }
                const metricEntry = metric.computeMetric(partialHistory, metricHistorySoFar, frameTime, track.actualTimesInMs[i], track.user2dPoses[i], track.user3dPoses[i], track.ref2dPoses[i], track.ref3dPoses[i]);
                metricHistorySoFar.push(metricEntry);
                return metricHistorySoFar
            }, [] as T[keyof T]["computeMetric"][]);

            const metricSummary = (metric).summarizeMetric(
                trackHistory,
                recomputedMetricHistory,
            )

            if (this.performanceHistoryStore) {
                const formattedSummary = metric.formatSummary(metricSummary as any);
                this.performanceHistoryStore.recordPerformance(
                    track.motionId,
                    sectionName,
                    liveMetricKey,
                    formattedSummary as any,
                    partOfLargerPerformance,
                )
            }
            return [liveMetricKey, metricSummary]
        })) as {[K in keyof T]: ReturnType<T[K]["summarizeMetric"]>};
                
        const summaryMetricKeys = Object.keys(this.summaryMetrics) as (keyof U)[];
        const summaryMetricResults = Object.fromEntries(summaryMetricKeys.map((summaryMetricKey) => {
            const metric = this.summaryMetrics[summaryMetricKey];
            let metricSummaryResult = undefined;
            try {
                const metricSummary = (metric).summarizeMetric(
                    trackHistory,
                    undefined,
                )

                if (browser && metric.plotSummary && plotElement && document.getElementById(plotElement)) {
                    // create new div in plot element with an h3 for the metric name
                    const metricDiv = document.createElement('div');
                    const metricHeader = document.createElement('h3');
                    const metricPlotDiv = document.createElement('div');
                    metricPlotDiv.id = `${sectionName}-${String(summaryMetricKey)}-plot`;
                    metricPlotDiv.style.aspectRatio = '16/9';
                    metricDiv.appendChild(metricHeader);
                    metricDiv.appendChild(metricPlotDiv);
                    document.getElementById(plotElement)?.appendChild(metricDiv);

                    metric.plotSummary(metricPlotDiv, metricSummary as any)
                        .catch((e) => {
                            console.error(`Unable to plot summary metric ${String(summaryMetricKey)} for section ${sectionName}`, e);
                        });
                }

                metricSummaryResult = metricSummary;
                if (this.performanceHistoryStore) {
                    const formattedSummary = metric.formatSummary(metricSummary as any);
                    this.performanceHistoryStore.recordPerformance(
                        track.motionId,
                        sectionName,
                        summaryMetricKey,
                        formattedSummary as any,
                        partOfLargerPerformance
                    )
                }
            } catch(e) {
                console.error(`Unable to summarize metric ${String(summaryMetricKey)} for section ${sectionName}${partOfLargerPerformance ? ' as part of a larger performance.': ''}`, e);
            }
            
            return [summaryMetricKey, metricSummaryResult]
        })) as {[K in keyof U]: ReturnType<U[K]["summarizeMetric"]> | undefined};

        return {
            ...liveMetricSummaryResults,
            ...summaryMetricResults
        }
    }
}
