import { browser } from '$app/environment';
import {
	type Pose3DLandmarkFrame,
	PostMessages as PoseEstimationMessages,
	ResponseMessages as PoseEsimationResponses
} from '$lib/webcam/mediapipe-utils';
import type { NormalizedLandmark, PoseLandmarkerResult } from '@mediapipe/tasks-vision';
import EventHub from '$lib/utils/EventHub';

export type PoseEstimationResultDetail = {
	frameId: number;
	estimated2DPose: NormalizedLandmark[] | null;
	estimated3DPose: Pose3DLandmarkFrame | null;
	srcWidth: number;
	srcHeight: number;
};

type PoseEstimationEventMap = {
	poseEstimationResult: PoseEstimationResultDetail;
};

export class PoseEstimationService {
	lastFrameSent = -1;
	lastFrameSentTimestamp = 0 as number;
	lastFrameEstimated = -1;
	lastFrameStreamId = undefined as string | undefined;
	lastEstimated2DPose = null as null | NormalizedLandmark[];
	worker = null as Worker | null; //null;
	poseEstimationInProgress = false;

	poseEstimationResetPromise: Promise<void> | null = null;
	resolvePoseEstimationReset: (() => void) | null = null;
	rejectPoseEstimationReset: (() => void) | null = null;

	private eventHub = new EventHub<PoseEstimationEventMap>();

	constructor() {
		if (!browser) return;

		this.worker = new Worker(new URL('$lib/webcam/pose-estimation.worker.ts', import.meta.url));
		this.worker.onmessage = this.onWorkerMessage.bind(this);
	}

	onWorkerMessage(msg: MessageEvent<{ type: string; [key: string]: unknown }>) {
		if (!msg.data.type) {
			console.error('PoseEstimationService:: invalid msg from PoseEstim worker', msg);
			return;
		}

		if (msg.data.type === PoseEsimationResponses.poseEstimation) {
			this.poseEstimationInProgress = false;
			// this.lastFrameReceivedTimestamp = new Date().getTime();

			// if (msg.data.frameId === INITIALIZING_FRAME_ID) {
			//     // Resolve the pose estimation primed promise, so that
			//     // anything waiting on it can continue.
			//     resolvePoseEstimationPrimed?.();
			//     return;
			// }

			this.lastFrameEstimated = msg.data.frameId;
			const landmarkerResult = msg.data.landmarkerResult as PoseLandmarkerResult | null;
			const allDetectedPersonsNormalizedLandmarks = landmarkerResult?.landmarks ?? [];
			const estimated2DPose = allDetectedPersonsNormalizedLandmarks[0] ?? null; // get the pose of the first detected person
			const allDetectedPersons3DLandmarks = landmarkerResult?.worldLandmarks ?? [];
			const estimated3DPose = allDetectedPersons3DLandmarks[0] ?? null; // get the pose of the first detected person

			this.lastEstimated2DPose = estimated2DPose;

			const eventDetail: PoseEstimationResultDetail = {
				frameId: msg.data.frameId ?? (NaN as number),
				estimated2DPose: this.lastEstimated2DPose ?? (null as NormalizedLandmark[] | null),
				estimated3DPose: estimated3DPose ?? (null as Pose3DLandmarkFrame | null),
				srcWidth: msg.data.srcWidth as number,
				srcHeight: msg.data.srcHeight as number
			};

			// Todo: use event mechanism to publish events
			this.lastEstimated2DPose = estimated2DPose;
			this.eventHub.emit('poseEstimationResult', eventDetail);
			// onPoseEstimationResult(eventDetail);
		} else if (
			msg.data.type === PoseEsimationResponses.error ||
			msg.data.type === PoseEsimationResponses.resetError
		) {
			console.error(
				'PoseEstimationService:: Got error from PoseEstimation worker',
				msg.data.type,
				msg.data.error
			);

			if (msg.data.frameId === this.lastFrameSent) {
				this.lastFrameSent = -1;
				this.lastEstimated2DPose = null;
			}
		} else if (msg.data.type == PoseEsimationResponses.resetComplete) {
			console.log('PoseEstimationService:: Pose Estimation Reset Complete');
			this.lastFrameSent = -1;
			this.lastEstimated2DPose = null;
			this.poseEstimationInProgress = false;
			this.resolvePoseEstimationReset?.();
		}
	}

	addEventListener<K extends keyof PoseEstimationEventMap>(
		type: K,
		listener: (payload: PoseEstimationEventMap[K]) => void
	): void {
		this.eventHub.subscribe(type, listener);
	}

	removeEventListener<K extends keyof PoseEstimationEventMap>(
		type: K,
		listener: (payload: PoseEstimationEventMap[K]) => void
	): void {
		this.eventHub.unsubscribe(type, listener);
	}

	async estimatePose(frameId: number, streamId: string, timestampMs: number, imageData: ImageData) {
		if (!this.worker) {
			console.error('PoseEstimationService:: estimatePose called but worker is not initialized');
			return;
		}

		if (this.poseEstimationInProgress) {
			// If pose estimation is already in progress, we can skip this frame
			// to avoid overloading the worker.
			console.warn(
				'PoseEstimationService:: estimatePose called while pose estimation is in progress. Skipping frame',
				frameId
			);
			return;
		}

		this.poseEstimationInProgress = true;

		const streamIdChange = this.lastFrameStreamId !== streamId;
		const isFirstFrame = this.lastFrameSent < 0;
		const isOutOfOrderFrame = timestampMs <= this.lastFrameSentTimestamp;

		if (streamIdChange || isFirstFrame || isOutOfOrderFrame) {
			this.poseEstimationResetPromise = new Promise<void>((res, rej) => {
				this.resolvePoseEstimationReset = res;
				this.rejectPoseEstimationReset = rej;
			});

			// call reset on the worker if the streamId has changed
			const reasons = ([] as string[]).concat(
				streamIdChange
					? [`streamId changed (new: ${streamId}, old: ${this.lastFrameStreamId})`]
					: [],
				isFirstFrame ? [`first frame`] : [],
				isOutOfOrderFrame
					? [`out of order frame (${timestampMs} <= ${this.lastFrameSentTimestamp}`]
					: []
			);

			console.log(
				'PoseEstimationService:: Resetting pose estimation worker due to ' + reasons.join(', ')
			);
			this.worker?.postMessage({
				type: PoseEstimationMessages.reset,
				frameId: new Date().getTime()
			});

			await this.poseEstimationResetPromise;
		}

		this.lastFrameSent = frameId;
		this.lastFrameStreamId = streamId;
		this.lastFrameSentTimestamp = timestampMs;
		this.worker?.postMessage(
			{
				type: PoseEstimationMessages.requestPoseEstimation,
				frameId: frameId,
				timestampMs: timestampMs,
				width: imageData.width,
				height: imageData.height,
				imageBuffer: imageData.data.buffer, // Explicitly assign the transferable object to the "image" property
				colorSpace: imageData.colorSpace
			},
			[imageData.data.buffer]
		);
	}

	// queuePoseEstimation(
	//     frameId: number,
	//     srcWidth: number,
	//     srcHeight: number,
	// ) {

	// }
}

//   /**
//      * Sets flag that will initiate priming the pose estimation
//      * pipeline by performing an estimation on a frame.
//      */
//     export async function primePoseEstimation() {
//         if (!poseEstimationEnabled || !poseEstimationWorker || !canvasContext || !canvasElement) {
//             throw new Error("Pose estimation not enabled, or not yet ready.");
//         }

//         console.log("Priming pose estimation")
//         poseEstimationPrimedPromise = new Promise<void>((res) => resolvePoseEstimationPrimed = res);

//         const timeSinceStart = new Date().getTime() - mirrorStartedTime;

//         // Send a single pose estimation request to the worker to make sure it's ready
//         poseEstimationWorker.postMessage({
//             type: PoseEstimationMessages.requestPoseEstimation,
//             frameId: INITIALIZING_FRAME_ID,
//             timestampMs: timeSinceStart, // any negative value should do. Just need to make sure the timestampMs is increasing
//             image: canvasContext!.getImageData(0, 0, canvasElement!.width, canvasElement!.height)
//         });

//         return poseEstimationPrimedPromise;
//     }

//     $effect(() => {
//         if (poseEstimationEnabled && !poseEstimationWorker) {
//             setupPoseEstimation()
//         }
//     });

const service = new PoseEstimationService();
export default service;
