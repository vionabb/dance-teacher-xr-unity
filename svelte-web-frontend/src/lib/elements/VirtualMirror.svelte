<script lang="ts">
	import { poseEstimation__interFrameIdleTimeMs } from '$lib/model/settings';
	import {
		PoseLandmarkKeys,
		type Pose3DLandmarkFrame,
		PostMessages as PoseEstimationMessages,
		ResponseMessages as PoseEsimationResponses
	} from '$lib/webcam/mediapipe-utils';
	import type {
		DrawingUtils,
		PoseLandmarker,
		NormalizedLandmark,
		PoseLandmarkerResult
	} from '@mediapipe/tasks-vision';
	import { onMount, tick, onDestroy } from 'svelte';
	import { webcamStream, webcamStreamId } from '../webcam/streams';
	import WebcamSelector from '../webcam/WebcamSelector.svelte';
	import { getContentSize } from '$lib/utils/resizing';
	import { browser } from '$app/environment';
	import type { PoseEstimationResultDetail } from '$lib/services/PoseEstimationService';
	import poseEstimationService from '$lib/services/PoseEstimationService';
	import { get } from 'svelte/store';
	import { render } from 'svelte/server';

	const INITIALIZING_FRAME_ID = -1000;

	// Whether the pose estimation has been primed with the first frame.
	// let poseEstimationStartedPriming = false;
	let resolvePoseEstimationPrimed: (() => void) | undefined;

	let webcamConnected = $state(false);
	let videoElement: HTMLVideoElement | undefined = $state(undefined);
	let canvasElement: HTMLCanvasElement | undefined = $state(undefined);
	let containerElement: HTMLDivElement | undefined = $state(undefined);
	// let webcamVideoStream: MediaStream | undefined = undefined;
	let canvasContext: CanvasRenderingContext2D | undefined = $state(undefined);
	let drawingUtils: DrawingUtils | undefined = $state(undefined);
	let renderingCanvas = $state(false);
	let poseResultListener: ((detail: PoseEstimationResultDetail) => void) | null = null;

	let tasksVisionModule: typeof import('@mediapipe/tasks-vision') | undefined = $state(undefined);
	if (browser) {
		import('@mediapipe/tasks-vision').then((m) => (tasksVisionModule = m));
	}

	let resolveWebcamStartedPromise: (() => void) | undefined;
	export const webcamStartedPromise = new Promise<void>(
		(res) => (resolveWebcamStartedPromise = res)
	);

	interface Props {
		poseEstimationEnabled?: boolean;
		drawSkeleton?: boolean;
		muted?: boolean;
		poseEstimationCheckFunction?: () => boolean;
		customDrawFn?:
			| null
			| ((ctx: CanvasRenderingContext2D, userPose: null | NormalizedLandmark[]) => void);
		poseEstimationPrimedPromise?: any;
		mirrorHorizontally?: boolean;
		onPoseEstimationResult?: (data: PoseEstimationResultDetail) => void;
		onPoseEstimationFrameSent?: (frameId: number, timestampMs: number) => void;
	}

	let {
		poseEstimationEnabled = false,
		drawSkeleton = false,
		muted = $bindable(true),
		poseEstimationCheckFunction = () => true,
		customDrawFn = null,
		poseEstimationPrimedPromise = $bindable(
			new Promise<void>((res) => (resolvePoseEstimationPrimed = res))
		),
		mirrorHorizontally = true,
		onPoseEstimationResult = () => {},
		onPoseEstimationFrameSent = () => {}
	}: Props = $props();

	let mirrorStartedTime = new Date().getTime();
	let lastFrameSentId = -1;
	let lastFrameReceivedTime = new Date().getTime();
	let lastFrameReceivedId = -1;

	let lastEstimated2DPose: null | NormalizedLandmark[] = null;

	let videoWidth = $state(1);
	let videoHeight = $state(1);
	let videoAspectRatio = $state(1);
	$effect(() => {
		videoAspectRatio = videoWidth / videoHeight;
	});

	let containerWidth = $state(1);
	let containerHeight = $state(1);
	let containerAspectRatio = $state(1);
	$effect(() => {
		containerAspectRatio = containerWidth / containerHeight;
	});

	function onLoadedVideoData() {
		if (!videoElement) {
			return;
		}
		videoWidth = videoElement.videoWidth;
		videoHeight = videoElement.videoHeight;
	}

	const resizeCanvas = () => {
		if (!canvasElement) {
			return;
		}

		if (containerAspectRatio > videoAspectRatio) {
			// The container is wider than the video.
			canvasElement.height = containerHeight;
			canvasElement.width = containerHeight * videoAspectRatio;
		} else {
			// The container is taller than the video.
			canvasElement.width = containerWidth;
			canvasElement.height = containerWidth / videoAspectRatio;
		}
	};

	onMount(() => {
		// Schedule a canvas resize
		tick().then(resizeCanvas);

		const resizeObserver = new ResizeObserver((entries) => {
			if (!containerElement) return;
			const [width, height] = getContentSize(containerElement!);
			containerWidth = width;
			containerHeight = height;
		});
		resizeObserver.observe(containerElement!);

		return () => {
			resizeObserver.unobserve(containerElement!);
		};
	});

	function connectWebcamStream() {
		if (!videoElement || !$webcamStream) {
			return;
		}
		videoElement.srcObject = $webcamStream;
		webcamConnected = true;
		if (resolveWebcamStartedPromise) {
			resolveWebcamStartedPromise();
			resolveWebcamStartedPromise = undefined;
		}
	}
	$effect(() => {
		if ($webcamStream && videoElement) {
			connectWebcamStream();
		}
	});
	$effect(() => {
		if (videoWidth && videoHeight && containerWidth && containerHeight) {
			resizeCanvas();
		}
	});

	let renderedFrameId = 0;
	function renderCanvas() {
		if (!canvasElement || !videoElement || !$webcamStream || !canvasContext) {
			return;
		}

		if (!browser) return;
		if (!tasksVisionModule) return;

		if (!renderingCanvas) {
			// if this is the first time we're rendering the canvas,
			// set up the event listeners and start the rendering loop.
			renderingCanvas = true;
		}

		if (!poseResultListener) {
			// If the listener is not set up, we can't render the canvas.
			poseResultListener = (detail: PoseEstimationResultDetail) => {
				lastFrameReceivedTime = Date.now();
				lastEstimated2DPose = detail.estimated2DPose;
				lastFrameReceivedId = detail.frameId;
				onPoseEstimationResult(detail);
			};
			poseEstimationService.addEventListener('poseEstimationResult', poseResultListener);
		}

		// canvasElement.width = videoElement.videoWidth;
		// canvasElement.height = videoElement.videoHeight;

		renderedFrameId += 1;

		const videoAspectRatio = videoElement.videoWidth / videoElement.videoHeight;
		const canvasAspectRatio = canvasElement.width / canvasElement.height;
		let drawWidth = canvasElement.width;
		let drawHeight = canvasElement.height;
		let drawX = 0;
		let drawY = 0;

		if (videoAspectRatio > canvasAspectRatio) {
			// Video is "more landscape" than the canvas,
			// so center it vertically
			drawHeight = canvasElement.width / videoAspectRatio;
			drawY = (canvasElement.height - drawHeight) / 2;
		} else {
			// Video is "more portrait" than the canvas,
			// so center it horizontally
			drawWidth = drawHeight * videoAspectRatio;
			drawX = (canvasElement.width - drawWidth) / 2;
		}
		canvasContext.clearRect(0, 0, canvasElement.width, canvasElement.height);
		canvasContext.drawImage(videoElement, drawX, drawY, drawWidth, drawHeight);

		const isValidFrame =
			drawX >= 0 &&
			drawY >= 0 &&
			drawWidth > 0 &&
			drawHeight > 0 &&
			canvasAspectRatio > 0 &&
			videoAspectRatio > 0;

		if (!isValidFrame) {
			requestAnimationFrame(renderCanvas);
			return;
		}

		// Send a new frame to be processed by the pose estimation worker
		// only after the last frame has been processed.
		const currentTime = new Date().getTime();
		const timeSinceLastFrameReceived = currentTime - lastFrameReceivedTime;
		if (
			poseEstimationEnabled &&
			lastFrameReceivedId == lastFrameSentId &&
			timeSinceLastFrameReceived > $poseEstimation__interFrameIdleTimeMs &&
			poseEstimationCheckFunction()
		) {
			const timeSinceStart = currentTime - mirrorStartedTime;
			lastFrameSentId = renderedFrameId;
			onPoseEstimationFrameSent(renderedFrameId, timeSinceStart);

			poseEstimationService.estimatePose(
				renderedFrameId,
				get(webcamStreamId),
				timeSinceStart,
				canvasContext.getImageData(drawX, drawY, drawWidth, drawHeight)
			);
		}

		// Use the custom draw function. This allows for greater customization
		// of the canvas rendering, such as drawing additional elements or effects
		// (such as color coding, etc).
		customDrawFn?.(canvasContext, lastEstimated2DPose);

		// Leave early if we're not drawing the skeleton
		if (!drawSkeleton) {
			requestAnimationFrame(renderCanvas);
			return;
		}

		canvasContext.save();

		if (lastEstimated2DPose && lastEstimated2DPose.length === PoseLandmarkKeys.length) {
			drawingUtils?.drawConnectors(
				lastEstimated2DPose,
				tasksVisionModule.PoseLandmarker.POSE_CONNECTIONS
			);
			drawingUtils?.drawLandmarks(lastEstimated2DPose, {
				radius: (data) =>
					tasksVisionModule?.DrawingUtils.lerp(data.from!.z, -0.15, 0.1, 5, 1) ?? 1.0
			});
		}
		canvasContext.restore();

		requestAnimationFrame(renderCanvas);
	}

	$effect(() => {
		if (webcamConnected && videoElement && canvasElement) {
			canvasContext = canvasElement.getContext('2d', {
				willReadFrequently: true
			})!;

			if (tasksVisionModule && !drawingUtils) {
				drawingUtils = new tasksVisionModule.DrawingUtils(canvasContext);
			}

			if (!renderingCanvas) {
				// start render-canvas loop
				renderCanvas();
			}
		}
	});

	onMount(() => {
		connectWebcamStream();
		return {};
	});

	// Clean up subscription when component is destroyed
	onDestroy(() => {
		if (poseResultListener) {
			poseEstimationService.removeEventListener('poseEstimationResult', poseResultListener);
		}
	});
</script>

<div class="wrapper" bind:this={containerElement}>
	{#if $webcamStream}
		<!-- svelte-ignore a11y_media_has_caption -->
		<video
			bind:this={videoElement}
			autoplay
			class="rounded"
			onplay={resizeCanvas}
			onloadeddata={onLoadedVideoData}
			bind:muted
			class:flippedHorizontal={mirrorHorizontally}
		></video>
		<canvas bind:this={canvasElement} class:flippedHorizontal={mirrorHorizontally}></canvas>
		<!-- <span>Pose Estimation: {poseEstimationEnabled}</span> -->
	{:else}
		<div class="absolute inset-0 rounded bg-base-200"></div>
		<div class="absolute inset-0 grid items-center justify-center">
			<WebcamSelector />
			<!-- <p>$webcamStream: {$webcamStream}</p> -->
			<!-- <p>videoElement: {videoElement}</p> -->
		</div>
	{/if}
</div>

<style>
	.flippedHorizontal {
		transform: scaleX(-1);
	}

	.wrapper {
		width: 100%;
		height: 100%;
		margin: 0;
		padding: 0;
		/* position: absolute; */
		display: flex;
		justify-content: center;
		align-items: center;
		flex-direction: column;
	}

	video {
		width: 100%;
		height: 100%;
		display: hidden;
	}

	canvas {
		/* width: 100%; */
		/* height: 100%; */
		position: absolute;
	}
</style>
