import { describe, it } from "vitest";
import fs from 'fs';

import * as utils from "./EvaluationCommonUtils";
import Papa from "papaparse";
import { ensureDirectoryExistence } from "./motionmetrics/testdata/metricTestingUtils";
import type { Pose2DPixelLandmarks, Pose3DLandmarkFrame } from "$lib/webcam/mediapipe-utils";

const randomTrialCount = 40;


describe.concurrent('getPoseType', () => {
    it.concurrent('should return "2D" for a 2D pose', ({ expect }) => {
      const pose = [{ x: 10, y: 20, dist_from_camera: 0, visibility: 0.9 }];
      expect(utils.getPoseType(pose)).toBe('2D');
    });
  
    it.concurrent('should return "3D" for a 3D pose', ({ expect }) => {
      const pose: Pose3DLandmarkFrame = [{ x: 10, y: 20, z: 30, visibility: 0.9 }];
      expect(utils.getPoseType(pose)).toBe('3D');
    });
  
    it.concurrent('should return "invalid" for an empty pose array', ({ expect }) => {
      const pose: Pose2DPixelLandmarks = [];
      expect(utils.getPoseType(pose)).toBe('invalid');
    });
  
    it.concurrent('should return "invalid" for invalid input', ({ expect }) => {
      const pose = null;
      expect(utils.getPoseType(pose as any)).toBe('invalid');
    });
  });

describe.concurrent('GetVectorAbsDifferences', () => {
    it.concurrent('should return absolute differences between two vectors', ({ expect }) => {
        expect(utils.GetVectorAbsDifferences([3, 4], [1, 5])).toEqual([2, 1]);
        expect(utils.GetVectorAbsDifferences([3, 4, 5], [5, 1, 2])).toEqual([2, 3, 3]);
        expect(utils.GetVectorAbsDifferences<[number, number]>([10, 20], [5, 25])).toEqual([5, 5]);
    });

    it.concurrent('should handle negative values correctly', ({ expect }) => {
        expect(utils.GetVectorAbsDifferences([-3, 4], [1, -5])).toEqual([4, 9]);
        expect(utils.GetVectorAbsDifferences([-5, -10], [-2, -8])).toEqual([3, 2]);
    });

    it.concurrent('should throw an error for vectors of different lengths', ({ expect }) => {
        expect(() => utils.GetVectorAbsDifferences([1, 2, 3], [1, 2] as any)).toThrow();
    });

    it.concurrent('should handle zero differences', ({ expect }) => {
        expect(utils.GetVectorAbsDifferences([5, 10], [5, 10])).toEqual([0, 0]);
    });
});

describe.concurrent('GetVectorError', () => {
    it.concurrent('should calculate the norm of the absolute differences', ({ expect }) => {
        expect(utils.GetVectorError([3, 4], [0, 0])).toBe(5); // sqrt(3^2 + 4^2) = 5
        expect(utils.GetVectorError([1, 1], [0, 0])).toBe(Math.sqrt(2));
        expect(utils.GetVectorError([5, 5, 5], [5, 5, 5])).toBe(0);
    });

    it.concurrent('should handle various vector inputs', ({ expect }) => {
        expect(utils.GetVectorError([10, 20], [7, 24])).toBeCloseTo(5);
        expect(utils.GetVectorError([-3, 4], [1, -5])).toBeCloseTo(Math.sqrt(4*4 + 9*9));
    });

    it.concurrent('should throw an error for vectors of different lengths', ({ expect }) => {
        expect(() => utils.GetVectorError([1, 2, 3], [1, 2])).toThrow();
    });

    it.concurrent('should be consistent with manual calculation', ({ expect }) => {
        for(let i = 0; i < randomTrialCount; i++) {
            const v1 = [Math.random() * 100, Math.random() * 100];
            const v2 = [Math.random() * 100, Math.random() * 100];
            
            const diffs = utils.GetVectorAbsDifferences(v1, v2);
            const errorManual = Math.sqrt(diffs[0]*diffs[0] + diffs[1]*diffs[1]);
            
            expect(utils.GetVectorError(v1, v2)).toBeCloseTo(errorManual);
        }
    });
});

describe.concurrent('GetVectorPNorm', () => {

    it.concurrent('should return 0 for empty vector', ({ expect }) => {
        expect(utils.GetVectorPNorm([], 2)).toBe(0);
        for (let i = 0; i < randomTrialCount; i++) {
            expect(utils.GetVectorPNorm([], Math.random() * 100)).toBe(0);
        }
    });

    it.concurrent('should be equal to manhattan dist for 1-norm', ({ expect }) => {
        expect(utils.GetVectorPNorm([3, 4], 1)).toBe(7);
        expect(utils.GetVectorPNorm([3, 4, 5], 1)).toBe(12);
        expect(utils.GetVectorPNorm([1, 1], 1)).toBe(2);
        expect(utils.GetVectorPNorm([1, 1, 1], 1)).toBe(3);

    });

    it.concurrent('should work for 2-norm', ({ expect }) => {
        expect(utils.GetVectorPNorm([3, 4], 2)).toBe(5);
        expect(utils.GetVectorPNorm([3, 4, 5], 2)).toBe(Math.sqrt(50));
        expect(utils.GetVectorPNorm([1, 1], 2)).toBe(Math.sqrt(2));
        expect(utils.GetVectorPNorm([1, 1, 1], 2)).toBe(Math.sqrt(3));
        
        for(let i = 0; i < randomTrialCount; i++) {
            const rand = Math.random() * 100;
            expect(utils.GetVectorPNorm([rand], 2)).toBe(rand);
        }
    });

    it.concurrent('should return near max for near infinity norm', ({ expect }) => {
        const highNorm = 250;
        expect(utils.GetVectorPNorm([3, 4], highNorm)).toBeCloseTo(4);
        expect(utils.GetVectorPNorm([3, 4, 5], highNorm)).toBeCloseTo(5);
        expect(utils.GetVectorPNorm([1, 1], highNorm)).toBeCloseTo(1);
        expect(utils.GetVectorPNorm([1, 1, 1], highNorm)).toBeCloseTo(1);
        
        for(let i = 0; i < randomTrialCount; i++) {
            const highNorm2 = 130;
            const rand1 = 1.5 + Math.random() * 100;
            const rand2 = 1.5 + Math.random() * 100;
            const maxVal = Math.max(rand1, rand2)
            const pnorm = utils.GetVectorPNorm([rand1, rand2], highNorm2);
            const difference = Math.abs(maxVal - pnorm);
            expect(difference, `i:${i} rand1: ${rand1}, rand2:${rand2}`).toBeLessThan(1.0);
        }
    });
});


describe.concurrent('MeanComparisons', () => {
    it.concurrent('should output vector norms', ( { expect }) => {
        
        function makeRandomVector(count: number, min: number, max: number) {
            return new Array(count).fill(0).map(() => min + Math.random() * (max - min));
        }

        const testVectors = [
            [1, 1],
            [1, 2, 1, 9, 10],
            [-78, -21, 50, 100],
            [1, 1, 1, 1, 1, 1, 10],
            [2, 10, 10, 10, 10, 10, 10, 10],
            [0.9, 0.9, 0.9, 0.4],
            makeRandomVector(5, 0, 100),
            makeRandomVector(5, 0, 100),
            makeRandomVector(5, 0, 100),
            makeRandomVector(5, -100, 0),
            makeRandomVector(5, -100, 0),
            makeRandomVector(5, -100, 0),
        ];

        const data: Record<string, (number | string)>[] = []

        for(const vector of testVectors) { 
            data.push({
                vectors: [...vector].sort().map(x => x.toFixed(2)).join(','),
                mins: Math.min(...vector),
                negInfNorms: utils.GetVectorPNormAverage(vector, -Infinity),
                neg100Norms: utils.GetVectorPNormAverage(vector, -100),
                neg2Norms: utils.GetVectorPNormAverage(vector, -2),
                neg1Norms: utils.GetVectorPNormAverage(vector, -1),
                harmonicMeans: utils.GetHarmonicMean(vector),
                negAlmostZeroNorms: utils.GetVectorPNormAverage(vector, -0.05),
                geometricMeans: utils.GetGeometricMean(vector),
                posAlmostZeroNorms: utils.GetVectorPNormAverage(vector, 0.05),
                oneNorms: utils.GetVectorPNormAverage(vector, 1),
                arithmeticMeans: utils.GetArithmeticMean(vector),
                twoNorms: utils.GetVectorPNormAverage(vector, 2),
                pos100Norms: utils.GetVectorPNormAverage(vector, 100),
                posInfNorms: utils.GetVectorPNormAverage(vector, Infinity),
                maxes: Math.max(...vector),
            });
        }

        const csv = Papa.unparse({
            fields: Object.keys(data[0]),
            data: data
        });

        
        expect(() => {
            ensureDirectoryExistence('./testResults/');
            fs.writeFileSync(`./testResults/normAverages.csv`, csv);
        }).not.toThrow();
    });
});