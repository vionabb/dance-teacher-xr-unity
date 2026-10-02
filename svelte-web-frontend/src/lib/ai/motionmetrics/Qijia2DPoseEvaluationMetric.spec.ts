import { describe, it } from 'vitest';
import {
	runLiveEvaluationMetricOnTestTrack,
	publishLiveMetricOutputForTracks,
	loadTestTrack,
	generateAllTestTracks
} from './testdata/metricTestingUtils';
import Qijia2DPoseEvaluationMetric from './Qijia2DPoseEvaluationMetric';
import type { Pose2DPixelLandmarks } from '$lib/webcam/mediapipe-utils';

// Note: we import the json file with ?url appended to the end in order to prevent degraded
//       tooling performance. If we import the json file directly, the tooling will try to
//       parse the json file as a module, which is very slow. By appending ?url, we cause the
//       tooling to instead import the url of the json file, eliminating the need for it to parse
//       that file during development.
import goodperf_alignedwithcamera_url from './testdata/goodperf_alignedwithcamera.other_laxed_siren_beat.track.json?url';

describe('Qijia2DPoseEvaluationMetric', () => {
	function pose(missing = false): Pose2DPixelLandmarks {
		return Array.from({ length: 33 }, (_, index) => ({
			x: missing ? Number.NaN : index * 10,
			y: missing ? Number.NaN : index * index + 1,
			dist_from_camera: 0,
			visibility: 1
		})) as Pose2DPixelLandmarks;
	}

	it('keeps frames with no valid vector pairs missing through frame, summary, segment, and time-series outputs', ({
		expect
	}) => {
		const metric = new Qijia2DPoseEvaluationMetric();
		const frame = metric.computeMetric(
			{} as never,
			[],
			0,
			0,
			pose(true),
			[] as never,
			pose(true),
			[] as never
		);
		expect(frame.overallScore).toBeNull();
		expect(frame.vectorByVectorScore.every((score) => score === null)).toBe(true);
		const summary = metric.summarizeMetric({} as never, [frame]);
		expect(summary.overallScore).toBeNull();
		expect(Object.values(summary.vectorByVectorScore).every((score) => score === null)).toBe(true);
		expect(metric.evaluateSegmented({} as never, [frame], []).at(0)).toBeNull();
		expect(
			metric.getTimeSeries({
				trackHistory: {} as never,
				track: { videoFrameTimesInSecs: [0] } as never,
				metricHistory: [frame],
				summary: summary
			})[0].rows[0].overallScore
		).toBeNull();
		const absent = metric.computeMetric(
			{} as never,
			[],
			0,
			0,
			[] as unknown as Pose2DPixelLandmarks,
			[] as never,
			[] as unknown as Pose2DPixelLandmarks,
			[] as never
		);
		expect(absent.overallScore).toBeNull();
		for (const [participantPose, referencePose] of [
			[null, pose()],
			[pose(), null],
			[undefined, pose()],
			[pose(), undefined]
		]) {
			const noPose = metric.computeMetric(
				{} as never,
				[],
				0,
				0,
				participantPose as unknown as Pose2DPixelLandmarks,
				[] as never,
				referencePose as unknown as Pose2DPixelLandmarks,
				[] as never
			);
			expect(noPose.overallScore).toBeNull();
			expect(noPose.vectorByVectorScore.every((score) => score === null)).toBe(true);
		}
	});

	it('averages only valid pairs in partial frames and only valid frames in summaries', ({
		expect
	}) => {
		const metric = new Qijia2DPoseEvaluationMetric();
		const reference = pose();
		const participant = pose();
		participant[12] = { ...participant[11] };
		const partial = metric.computeMetric(
			{} as never,
			[],
			0,
			0,
			participant,
			[] as never,
			reference,
			[] as never
		);
		const missing = metric.computeMetric(
			{} as never,
			[],
			0,
			0,
			pose(true),
			[] as never,
			pose(true),
			[] as never
		);
		expect(partial.vectorByVectorScore[0]).toBeNull();
		expect(partial.overallScore).not.toBeNull();
		expect(metric.summarizeMetric({} as never, [partial, missing]).overallScore).toBe(
			partial.overallScore
		);
	});
	it('should produce expected scores for test track 1', ({ expect }) => {
		const track = loadTestTrack(goodperf_alignedwithcamera_url);
		const { summary } = runLiveEvaluationMetricOnTestTrack(
			new Qijia2DPoseEvaluationMetric(),
			track
		);

		expect(summary?.overallScore).toMatchInlineSnapshot(4.356392371095064);

		const vecScores = summary?.vectorByVectorScore;
		expect(vecScores['leftShoulder -> rightShoulder']).toMatchInlineSnapshot('4.6906651077597985');
		expect(vecScores['leftShoulder -> leftHip']).toMatchInlineSnapshot('4.7926083824442225');
		expect(vecScores['leftHip -> rightHip']).toMatchInlineSnapshot('4.689848018675444');
		expect(vecScores['rightHip -> rightShoulder']).toMatchInlineSnapshot('4.746243015495103');
		expect(vecScores['leftShoulder -> leftElbow']).toMatchInlineSnapshot('3.8061246949524525');
		expect(vecScores['leftElbow -> leftWrist']).toMatchInlineSnapshot('3.5868967567952272');
		expect(vecScores['rightShoulder -> rightElbow']).toMatchInlineSnapshot('4.305274846896869');
		expect(vecScores['rightElbow -> rightWrist']).toMatchInlineSnapshot('3.4184171877019267');
	});

	it('publishing metric outputs should not throw', { timeout: 20000 }, ({ expect }) => {
		expect(() => {
			publishLiveMetricOutputForTracks(new Qijia2DPoseEvaluationMetric(), generateAllTestTracks());
		}).not.toThrow();
	});
});
