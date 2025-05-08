import type { SummaryMetric, TrackHistory } from "./MotionMetric";
import { 
    calculateKinematicValues,
    calculateKinematicErrorDescriptors
 } from "./compute-kinematic-motion-descriptors";


function prependObjectKeys<T extends Record<string, any>, prefixT extends string>(obj: T, prefix: prefixT): { [K in keyof T as `${prefixT}${Extract<K, string>}`]: T[K]}  {
   return Object.keys(obj).reduce(
    (newObjSoFar, key) => ({
      ...newObjSoFar,
        [prefix + key]: obj[key],
    }),
    {}
  ) as { 
    [K in keyof T as `${prefixT}${Extract<K, string>}`]: T[K]
  };
}

type KinematicErrorMetricOutputForSomeDimension = {
    jerkMAE: number | null; 
    jerkRMSE: number | null; 
    accelMAE: number | null; 
    accelRMSE: number | null; 
    velMAE: number | null; 
    velRMSE: number | null;
};


type KinematicErrorMetricOutput = {
    summary2D: KinematicErrorMetricOutputForSomeDimension,
    summary3D: KinematicErrorMetricOutputForSomeDimension,
};

type KinematicErrorMetricFormattedOutput = ReturnType<KinematicErrorMetric['formatSummary']>;

export default class KinematicErrorMetric implements SummaryMetric<KinematicErrorMetricOutput, KinematicErrorMetricFormattedOutput> {

    summarizeMetric(history: TrackHistory): KinematicErrorMetricOutput {
        const vals3d = calculateKinematicValues(
            history.user3DFrameHistory,
            history.ref3DFrameHistory,
            history.videoFrameTimesInSecs,
            {
                scaleBehavior: 'scaleByFrame',
            }
        );
        const summary3D = calculateKinematicErrorDescriptors(
            vals3d,
            {
                visibilityBehavior: 'scale',
            }
        );
        const vals2d = calculateKinematicValues(
            history.user2DFrameHistory,
            history.ref2DFrameHistory,
            history.videoFrameTimesInSecs,
            {
                scaleBehavior: 'scaleByFrame',
            }
        );
        const summary2D = calculateKinematicErrorDescriptors(
            vals2d,
            {
                visibilityBehavior: 'scale',
            }
        );

        // Combine the 2D and 3D summaries into a single summary object
        const combinedSummary: KinematicErrorMetricOutput = {
            summary2D,
            summary3D,
        };

        return combinedSummary;
    }

    formatSummary(summary: Readonly<KinematicErrorMetricOutput>) {
        
        return {
            ...prependObjectKeys(summary.summary2D, 'd2_'),
            ...prependObjectKeys(summary.summary3D, 'd3_'),
        }        
    }
}




