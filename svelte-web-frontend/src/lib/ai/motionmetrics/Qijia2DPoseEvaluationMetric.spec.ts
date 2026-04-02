import { describe, it } from 'vitest';
import {
	runLiveEvaluationMetricOnTestTrack,
	publishLiveMetricOutputForTracks,
	loadTestTrack,
	generateAllTestTracks
} from './testdata/metricTestingUtils';
import Qijia2DPoseEvaluationMetric from './Qijia2DPoseEvaluationMetric';

// Note: we import the json file with ?url appended to the end in order to prevent degraded
//       tooling performance. If we import the json file directly, the tooling will try to
//       parse the json file as a module, which is very slow. By appending ?url, we cause the
//       tooling to instead import the url of the json file, eliminating the need for it to parse
//       that file during development.
import goodperf_alignedwithcamera_url from './testdata/goodperf_alignedwithcamera.other_laxed_siren_beat.track.json?url';

describe('Qijia2DPoseEvaluationMetric', () => {
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

	it('publishing metric outputs should not throw', ({ expect }) => {
		expect(() => {
			publishLiveMetricOutputForTracks(new Qijia2DPoseEvaluationMetric(), generateAllTestTracks());
		}).not.toThrow();
	});
});
