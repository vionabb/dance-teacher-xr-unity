import { describe, it } from 'vitest';
import {
	runLiveEvaluationMetricOnTestTrack,
	publishLiveMetricOutputForTracks,
	loadTestTrack,
	generateAllTestTracks,
	runSummaryMetricOnTestTrack,
	publishSummaryMetricOutputForTracks
} from './testdata/metricTestingUtils';
import TemporalAlignmentEvaluationMetric from './TemporalAlignmentEvaluationMetric';

// Note: we import the json file with ?url appended to the end in order to prevent degraded
//       tooling performance. If we import the json file directly, the tooling will try to
//       parse the json file as a module, which is very slow. By appending ?url, we cause the
//       tooling to instead import the url of the json file, eliminating the need for it to parse
//       that file during development.
import goodperf_alignedwithcamera_url from './testdata/goodperf_alignedwithcamera.other_laxed_siren_beat.track.json?url';

describe('TemporalAlignmentEvaluationMetric', () => {
	it('should produce expected scores for test track 1', ({ expect }) => {
		const track = loadTestTrack(goodperf_alignedwithcamera_url);
		const { summary } = runSummaryMetricOnTestTrack(new TemporalAlignmentEvaluationMetric(), track);

		expect(summary?.temporalOffsetSecs).toMatchInlineSnapshot(`0.01280945111833809`);
	});

	it('publishing metric outputs should not throw', ({ expect }) => {
		expect(() => {
			publishSummaryMetricOutputForTracks(
				new TemporalAlignmentEvaluationMetric(),
				generateAllTestTracks()
			);
		}).not.toThrow();
	});
});
