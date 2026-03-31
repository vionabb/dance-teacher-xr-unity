
import { describe, it } from 'vitest';
import { runSummaryMetricOnTestTrack, publishSummaryMetricOutputForTracks, loadTestTrack, generateAllTestTracks } from './testdata/metricTestingUtils';
import KinematicErrorEvaluationMetric from "./KinematicErrorEvaluationMetric";

// Note: we import the json file with ?url appended to the end in order to prevent degraded
//       tooling performance. If we import the json file directly, the tooling will try to
//       parse the json file as a module, which is very slow. By appending ?url, we cause the 
//       tooling to instead import the url of the json file, eliminating the need for it to parse 
//       that file during development. 
import goodperf_alignedwithcamera_url from './testdata/goodperf_alignedwithcamera.other_laxed_siren_beat.track.json?url';

describe('KinematicErrorEvaluationMetric', () => {

    it('should produce expected scores for test track 1', ({ expect }) => {
        const track = loadTestTrack(goodperf_alignedwithcamera_url);
        const { summary } = runSummaryMetricOnTestTrack(
            new KinematicErrorEvaluationMetric(),
            track,
        );
        
        expect(summary?.summary2D?.accelMAE).toMatchInlineSnapshot(`3744.4970691013423`);
        expect(summary?.summary2D?.accelRMSE).toMatchInlineSnapshot(`6498.957811051183`);
        expect(summary?.summary2D?.jerkMAE).toMatchInlineSnapshot(`82704.21519115941`);
        expect(summary?.summary2D?.jerkRMSE).toMatchInlineSnapshot(`196009.86395428976`);
        expect(summary?.summary2D?.velMAE).toMatchInlineSnapshot(`222.0021373692525`);
        expect(summary?.summary2D?.velRMSE).toMatchInlineSnapshot(`298.3139913705498`);
    });

    it('publishing metric outputs should not throw', ({ expect }) => {
        expect(() => {

            publishSummaryMetricOutputForTracks(
                new KinematicErrorEvaluationMetric(),
                generateAllTestTracks(),
            )

        }).not.toThrow();
    });
});