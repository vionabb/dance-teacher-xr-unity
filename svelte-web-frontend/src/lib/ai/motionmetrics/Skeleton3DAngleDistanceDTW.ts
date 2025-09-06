import type { ValueOf } from "$lib/data/dances-store";
import type { Pose3DLandmarkFrame, Pose2DPixelLandmarks } from "$lib/webcam/mediapipe-utils";
import { BodyInnerAnglesComparisons, getInnerAngleFromFrame, GetHarmonicMean, getArraySD } from "../EvaluationCommonUtils";
import type { LiveEvaluationMetric, SummaryMetric, TrackHistory } from "./MotionMetric";

import { DynamicTimeWarping } from "./DynamicTimeWarping";
import { compute3dAngleSimilarity, computeSkeleton3DVectorAngleSimilarity } from "./Skeleton3dVectorAngleSimilarityMetric";

import { browser } from "$app/environment";

// let Plotly: typeof import("plotly.js-dist-min");

type AngleComparisonKey = keyof typeof BodyInnerAnglesComparisons;
type AngleComparisonValue = ValueOf<typeof BodyInnerAnglesComparisons>;

type Angle3D_DtwMetricSummaryOutput = ReturnType<Skeleton3DAngleDistanceDTW["summarizeMetric"]>; 

type Angle3D_DtwMetricSummaryFormattedOutput = ReturnType<Skeleton3DAngleDistanceDTW["formatSummary"]>;

function getInvalid3DFrames(frames: Pose3DLandmarkFrame[]) {
    return frames.map((frame, i) => {
        const valid = 
            frame !== undefined && 
            frame.length == 33 && 
            frame[0].x !== null &&
            frame[0].x !== undefined;

        return {
            i,
            valid
        }
    }).filter((frame) => frame.valid === false)
    .map((frame) => frame.i);
}

function filterFrameHistories(_history: TrackHistory) {
    
    const invalidUserFrames = getInvalid3DFrames(_history.user3DFrameHistory);
    const invalidRefFrames = getInvalid3DFrames(_history.ref3DFrameHistory);
    const invalidFrames = new Set([...invalidUserFrames, ...invalidRefFrames]);

    const invalidPercent = invalidFrames.size / _history.user3DFrameHistory.length;
    if (invalidFrames.size > 0) {
        console.warn(`\tSome frames are invalid (${(invalidPercent * 100).toFixed(0)}%, count=${invalidFrames.size}). This may affect the accuracy of the metric.`);
    }
    if (invalidPercent > 0.1) {
        console.warn("More than 10% of frames are invalid. This may affect the accuracy of the metric.");
    } 

    return {
        user3DFrameHistory: _history.user3DFrameHistory.filter((frame, i) => !invalidFrames.has(i)),
        ref3DFrameHistory: _history.ref3DFrameHistory.filter((frame, i) => !invalidFrames.has(i)),
        invalidFramesCount: invalidFrames.size,
        invalidPercent: invalidPercent,
    }
}

export default class Skeleton3DAngleDistanceDTW implements SummaryMetric<Angle3D_DtwMetricSummaryOutput, Angle3D_DtwMetricSummaryFormattedOutput> {
    

    summarizeMetric(_history: TrackHistory) {
        
        const { 
            user3DFrameHistory: filteredUser3DFrameHistory, 
            ref3DFrameHistory: filteredRef3DFrameHistory,
            invalidFramesCount,
            invalidPercent
        } = filterFrameHistories(_history);

        const dtw = new DynamicTimeWarping<Pose3DLandmarkFrame, Pose3DLandmarkFrame>(
            filteredUser3DFrameHistory, filteredRef3DFrameHistory,
            (a, b) => {
                const overallScore = computeSkeleton3DVectorAngleSimilarity(a, b).overallScore;
                // negate the score to make it a distance. 
                if (overallScore === undefined || isNaN(overallScore)) {
                    return Infinity
                }
                return  Math.abs(1 - overallScore); 
            }
        );
        const createDtwForJoint = (key: keyof typeof BodyInnerAnglesComparisons) => {
            return new DynamicTimeWarping<Pose3DLandmarkFrame, Pose3DLandmarkFrame>(
                filteredUser3DFrameHistory, filteredRef3DFrameHistory,
                (a, b) => {
                    
                    const similarityOutput = compute3dAngleSimilarity(a, b, BodyInnerAnglesComparisons[key]);
                    if (similarityOutput === undefined || isNaN(similarityOutput.score)) {
                        return Infinity
                    }
                    return Math.abs(1 - similarityOutput.score);
                }
            );
        };

        const dtw_by_joint = Object.keys(BodyInnerAnglesComparisons).map((key) => {
            return createDtwForJoint(key as keyof typeof BodyInnerAnglesComparisons);
        });
        
        const distance = dtw.getDistance();
        const path = dtw.getPath();

        // pathDf.setIndex({ column: "reference"});

        
        // quantify degree of warping
        const pathLength = path.length;
        const refLength = _history.ref3DFrameHistory.length;
        const userLength = _history.user3DFrameHistory.length;
        const warpingFactor = (pathLength - Math.min(refLength, userLength)) / Math.max(refLength, userLength);

        // let jointByJointPaths = dtw_by_joint.map((dtw) => {
        //     return new dfd.DataFrame(dtw.getPath(), {
        //         columns: ["user", "reference"],
        //     });
        // })
        // jointByJointPaths = jointByJointPaths.reduce((acc, df) => {
            // return acc.addColumn(df);
        // });

        // const jointByJointPaths = Object.keys(BodyInnerAnglesComparisons).map((key, i) => {
        //     const path = dtw_by_joint[i].getPath();
        //     return new dfd.DataFrame(path, {
        //         columns: ["user", "reference"],
        //     });
        // })
        // const jointByJointPathsDf = jointByJointPaths.reduce((acc, df) => {
        //     return acc.addColumn(df);
        // }, new dfd.DataFrame({}));


        return {
            dtwDistance: distance,
            dtwPath: path,
            warpingFactor: warpingFactor,
            jointByJointDistances: dtw_by_joint.map((dtw) => {
                return {
                    distance: dtw.getDistance(),
                }
            }),
            jointByJointPaths: dtw_by_joint.map((dtw) => {
                return dtw.getPath();
            }),
            jointByJointWarpingFactors: dtw_by_joint.map((dtw) => {
                const pathLength = dtw.getPath().length;
                const refLength = _history.ref3DFrameHistory.length;
                const userLength = _history.user3DFrameHistory.length;
                return (pathLength - Math.min(refLength, userLength)) / Math.max(refLength, userLength);
            }),
            invalidFramesCount: invalidFramesCount,
            invalidPercent: invalidPercent,
        };
    }

    formatSummary(summary: Angle3D_DtwMetricSummaryOutput) {


        // const dtwPathJson = dfd.toJSON(summary.dtwPath, { format: "row" });
        return {
            "DTW Distance": summary.dtwDistance,
            "DTW Path": JSON.stringify(summary.dtwPath),
            "Warping Factor": summary.warpingFactor
        } as const;
    }

    // async plotSummary(element: HTMLElement, summary: Angle3D_DtwMetricSummaryOutput) {
        
    //     if (!Plotly) {
    //         Plotly = await import("plotly.js-dist-min");
    //     }

    //     if (!element) throw new Error("Element with the specified ID not found")

    //     const mainDiv = document.createElement("div");
    //     element.appendChild(mainDiv);
    
    //     const maxDtwValue = Math.max(...summary.dtwPath.map((point) => point[1]));

    //     Plotly.newPlot(
    //         mainDiv, 
    //         [{
    //             x: summary.dtwPath.map((point) => point[0]),
    //             y: summary.dtwPath.map((point) => point[1]),
    //             mode: 'lines+markers',
    //             type: 'scatter',
    //             name: 'DTW Path',
    //             xaxis: 'reference',
    //             yaxis: 'user',
    //         },
    //         {
    //             // add a reference diagonal line
    //             x: [0, maxDtwValue],
    //             y: [0, maxDtwValue],
    //             mode: 'lines',
    //             type: 'scatter',
    //             name: 'Reference Diagonal',
    //             // make the line dashed and semi-transparent
    //             line: {
    //                 dash: 'dash',
    //                 color: 'rgba(0, 0, 0, 0.5)',
    //             },
    //         }
    //     ],
    //         {
    //             xaxis: {
    //                 title: 'Reference Frame',
    //                 domain: [0, 0.85],
    //             },
    //             yaxis: {
    //                 title: 'User Frame',
    //                 domain: [0, 1],
    //             },
    //             title: "DTW Path",
    //             showlegend: false,
    //         }, // layout
    //         { // config
    //             staticPlot: true, 
    //             responsive: true,
    //         }
    //     );
        
    //     const jointByJointDiv = document.createElement("div");
    //     element.appendChild(jointByJointDiv);

    //     type Data = import("plotly.js-dist-min").Data;
    //     const jointByJointData: Data[] = summary.jointByJointPaths.map((path, i) => {
    //         return {
    //             x: path.map((point) => point[0]),
    //             y: path.map((point) => point[1]),
    //             mode: 'lines+markers',
    //             type: 'scatter',
    //             name: `${Object.keys(BodyInnerAnglesComparisons)[i]} (cost=${summary.jointByJointDistances[i].distance.toFixed(2)})`,
    //             xaxis: 'reference',
    //             yaxis: 'user',
    //         }
    //     });

    //     // add reference line
    //     jointByJointData.push({
    //         x: [0, maxDtwValue],
    //         y: [0, maxDtwValue],
    //         mode: 'lines',
    //         type: 'scatter',
    //         name: 'Reference Diagonal',
    //         line: {
    //             dash: 'dash',
    //             color: 'rgba(0, 0, 0, 0.5)',
    //         },
    //         showlegend: false,
    //     });

    //     Plotly.newPlot(
    //         jointByJointDiv, 
    //         jointByJointData,
    //         {
    //             xaxis: {
    //                 title: 'Reference Frame',
    //                 domain: [0, 0.85],
    //             },
    //             yaxis: {
    //                 title: 'User Frame',
    //                 domain: [0, 1],
    //             },
    //             title: "DTW Path by Joint",
    //             showlegend: true,
    //             legend: {
    //                 x: 0.5,
    //                 y: -0.10
    //               }
    //         }, // layout
    //         { // config
    //             staticPlot: true, 
    //             responsive: true,
    //         }
    //     );
    // }
}