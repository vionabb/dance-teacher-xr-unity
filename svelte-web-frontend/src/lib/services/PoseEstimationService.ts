
import { browser } from '$app/environment';
import { poseEstimation__interFrameIdleTimeMs } from '$lib/model/settings';
import { PoseLandmarkKeys, type Pose3DLandmarkFrame, PostMessages as PoseEstimationMessages, ResponseMessages as PoseEsimationResponses, type Pose2DPixelLandmarks } from '$lib/webcam/mediapipe-utils';
import type { NormalizedLandmark, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import { webcamStream } from '../webcam/streams';    

const INITIALIZING_FRAME_ID = -1000;

export type PoseEstimationResultDetail = {
    frameId: number;
    estimated2DPose: NormalizedLandmark[] | null;
    estimated3DPose: Pose3DLandmarkFrame | null;
    srcWidth: number;
    srcHeight: number;
};


export class PoseEstimationService {
    lastFrameSent = -1;
    lastFrameReceivedTime = new Date().getTime();
    lastFrameDecoded = -1;
    lastEstimated2DPose = $state(null as null | NormalizedLandmark[]);
    worker = $state(null as Worker | null); //null;

    onWorkerMessage(msg: any) {
        
        if (!msg.data.type) {
            console.error("PoseEstimationService:: invalid msg from PoseEstim worker", msg);
            return;
        }

        if (msg.data.type === PoseEsimationResponses.poseEstimation) {

            this.lastFrameReceivedTime = new Date().getTime();

            // if (msg.data.frameId === INITIALIZING_FRAME_ID) {
            //     // Resolve the pose estimation primed promise, so that 
            //     // anything waiting on it can continue.
            //     resolvePoseEstimationPrimed?.();
            //     return;
            // }

            this.lastFrameDecoded = msg.data.frameId;
            const landmarkerResult = msg.data.landmarkerResult as PoseLandmarkerResult | null;
            const allDetectedPersonsNormalizedLandmarks = landmarkerResult?.landmarks ?? [];
            const estimated2DPose = allDetectedPersonsNormalizedLandmarks[0] ?? null; // get the pose of the first detected person

            // Todo: use event mechanism to publish events
            this.lastEstimated2DPose = estimated2DPose

            const allDetectedPersons3DLandmarks = landmarkerResult?.worldLandmarks ?? [];
            const estimated3DPose = allDetectedPersons3DLandmarks[0] ?? null; // get the pose of the first detected person
            
            const eventDetail: PoseEstimationResultDetail = {
                frameId: msg.data.frameId ?? NaN as number,
                estimated2DPose: this.lastEstimated2DPose ?? null as NormalizedLandmark[] | null,
                estimated3DPose: estimated3DPose ?? null as Pose3DLandmarkFrame | null,
                srcWidth: msg.data.srcWidth  as number,
                srcHeight: msg.data.srcHeight as number,
            }

            // Todo: use event mechanism to publish events
            this.lastEstimated2DPose = estimated2DPose

            onPoseEstimationResult(eventDetail);
            
        } else if (msg.data.type === PoseEsimationResponses.error 
                    || msg.data.type === PoseEsimationResponses.resetError
        ) {
            console.error("Got error from PoseEstim", msg.data.type, msg.data.error);

            if (msg.data.frameId === this.lastFrameSent) {
                this.lastFrameSent = -1;
                this.lastEstimated2DPose = null;
            }
        } else if (msg.data.type == PoseEsimationResponses.resetComplete) {
            console.log("Pose Estimation Reset Complete");
            this.lastFrameSent = -1;
            this.lastEstimated2DPose = null;
        }
        
    }

    setupPoseEstimation() {
        if (!browser) return;
        
        this.worker = new Worker(new URL('$lib/webcam/pose-estimation.worker.ts', import.meta.url));
        this.worker.onmessage = this.onWorkerMessage.bind(this);
    }
}

const service = new PoseEstimationService();
export default service;