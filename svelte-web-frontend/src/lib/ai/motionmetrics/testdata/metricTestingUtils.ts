import type { EvaluationMetricTrack, LiveEvaluationMetric, SummaryEvaluationMetric } from '../MotionMetric';
import fs from 'fs';

import track1url from './badperf_alignedwithcamera.other_laxed_siren_beat.track.json?url';
import track2url from './goodperf_alignedwithcamera.other_laxed_siren_beat.track.json?url';
import track3url from './goodperf_skewedtocamera.other_laxed_siren_beat.track.json?url';
import track4url from './literallydidntdoanything.other_renegade.track.json?url';
import track5url from './actuallymovingwithsong.other_renegade.track.json?url';
import track6url from './fullspeedgreateffort.other_colddance.track.json?url';
import track7url from './goodperf_halfspeed.other_colddance.track.json?url';
import track8url from './mediumeffort.other_colddance.track.json?url';
import track9url from './standingverystill.other_renegade.track.json?url';


import Papa from 'papaparse';

const testTrackURLs = Object.freeze([
    track1url, 
    track2url, 
    track3url,
    track4url,
    track5url,
    track6url,
    track7url,
    track8url,
    track9url
]);

export type TestTrack = EvaluationMetricTrack;

/**
 * Loads a test track from a json file.
 * @param url Path of the test track json file
 * @returns The test track JSON object.
 */
export function loadTestTrack(url: string, frames?: number) {
    const json = fs.readFileSync(process.cwd() + url, 'utf-8');
    const track = JSON.parse(json) as TestTrack;

    if (frames !== undefined) {
        track.videoFrameTimesInSecs = track.videoFrameTimesInSecs.slice(0, frames);
        track.actualTimesInMs = track.actualTimesInMs.slice(0, frames);
        track.user2dPoses = track.user2dPoses.slice(0, frames);
        track.user3dPoses = track.user3dPoses.slice(0, frames);
        track.ref2dPoses = track.ref2dPoses.slice(0, frames);
        track.ref3dPoses = track.ref3dPoses.slice(0, frames);
    }
    
    return track
}

/**
 * A generator that yields all the test tracks. This is useful for running tests on all the tracks.
 * This is a generator because it is possible to have a large number of tracks, and we don't want to
 * load them all into memory at once.
 * @returns JSON object of the test track
 */
export function* generateAllTestTracks() {
    for(let i = 0; i < testTrackURLs.length; i++) {
        const url = testTrackURLs[i];
        yield loadTestTrack(url);
    }
}

/**
 * Runs a live evaluation metric on a test performance track and returns the results
 * @param metric Metric to run on the track
 * @param track Track to run the metric on
 * @returns Metric output with `metricHistory` (frame-by-frame) and `summary` properties
 */
export function runLiveEvaluationMetricOnTestTrack<T extends LiveEvaluationMetric<any, any, any>>(metric: T, track: TestTrack) {
    
    const metricHistory = [] as ReturnType<T['computeMetric']>[];

    for(let i = 0; i < track.user2dPoses.length; i++) {
        try {
            const user2dPose = track.user2dPoses[i];
            const user3dPose = track.user3dPoses[i];
            const ref2dPose = track.ref2dPoses[i];
            const ref3dPose = track.ref3dPoses[i];
            const videoTimeSecs = track.videoFrameTimesInSecs[i];
            const actualTimeMs = track.actualTimesInMs[i];

            const metricResult = metric.computeMetric(
                {
                    videoFrameTimesInSecs: track.videoFrameTimesInSecs.slice(0, i),
                    actualTimesInMs: track.actualTimesInMs.slice(0, i),
                    ref2DFrameHistory: track.ref2dPoses.slice(0, i),
                    ref3DFrameHistory: track.ref3dPoses.slice(0, i),
                    user2DFrameHistory: track.user2dPoses.slice(0, i),
                    user3DFrameHistory: track.user3dPoses.slice(0, i)
                },
                metricHistory,
                videoTimeSecs,
                actualTimeMs,
                user2dPose,
                user3dPose,
                ref2dPose,
                ref3dPose,
            );

            metricHistory.push(metricResult);
        } catch (e) {
            console.error(`Error computing metric for track ${track.id} at frame ${i}:`, e);
            throw e;
        }
    }
    
    const summary = metric.summarizeMetric(
        {
            videoFrameTimesInSecs: track.videoFrameTimesInSecs,
            actualTimesInMs: track.actualTimesInMs,
            ref2DFrameHistory: track.ref2dPoses,
            ref3DFrameHistory: track.ref3dPoses,
            user2DFrameHistory: track.user2dPoses,
            user3DFrameHistory: track.user3dPoses
        },
        metricHistory
    ) as ReturnType<T['summarizeMetric']>;

    return {
        metricHistory, 
        summary
    };
}

/**
 * Runs a summary metric on a test performance track and returns the results
 * @param metric Metric to run on the track
 * @param track Track to run the metric on
 * @returns An object with the summary metric output (in the `summary` property)
 */
export function runSummaryMetricOnTestTrack<T extends SummaryEvaluationMetric<any, any>>(metric: T, track: TestTrack) {

    const debugRoot = './testResults/bydance/' + track.danceRelativeStem + '/';
    fs.mkdirSync(debugRoot, { recursive: true });
    const summary = metric.summarizeMetric(
        {
            videoFrameTimesInSecs: track.videoFrameTimesInSecs,
            actualTimesInMs: track.actualTimesInMs,
            ref2DFrameHistory: track.ref2dPoses,
            ref3DFrameHistory: track.ref3dPoses,
            user2DFrameHistory: track.user2dPoses,
            user3DFrameHistory: track.user3dPoses
        },
        debugRoot,
    ) as ReturnType<T['summarizeMetric']>;

    return {
        summary
    };
}

/**
 * Creates a directory if it doesn't already exist.
 * @param dirPath Directory path to ensure exists
 * @returns True if the directory already existed, false if it was created
 */
export function ensureDirectoryExistence(dirPath: string) {
    if (fs.existsSync(dirPath)) {
        return true;
    }
    fs.mkdirSync(dirPath, { recursive: true });
    return false;
}

/**
 * Computes the metric output for a set of tracks and publishes it to a csv file.
 * @param metric Live evaluation metric to publish the output for
 * @param tracks Tracks to publish the output for (should be a generator, to avoid loading all tracks into memory)
 */
function publishMetricOutputForTracks<T extends LiveEvaluationMetric<any, any, any> | SummaryEvaluationMetric<any, any>>(
    metric: T,
    summarizer: (metric: T, track: TestTrack) => ReturnType<T['summarizeMetric']>,
    tracks: Generator<TestTrack>,
) {

    const trackIds = [] as string[];
    const trackDances = [] as string[];
    const trackSegments = [] as string[];
    const trackDescriptions = [] as string[];
    const formattedSummaries = [] as Record<string, string | number | null>[];

    for(const track of tracks) {
        trackIds.push(track.id);
        trackDances.push(track.danceRelativeStem);
        trackSegments.push(track.segmentDescription);
        trackDescriptions.push(track.trackDescription);

        const summary = summarizer(metric, track);
        formattedSummaries.push(metric.formatSummary(summary));
    }

    const rows = formattedSummaries.map((summary, i) => ({
        ...summary,
        // put these after so they aren't overwritten by the summary
        trackId: trackIds[i],
        dance: trackDances[i],
        segment: trackSegments[i],
        description: trackDescriptions[i],
    }));

    const columns = [
        'trackId',
        'dance',
        'segment',
        'description',
        ...Object.keys(rows[0]).filter((key) => key !== 'dance' && key !== 'trackId'),
    ];

    const csv = Papa.unparse({
        fields: columns,
        data: rows,
    });
    
    ensureDirectoryExistence('./testResults/');
    fs.writeFileSync(`./testResults/${metric.constructor.name}.csv`, csv);
}

/**
 * Runs a live evaluation metric against multiple test track, aggregates the results, and
 * publishes them to a csv file.
 * @param metric Metric to publish the output for
 * @param tracks Tracks to publish the output for (should be a generator, to avoid loading all tracks into memory)
 */
export function publishLiveMetricOutputForTracks<T extends LiveEvaluationMetric<any, any, any>>(
    metric: T,
    tracks: Generator<TestTrack>,
) {
    publishMetricOutputForTracks(
        metric, 
        (metric, track) => runLiveEvaluationMetricOnTestTrack(metric, track).summary,
        tracks
    );
}

/**
 * Runs a summary metric against multiple test track, aggregates the results, and
 * publishes them to a csv file.
 * @param metric Metric to publish the output for
 * @param tracks Tracks to publish the output for (should be a generator, to avoid loading all tracks into memory)
 */
export function publishSummaryMetricOutputForTracks<T extends SummaryEvaluationMetric<any, any>>(
    metric: T,
    tracks: Generator<TestTrack>,
) {
    publishMetricOutputForTracks(
        metric, 
        (metric, track) => runSummaryMetricOnTestTrack(metric, track).summary,
        tracks
    );
}
