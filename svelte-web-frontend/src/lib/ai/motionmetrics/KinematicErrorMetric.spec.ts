
import { describe, it } from 'vitest';
import { runSummaryMetricOnTestTrack, publishSummaryMetricOutputForTracks, loadTestTrack, generateAllTestTracks } from './testdata/metricTestingUtils';
import KinematicErrorMetric from "./KinematicErrorMetric";

// Note: we import the json file with ?url appended to the end in order to prevent degraded
//       tooling performance. If we import the json file directly, the tooling will try to
//       parse the json file as a module, which is very slow. By appending ?url, we cause the 
//       tooling to instead import the url of the json file, eliminating the need for it to parse 
//       that file during development. 
import goodperf_alignedwithcamera_url from './testdata/goodperf_alignedwithcamera.other_laxed_siren_beat.track.json?url';

describe('KinematicErrorMetric', () => {

    it('should produce expected scores for test track 1', ({ expect }) => {
        const track = loadTestTrack(goodperf_alignedwithcamera_url);
        const { summary } = runSummaryMetricOnTestTrack(
            new KinematicErrorMetric(),
            track,
        );
        
        expect(summary?.summary2D?.accelMAE).toMatchInlineSnapshot('35.04371748697044');
        expect(summary?.summary2D?.accelRMSE).toMatchInlineSnapshot('66.0219538282359');
        expect(summary?.summary2D?.jerkMAE).toMatchInlineSnapshot('1527.287960036425');
        expect(summary?.summary2D?.jerkRMSE).toMatchInlineSnapshot('2854.5514189008704');
        expect(summary?.summary2D?.velMAE).toMatchInlineSnapshot('1.2096341768203411');
        expect(summary?.summary2D?.velRMSE).toMatchInlineSnapshot('2.29461575412213');
    });

    it('publishing metric outputs should not throw', ({ expect }) => {
        expect(() => {

            publishSummaryMetricOutputForTracks(
                new KinematicErrorMetric(),
                generateAllTestTracks(),
            )

        }).not.toThrow();
    });
});