import type { DrawingUtils, NormalizedLandmark, LandmarkData } from "@mediapipe/tasks-vision";
import { SwapLeftRightLandmarks } from "$lib/webcam/mediapipe-utils";

import {feedback_YellowThreshold, feedback_GreenThreshold} from '$lib/model/settings';
import { QijiaMethodComparisonVectors } from "./EvaluationCommonUtils";
import type { FrontendLiveEvaluationResult } from "./FrontendDanceEvaluator";
import { browser } from "$app/environment";

let ResolvedDrawingUtils: typeof import ('@mediapipe/tasks-vision').DrawingUtils | undefined;

if (browser) {
    import("@mediapipe/tasks-vision").then(m => ResolvedDrawingUtils = m.DrawingUtils);
}

const QijiaMethodVectorConnections = QijiaMethodComparisonVectors.map(([lm1, lm2]) => {
    return {
        start: lm1,
        end: lm2,
    }
});

// function getComparisonVectorIndex(lmData: LandmarkData) {
//     for(const [i, [lm1, lm2]] of QijiaMethodComparisonVectors.entries()) {
//         if ((lm1 === lmData.from || lm1 === lmData.to) && (

//         )) {
//             return i;
//         }
//     }
//     return null
// }

let greenThreshold = 0;
feedback_GreenThreshold.subscribe((val) => {
    greenThreshold = val;
});
let yellowThreshold = 0;
feedback_YellowThreshold.subscribe((val) => {
    yellowThreshold = val;
});

function getVectorColor(lmData: LandmarkData, evaluationResult: FrontendLiveEvaluationResult | null) {
    
    const score = evaluationResult?.qijia2DPoseEvaluation?.vectorByVectorScore?.[lmData.index ?? -1];
    if (score === undefined) return 'white';
    
    if (score >= greenThreshold) return 'green';
    if (score >= yellowThreshold) return 'yellow';
    return 'red';
}

export function Draw2dSkeleton(
    ctx: CanvasRenderingContext2D, 
    pose: null | NormalizedLandmark[], 
    evaluationResult: FrontendLiveEvaluationResult | null,
    flipLeftRight = false) 
{
    if (!pose) return;

    if (flipLeftRight) {
        pose = SwapLeftRightLandmarks(pose);
    }

    if (!ResolvedDrawingUtils) return;
    
    // We'll color code only the vectors with the lowest score
    const drawUtils = new ResolvedDrawingUtils(ctx);
    drawUtils.drawConnectors(
        pose, 
        QijiaMethodVectorConnections,
        { 
            color: (lm) => getVectorColor(lm, evaluationResult), 
            lineWidth: 4,
        }
    );
}