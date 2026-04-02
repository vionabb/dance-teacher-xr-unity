import { describe, it } from 'vitest';
import {
	publishSummaryMetricOutputForTracks,
	loadTestTrack,
	generateAllTestTracks,
	runSummaryMetricOnTestTrack
} from './testdata/metricTestingUtils';
import BasicInfoSummaryMetric from './BasicInfoSummaryMetric';

// Note: we import the json file with ?url appended to the end in order to prevent degraded
//       tooling performance. If we import the json file directly, the tooling will try to
//       parse the json file as a module, which is very slow. By appending ?url, we cause the
//       tooling to instead import the url of the json file, eliminating the need for it to parse
//       that file during development.
import goodperf_alignedwithcamera_url from './testdata/goodperf_alignedwithcamera.other_laxed_siren_beat.track.json?url';

describe('BasicInfoSummaryMetric', () => {
	it('should produce expected scores for test track 1', ({ expect }) => {
		const track = loadTestTrack(goodperf_alignedwithcamera_url);
		const { summary } = runSummaryMetricOnTestTrack(new BasicInfoSummaryMetric(), track);

		expect(summary.poseFrameCount).toMatchInlineSnapshot('387');
		expect(summary.realTimeDurationSecs).toMatchInlineSnapshot('30.134');
		expect(summary.realTimeFps).toMatchInlineSnapshot('12.842636224862282');
		expect(summary.videoTimeDurationSecs).toMatchInlineSnapshot('14.97');
		expect(summary.videoTimeFps).toMatchInlineSnapshot('25.851703406813627');
	});

	it('publishing metric outputs should not throw', ({ expect }) => {
		expect(() => {
			publishSummaryMetricOutputForTracks(new BasicInfoSummaryMetric(), generateAllTestTracks());
		}).not.toThrow();
	});
});
