
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
        
        expect(summary?.summary2D?.accelMAE).toMatchInlineSnapshot(`0.13088664859343946`);
        expect(summary?.summary2D?.accelRMSE).toMatchInlineSnapshot(`0.22883839190869076`);
        expect(summary?.summary2D?.jerkMAE).toMatchInlineSnapshot(`5.470679961827343`);
        expect(summary?.summary2D?.jerkRMSE).toMatchInlineSnapshot(`13.053079876195707`);
        expect(summary?.summary2D?.velMAE).toMatchInlineSnapshot(`0.004708051987392097`);
        expect(summary?.summary2D?.velRMSE).toMatchInlineSnapshot(`0.006357906691281181`);
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