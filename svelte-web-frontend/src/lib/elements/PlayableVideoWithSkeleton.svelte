<!-- @migration-task Error while migrating Svelte code: This migration would change the name of a slot making the component unusable -->
<script lang="ts">
import type { Snippet } from 'svelte';
import type { PoseReferenceData } from "$lib/data/dances-store";
import { createEventDispatcher, onMount } from "svelte";
import { type Pose2DPixelLandmarks, GetNormalizedLandmarksFromPixelLandmarks } from "$lib/webcam/mediapipe-utils";
import type { DrawingUtils, PoseLandmarker, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { getContentSize } from "$lib/utils/resizing";
import SegmentedProgressBar, { type SegmentedProgressBarProps, type SegmentedProgressBarPropsWithoutCurrentTime } from "./SegmentedProgressBar.svelte";
import Icon from '@iconify/svelte';
import type { MotionVideo } from '$lib/ai/backend/IDataBackend';

const dispatch = createEventDispatcher();

let videoElement: HTMLVideoElement | undefined = $state();
let canvasElement: HTMLCanvasElement | undefined = $state();
let canvasCtx: CanvasRenderingContext2D | null = $state(null);
let drawingUtils: DrawingUtils | null = null;
let tasksVisionModule: typeof import("@mediapipe/tasks-vision") | null = null;

type ControlOptions = {
    showPlayPause: boolean,
    enablePlayPause: boolean,
    showProgressBar: boolean,
    overrideStartTime? : number,
    overrideEndTime? : number,
    progressBarProps: Partial<Omit<SegmentedProgressBarProps, "currentTime">>
}
type drawVideoFn = (canvas: HTMLCanvasElement, video: HTMLVideoElement) => void;

    interface Props {
        children?: Snippet;
        extraControlButtons?: Snippet;
        fitToFlexbox?: boolean;
        currentTime?: number;
        playbackRate?: number;
        paused?: boolean;
        muted?: boolean;
        videoWidth?: number;
        videoHeight?: number;
        flipHorizontal?: boolean;
        volume?: number;
        seekable?: any;
        readyState?: number;
        preload?: "auto" | "metadata" | "none";
        src?: string | MediaStream | MediaSource | Blob | undefined;
        duration?: number;
        ended?: boolean;
        dance?: MotionVideo | null;
        poseData?: PoseReferenceData<Pose2DPixelLandmarks> | null;
        drawSkeleton?: boolean;
        controls?: ControlOptions | boolean;
        drawOnVideo?: drawVideoFn;
    }

    let { children,
        extraControlButtons,
        fitToFlexbox = false,
        currentTime = $bindable(0),
        playbackRate = $bindable(1.0),
        paused = $bindable(true),
        muted = $bindable(false),
        videoWidth = $bindable(0),
        videoHeight = $bindable(0),
        flipHorizontal = false,
        volume = $bindable(1.0),
        seekable = $bindable(undefined),
        readyState = $bindable(0),
        preload = "auto",
        src = undefined,
        duration = $bindable(0),
        ended = $bindable(false),
        controls = false,
        drawOnVideo = () => {}
    }: Props = $props();

let effectiveControls: ControlOptions | undefined = $derived.by(() => {
    if (typeof controls === "boolean") {
        return {
            showPlayPause: controls,
            enablePlayPause: controls,
            showProgressBar: controls,
            progressBarProps: {},
        }
    } else {
        return controls;
    }
});

let videoAspectRatio = $derived.by(() => {
    if (videoHeight == 0 || videoWidth == 0) {
        return 1;
    }
    return videoWidth / videoHeight
});

let progressBarEffectiveProps = $derived({
        startTime: effectiveControls.overrideStartTime ?? 0,
        endTime: effectiveControls.overrideEndTime ?? duration,
        breakpoints: [],
        labels: [],
        enableSegmentClick: false,
        isolatedSegments: undefined,
        ...effectiveControls.progressBarProps,
    } as SegmentedProgressBarPropsWithoutCurrentTime);

// Wait for metadata to be loaded before seeking to the overridden start time.
//   See: https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/readyState
//   0 = HAVE_NOTHING, 1+ has metadata and is seekable
let lastSetStartTime = $state(undefined as number | undefined);

let videoElementWidth: number = $state(0);
let videoElementHeight: number = $state(0);
let videoElementAspectRatio = $derived.by(() => {
    if (videoElementWidth > 0 && videoElementHeight > 0) {
        return videoElementWidth / videoElementHeight;
    }
    else return 1;
});

let requestedAnimationFrameId: number | null = null;

export function drawCanvas() {
    if (!canvasElement) return;
    if (!canvasCtx) {
        canvasCtx = canvasElement.getContext('2d');
    }
    if (!canvasCtx) { return; }
    if (!videoElement) { return; }

    if (!tasksVisionModule) { return; }
    if (!drawingUtils) {
        drawingUtils = new tasksVisionModule.DrawingUtils(canvasCtx);
    }
    

    // Clear the canvas from the previous frame
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);

    drawOnVideo(canvasElement, videoElement);
}


onMount(() => {
    // requestedAnimationFrameId = requestAnimationFrame(drawCanvas);

    const resizeObserver = new ResizeObserver(() => {
        if (!videoElement) return;
        const [width, height] = getContentSize(videoElement)
        videoElementWidth = width;
        videoElementHeight = height;
    })
    if (videoElement) {
        resizeObserver.observe(videoElement);
    }

    import("@mediapipe/tasks-vision").then(x => {
        tasksVisionModule = x;
    });
    return () => {
        if (videoElement) {
            resizeObserver.unobserve(videoElement);
        }
        if (requestedAnimationFrameId !== null) {
            cancelAnimationFrame(requestedAnimationFrameId);
        }
    }
});

export async function play() {
    await videoElement?.play();
}

function onPlayPauseClick() {
    const shouldContinue = dispatch("playPauseClicked", undefined, { cancelable: true });
    if (shouldContinue) {
        paused = !paused;
    }
}
function onSkipBackClicked() {
    const shouldContinue = dispatch("skipBackClicked", undefined, { cancelable: true });
    if (shouldContinue) {
        const startTime = effectiveControls?.overrideStartTime ?? 0;
        currentTime = startTime;
    }

}

$effect(() => {
    if (readyState > 0 && effectiveControls?.overrideStartTime !==  lastSetStartTime) {
        const newCurrentTime = effectiveControls.overrideStartTime ?? 0;
        currentTime = newCurrentTime;
        lastSetStartTime = newCurrentTime;
    }
});

$effect(() => {
    if (canvasElement && videoElementAspectRatio > videoAspectRatio) {
        canvasElement.width = videoElementWidth;
        canvasElement.height = videoElementHeight * videoAspectRatio;
    }
    else if (canvasElement && videoElementAspectRatio <= videoAspectRatio) {
        canvasElement.width = videoElementWidth;
        canvasElement.height = videoElementWidth / videoAspectRatio;
    }
});

</script>

<div class:fitToFlexbox={fitToFlexbox} class="videoWithSkeleton">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video 
        bind:this={videoElement}
        bind:currentTime
        bind:playbackRate
        bind:paused
        bind:volume
        bind:muted
        bind:videoWidth
        bind:videoHeight
        bind:duration
        bind:ended
        bind:readyState
        bind:seekable
        src={src as string}
        class:flipped={flipHorizontal}
        class="bg-base-200 rounded"
        preload={preload}
    >
        <!-- todo: make snippet for video <source> items -->
         {@render children?.()}
        <track kind="captions" />
    </video>
    <div class="absolute inset-0 canvas">
        <canvas class="rounded" bind:this={canvasElement}></canvas>
    </div>
    <div class="absolute inset-0 control-container p-2 gap-4">
        <span class="hidden">
            {#each seekable ?? [] as seekableRange}
                <span>{seekableRange.start}-{seekableRange.end}</span>&nbsp;
            {/each}
        </span>
        {#if effectiveControls.showProgressBar}
        <SegmentedProgressBar 
            {...progressBarEffectiveProps}
            on:segmentClicked
            currentTime={currentTime}
        />
        {/if}
        {#if effectiveControls.showPlayPause}
        <div class="flex flex-row flex-wrap justify-center gap-2">
            <button class="daisy-btn daisy-btn-square max-md:daisy-btn-sm"
                onclick={onSkipBackClicked}>
                
                <span class="iconify-[lucide--skip-back] size-6 md:size-7"></span>
                <!-- <Icon icon="uil:previous" /> -->
                
            </button>
            <button class="daisy-btn daisy-btn-square max-md:daisy-btn-sm" disabled={!effectiveControls.enablePlayPause}
                 onclick={onPlayPauseClick}>
                {#if paused}

                <span class="iconify-[lucide--play] size-6 md:size-7"></span>
                <!-- <span class="icon">
                    <Icon icon="icon-park-outline:play-one" />
                </span> -->
                {:else if !paused}                
                    <span class="iconify-[lucide--pause] size-6 md:size-7"></span>
                    <!-- <Icon icon="icon-park-outline:pause" /> -->
                {/if}
            </button>
            
            {@render extraControlButtons?.()}
            <!-- <slot name="extra-control-buttons" /> -->
        </div>
        {/if}
    </div>
    <!-- <div class="overlay debug">
        <div><strong>Pose Data:</strong>&nbsp;{poseData ? "Exists" : "Null"}</div>
        <div><strong>Pose To Draw:</strong>&nbsp;{poseToDraw ? "Exists" : "Null"}</div>
        <div><strong>Skeleton Enabled:</strong>&nbsp;{drawSkeleton}</div>
    </div> -->
</div>

<style lang="scss">

.videoWithSkeleton {
    position: relative;
    display: flex;
    flex-shrink: 1;
    flex-grow: 1;
    max-width: 100%;
    max-height: 100%;
    min-width: 0;
    min-height: 0;
    align-items: center;
    justify-content: center;
}

video {
    max-width: 100%;
    // width: 100%;
    max-height: 100%;
    border-radius: var(--std-border-radius);
}

.canvas {
    pointer-events: none;
    // position: absolute;
    // top: 0;
    // left: 0;
    // right: 0;
    // bottom: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-direction: column;
}
.control-container {
    display: flex;
    align-items: stretch;
    justify-content: flex-end;
    flex-direction: column;
}

canvas {
    background: transparent;
}

.flipped {
    transform: scaleX(-1);
}

.fitToFlexbox {
    height: 0;
    align-items: center;
    flex-direction: column;
}
.fitToFlexbox video {
    // height: 0;
    flex-grow: 1;
    flex-shrink: 1;
}

</style>