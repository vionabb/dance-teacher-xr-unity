<script module lang="ts">
	import DropdownButton from './../elements/DropdownButton.svelte';
	import type { TerminalFeedback } from '$lib/model/TerminalFeedback';
    export type PracticePageState = "waitWebcam" | "waitStart" | 'waitStartUserInteraction' | "countdown" | "playing" | "paused" | "feedback";
    export const INITIAL_STATE: PracticePageState = "waitWebcam";
</script>
<script lang="ts">

import { danceVideoVolume, debugMode__addPlaceholderAchievement, metric__3dskeletonsimilarity__badJointStdDeviationThreshold, practiceActivities__enablePerformanceRecording, practiceActivities__interfaceMode, practiceActivities__terminalFeedbackEnabled, practiceActivities__showUserSkeleton } from './../model/settings';
import { v4 as generateUUIDv4 } from 'uuid';
import { evaluation_summarizeSubsections, summaryFeedback_skeleton3d_mediumPerformanceThreshold, summaryFeedback_skeleton3d_goodPerformanceThreshold } from '$lib/model/settings';
// import { replaceJSONForStringifyDisplay } from '$lib/utils/formatting';
import { findDanceTreeNode, getAllLeafNodes, getAllNodesInSubtree, makeDanceTreeSlug } from '$lib/data/dances-store';
import { pauseInPracticePage, debugPauseDurationSecs, debugMode, useAIFeedback } from '$lib/model/settings';
import { GetPixelLandmarksFromNormalizedLandmarks, type Pose3DLandmarkFrame } from '$lib/webcam/mediapipe-utils';
import type PracticeStep from "$lib/model/PracticeStep";
import { getDanceVideoSrc, load2DPoseInformation, type Dance, type PoseReferenceData, load3DPoseInformation, type DanceTreeNode } from "$lib/data/dances-store";
import { generateFeedbackNoPerformance, generateFeedbackRuleBased, generateFeedbackWithClaudeLLM } from '$lib/ai/feedback';
import { Draw2dSkeleton } from '$lib/ai/SkeletonFeedbackVisualization'
import VideoWithSkeleton from "$lib/elements/VideoWithSkeleton.svelte";
import VirtualMirror from "$lib/elements/VirtualMirror.svelte";
import poseEstimationService, { type PoseEstimationResultDetail } from '$lib/services/PoseEstimationService';
import metronomeClickSoundSrc from '$lib/media/audio/metronome.mp3';
import { onMount, createEventDispatcher, tick, getContext } from "svelte";
import { webcamStream } from '$lib/webcam/streams';
import { MirrorXPose, type Pose2DPixelLandmarks } from '$lib/webcam/mediapipe-utils';
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import TerminalFeedbackScreen from '$lib/elements/TerminalFeedbackScreen.svelte';
import { getFrontendDanceEvaluator, type FrontendDanceEvaluator, type FrontendPerformanceSummary, type FrontendLiveEvaluationResult, type FrontendEvaluationTrack } from '$lib/ai/FrontendDanceEvaluator';
import ProgressEllipses from '$lib/elements/ProgressEllipses.svelte';
import { goto } from '$app/navigation';
import type { GeneratePracticeStepOptions } from '$lib/ai/TeachingAgent/TeachingAgent';
import frontendPerformanceHistory from '$lib/ai/frontendPerformanceHistory';
import Dialog from '$lib/elements/Dialog.svelte';
import { browser } from '$app/environment';
import { waitSecs } from '$lib/utils/async';
import { PracticeStepDefaultInterfaceSetting, PracticeInterfaceModes, type PracticeStepInterfaceSettings, type FeedbackFunction } from '$lib/model/PracticeStep';
import PracticeActivityConfigurator from '$lib/elements/PracticeActivityConfigurator.svelte';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SegmentedProgressBarPropsWithoutCurrentTime } from '$lib/elements/SegmentedProgressBar.svelte';
import SegmentedProgressBar from '$lib/elements/SegmentedProgressBar.svelte';
import PerformanceReviewPage from '$lib/pages/PerformanceReviewPage.svelte';
import type { PracticePlan } from '$lib/model/PracticePlan';
import PlayableVideoWithSkeleton from '$lib/elements/PlayableVideoWithSkeleton.svelte';

import BarCharIcon from 'virtual:icons/mdi/bar-chart';
const supabase = getContext('supabase') as SupabaseClient;

interface Props {
    mirrorForEvaluation?: boolean;
    dance: Dance;
    practiceStep: PracticeStep | null;
    practicePlan?: PracticePlan | undefined;
    pageActive?: boolean;
    flipVideo?: boolean;
    continueBtnTitle?: string;
    continueBtnIcon?: any;
    progressBarProps?: SegmentedProgressBarPropsWithoutCurrentTime | undefined;
}

let {
    mirrorForEvaluation = true,
    dance,
    practiceStep = $bindable(null as PracticeStep | null),
    practicePlan = undefined,
    pageActive = false,
    flipVideo = false,
    continueBtnTitle = 'Continue',
    continueBtnIcon = 'check' as 'nextarrow' | 'check',
    progressBarProps = undefined
}: Props = $props();

let mainContinueButton: HTMLButtonElement | undefined = $state();
let hasProgressBar = $derived(progressBarProps !== undefined);

let showingPerformanceReviewPage = $state(false);
let interfaceSettings: PracticeStepInterfaceSettings = $derived(PracticeInterfaceModes[practiceStep?.interfaceMode ?? PracticeStepDefaultInterfaceSetting]);
let skeletonDrawingEnabled: boolean = $derived(practiceStep?.showUserSkeleton ?? true);
let terminalFeedbackEnabled: boolean = $derived(practiceStep?.terminalFeedbackEnabled ?? true);

let isDoingSomeSortOfFeedback = $derived(
    (terminalFeedbackEnabled ?? false)
        || (skeletonDrawingEnabled && interfaceSettings.referenceVideo.visibility === 'visible' && interfaceSettings.referenceVideo.skeleton === 'user')
        || (skeletonDrawingEnabled && interfaceSettings.userVideo.visibility === 'visible' && interfaceSettings.userVideo.skeleton === 'user')
);

const dispatch = createEventDispatcher<{
    stateChanged: PracticePageState;
    'continue-clicked': undefined;
    nextClicked: undefined;
}>();

let fitVideoToFlexbox = true;

let hasVisibleReferenceVideo: boolean = $derived(interfaceSettings.referenceVideo.visibility === 'visible');

let pageState: PracticePageState = $state(INITIAL_STATE); 

let hasUserWebcamVisible: boolean = $derived(interfaceSettings.userVideo.visibility === 'visible' ||
    isDoingSomeSortOfFeedback && pageState=== 'waitWebcam');

let isPlayingOrCountdown: boolean = $derived(pageState=== "playing" || pageState=== "countdown");
let isShowingFeedback: boolean = $derived(pageState=== 'feedback');
let feedbackDialogOpen: boolean = $state(false);
let isMounted = false;

let currentActivityStepIndex: number = 0;

let countdown = $state(-1);
let countdownActive = $state(false);

let clickAudioElement: HTMLAudioElement;
let virtualMirrorElement: VirtualMirror | undefined = $state();
let videoWithSkeleton: PlayableVideoWithSkeleton | undefined = $state();
let videoCurrentTime: number = $state(0);
let videoPlaybackSpeed: number = $state(1);
let videoDuration: number = $state(0);
let videoVolume: number = $state(0.5);
let isVideoPausedBinding: boolean = $state(true);
let danceSrc: string = $state('');
let poseEstimationEnabled: boolean = $derived(
    pageActive 
        && isDoingSomeSortOfFeedback 
        &&  (countdownActive || !isVideoPausedBinding || pageState==="paused")
);

let containingDanceTreeLeafNodes = $derived.by(() => {
    if (practiceStep?.danceTreeNode && $evaluation_summarizeSubsections == "leafnodes") {
        return getAllLeafNodes(practiceStep.danceTreeNode).filter((node) => node.id !== practiceStep?.danceTreeNode?.id);
    } else if (practiceStep?.danceTreeNode && $evaluation_summarizeSubsections == "allnodes") {
        return getAllNodesInSubtree(practiceStep.danceTreeNode).filter((node) => node.id !== practiceStep?.danceTreeNode?.id);
    }
    return [] as DanceTreeNode[]
});

let beatDuration = $derived.by(() => {
    const danceBpm = dance?.bpm ?? 60;
    const danceSecsPerBeat = 60 / danceBpm;
    return danceSecsPerBeat / videoPlaybackSpeed;
});

let poseEstimationReady: Promise<void> | null = null;
let referenceDancePoses2D: PoseReferenceData<Pose2DPixelLandmarks> | null = $state(null);
let referenceDancePoses3D: PoseReferenceData<Pose3DLandmarkFrame> | null = null;

let customizedPlaybackSpeed: number | undefined = $state(undefined);
let effectivePlaybackSpeed: number = $derived( customizedPlaybackSpeed ?? practiceStep?.playbackSpeed ?? 1.0);
const defaultCustomSpeedOptions = [0.25, 0.5, 0.75, 0.9, 1]

let lastEvaluationResult: FrontendLiveEvaluationResult | null = $state(null);
let evaluator: FrontendDanceEvaluator | null = $state(null);
let trialId = $state(null as string | null);
let performanceSummary = $state(null as FrontendPerformanceSummary | null);
let terminalFeedback: TerminalFeedback | null = $state(null);

let feedbackPromise: Promise<TerminalFeedback | undefined> | null = $state(null);
let videoRecording: {
    url: string;
    mimeType: string;
    referenceVideoUrl: string;
    recordingSpeed: number;
    recordingStartOffset: number;
} | undefined = $state(undefined);

const debugPauseDuration = 10.0; // if pauseInPracticePage is enabled, we'll pause for this many seconds midway through playback
let currentPlaybackEndtime = $state(practiceStep?.endTime ?? 0);

let webcamRecorderMimeType = 'video/webm';
let webcamRecorder: MediaRecorder | null = null;
let webcamRecordedChunks: Blob[] = [];

let resolveWebcamRecordedObjectUrl: ((url: string) => void) | null = null;  
let rejectWebcamRecordedObjectUrl: ((reason?: any) => void) | null = null;
let webcamRecordedObjectURL: Promise<string> | null = null;



let lastNAttemptsAngleSimilarity = $derived(
    frontendPerformanceHistory.lastNAttempts(
        practiceStep?.dance?.clipRelativeStem ?? 'undefined',
        'skeleton3DAngleSimilarity',
        20,
    )
);

let unpauseVideoTimeout: number | null  = $state(null);
function unPauseVideo() {
    unpauseVideoTimeout = null;
    currentPlaybackEndtime = practiceStep?.endTime ?? videoDuration;
    isVideoPausedBinding = false;
    pageState= "playing";
}

async function getFeedback(perfSummary: FrontendPerformanceSummary | null, recordedTrack:  FrontendEvaluationTrack | null) {
    if (gettingFeedback) return;

    gettingFeedback = true;
    
    webcamRecorder?.stop();
    let videoURL: undefined | string = undefined;
    if (webcamRecordedObjectURL) {
        videoURL = await webcamRecordedObjectURL;
    }
    if (videoURL) {
        videoRecording = {
            url: videoURL,
            mimeType: webcamRecorderMimeType,
            referenceVideoUrl: danceSrc,
            recordingStartOffset: practiceStep?.startTime ?? 0,
            recordingSpeed: effectivePlaybackSpeed,
        };
    }

    // const attemptHistory = $lastNAttemptsAngleSimilarity.map((a) => {
    //     return {
    //         score: a.summary?.overall ?? NaN, 
    //         date: a.date,
    //         segmentId: a.segmentId
    //     }
    // });

    let feedback: TerminalFeedback | undefined = undefined;

    if (!practiceStep?.feedbackFunction) {
        feedback = generateFeedbackNoPerformance(
            dance.clipRelativeStem,
            $frontendPerformanceHistory,
            practiceStep?.danceTreeNode?.id ?? '',
        );
    } else {
        feedback = await practiceStep.feedbackFunction({
            attemptSettings: {
                startTime: practiceStep?.startTime ?? 0,
                endTime: practiceStep?.endTime ?? videoDuration,
                playbackSpeed: effectivePlaybackSpeed,
                referenceVideoVisible: interfaceSettings.referenceVideo.visibility === 'visible',
                userVideoVisible: interfaceSettings.userVideo.visibility === 'visible',
            },
            practicePlan,
            practiceStep,
            performanceSummary: perfSummary, 
            recordedTrack
        });
    }

    // if ($useAIFeedback && !feedback) {
    //     try {
    //         const perfHistory = $frontendPerformanceHistory;
    //         const dancePerfHistory = practiceStep?.dance?.clipRelativeStem ? perfHistory?.[practiceStep.dance.clipRelativeStem] ?? null : null;
    //         feedback = await generateFeedbackWithClaudeLLM(
    //             practiceStep?.danceTree,
    //             practiceStep?.danceTreeNode?.id ?? 'undefined',
    //             performanceSummary ?? undefined,
    //             dancePerfHistory ?? undefined,
    //             $summaryFeedback_skeleton3d_mediumPerformanceThreshold,
    //             $summaryFeedback_skeleton3d_goodPerformanceThreshold,
    //             $metric__3dskeletonsimilarity__badJointStdDeviationThreshold,
    //             attemptHistory,
    //         )
    //     } catch(e) {
    //         console.warn("Error generating feedback with AI - falling back to rule-based feedback", e);
    //     }
    // }

    // if (!feedback) {
    //     const qijiaOverallScore = performanceSummary?.wholePerformance.qijia2DSkeletonSimilarity.overallScore ?? 0;
    //     const qijiaByVectorScores = performanceSummary?.wholePerformance.qijia2DSkeletonSimilarity.vectorByVectorScore ?? {} as Record<string, number>;

    //     const perfHistory = $frontendPerformanceHistory;
    //     const dancePerfHistory = practiceStep?.dance?.clipRelativeStem ? perfHistory?.[practiceStep.dance.clipRelativeStem] ?? null : null;
    //     feedback = generateFeedbackRuleBased(
    //         qijiaOverallScore, 
    //         qijiaByVectorScores,
    //         dancePerfHistory ?? undefined,
    //         practiceStep?.danceTreeNode?.id,
    //     );
    // }



    gettingFeedback = false;

    if ($debugMode && $debugMode__addPlaceholderAchievement) {
        feedback?.achievements?.push("placeholder achievement");
    }

    return feedback;
}

let gettingFeedback = false;

async function playClickSound(silent: boolean = false) {
    clickAudioElement.currentTime = 0;
    clickAudioElement.volume = silent ? 0 : 1;
    return clickAudioElement.play();
}

let mediaElementsHaveBeenActivated = false;

async function startCountdown() {
    if (!videoWithSkeleton) {
        console.warn('startCountdown: videoWithSkeleton not ready');
        return;
    }
    if (countdownActive) return;
    
    isVideoPausedBinding = true;
    pageState= "countdown";
    countdownActive = true;

    // Safari / webkit disallows media elements from auto-playing without user interaction. We
    // want to be able to control the playback of the video element programatically, which safari
    // will only allow once the user has triggered playback through a user interaction. So, we try 
    // starting playback at the beginning of the countdown. If the 
    if (!mediaElementsHaveBeenActivated) {
        videoCurrentTime = practiceStep?.startTime ?? 0;
        videoVolume = 0.01;
        videoPlaybackSpeed = 0.0625;// Minimum playback rate: https://stackoverflow.com/questions/30970920/html5-video-what-is-the-maximum-playback-rate
        let testPlaybackSuccessful = true;
        try {
            await playClickSound(true);
            await videoWithSkeleton.play();
            mediaElementsHaveBeenActivated = true;
        }
        catch(e) {
            testPlaybackSuccessful = false
            console.warn('startCountdown: test playback unsuccessful. Will try again after user interaction.', e);
        }
    }

    isVideoPausedBinding = true;
    videoCurrentTime = practiceStep?.startTime ?? 0;
    videoVolume = $danceVideoVolume;
    videoPlaybackSpeed = effectivePlaybackSpeed;

    if (!mediaElementsHaveBeenActivated) {
        pageState= 'waitStartUserInteraction';
        countdownActive = false;
        return;
    }

    clickAudioElement.volume = 1;
    await tick();
    await waitSecs(beatDuration);

    pageState= "countdown";
    countdownActive = true;
    await waitSecs(beatDuration);

    countdown = 5;
    playClickSound();
    await waitSecs(beatDuration);
    if (!isMounted) return

    countdown = 6;
    playClickSound();
    await waitSecs(beatDuration);
    if (!isMounted) return

    countdown = 7;
    playClickSound();
    await waitSecs(beatDuration);
    if (!isMounted) return

    countdown = 8;
    playClickSound();
    await waitSecs(beatDuration);
    if (!isMounted) return

    trialId = generateUUIDv4();
    pageState= "playing";
    
    countdown = -1;

    resolveWebcamRecordedObjectUrl = null;
    rejectWebcamRecordedObjectUrl = null;
    webcamRecordedObjectURL = null;
    webcamRecorder?.stop();
    webcamRecorder = null;
    webcamRecordedChunks = [];

    if ($practiceActivities__enablePerformanceRecording && $webcamStream) {
        webcamRecordedObjectURL = new Promise((resolve, reject) => {
            resolveWebcamRecordedObjectUrl = resolve;
            rejectWebcamRecordedObjectUrl = reject;
        });

        if (MediaRecorder.isTypeSupported('video/webm')) {
            webcamRecorderMimeType = 'video/webm';
        } else if (MediaRecorder.isTypeSupported('video/mp4')) {
            webcamRecorderMimeType = 'video/mp4';
        } else {
            console.warn('No supported MediaRecorder mime type found, defaulting to video/webm');
            webcamRecorderMimeType = 'video/webm';
        }
        webcamRecorder = new MediaRecorder($webcamStream, { mimeType: webcamRecorderMimeType });
        webcamRecordedChunks = [];
        webcamRecorder.addEventListener('dataavailable', (e) => {
            webcamRecordedChunks.push(e.data);
        });
        webcamRecorder.addEventListener('stop', () => {
            let recordedVideoURL = URL.createObjectURL(new Blob(webcamRecordedChunks, {type: webcamRecorderMimeType}));
            resolveWebcamRecordedObjectUrl?.(recordedVideoURL);
        });
        webcamRecorder.start();
    }

    isVideoPausedBinding = false;
    countdownActive = false;
}

export async function reset(start: boolean = false) {
    console.log('Reseting practice page');
    showingPerformanceReviewPage = false;

    if (unpauseVideoTimeout !== null) {
        clearTimeout(unpauseVideoTimeout);
    }
    if (!practiceStep) {
        console.warn('Null practice activity during reset() call');
    }

    if(!virtualMirrorElement) {
        await tick();
    }
    if (!virtualMirrorElement) {
        console.warn('Virtual mirror element not ready during reset() call');
        return;
    }

    terminalFeedback = null;
    feedbackDialogOpen = false;
    mainContinueButton?.focus();
    trialId = null;
    currentActivityStepIndex = 0;
    pageState= "waitWebcam";
    lastEvaluationResult = null;
    isVideoPausedBinding = true;
    videoRecording = undefined;
    videoCurrentTime = practiceStep?.startTime ?? 0;
    const playDuration = (practiceStep?.endTime ?? videoDuration) - (videoCurrentTime)
    currentPlaybackEndtime = $pauseInPracticePage ? videoCurrentTime + playDuration / 2 : practiceStep?.endTime ?? videoDuration;

    // Start doing these 3d tasks in parallel, wait for them
    // all to complete betore continuing.
    const promises = [] as Promise<any>[];
    if (virtualMirrorElement && hasUserWebcamVisible) {
        promises.push(virtualMirrorElement.webcamStartedPromise);
    }
    let ref2dPosesPromise: ReturnType<typeof load2DPoseInformation> | null = null;
    let ref3dPosesPromise: ReturnType<typeof load3DPoseInformation> | null = null;
    if (!referenceDancePoses2D) {
        ref2dPosesPromise = load2DPoseInformation(supabase, dance);
        promises.push(ref2dPosesPromise);
    }  
    if (!referenceDancePoses3D) {
        ref3dPosesPromise = load3DPoseInformation(supabase, dance);
        promises.push(ref3dPosesPromise);
    }
    if (ref2dPosesPromise) { referenceDancePoses2D = await ref2dPosesPromise; }
    if (ref3dPosesPromise) { referenceDancePoses3D = await ref3dPosesPromise; }
    await Promise.all(promises);

    pageState= "waitStart";

    evaluator = getFrontendDanceEvaluator(
        referenceDancePoses2D!,
        referenceDancePoses3D!
    );

    isVideoPausedBinding = true;
    videoCurrentTime = practiceStep?.startTime ?? 0;

    await tick();

    // TODO: prime pose estimation
    // if (poseEstimationEnabled) {
    //     console.log("Triggering pose estimation priming");
    //     await virtualMirrorElement.primePoseEstimation();
    // }

    await waitSecs(beatDuration);

    // pageState= 'waitStartUserInteraction';
    // showStartCountdownDialog = true;
    if (start ?? false) {
        startCountdown();
    } else {
        pageState= 'waitStartUserInteraction';
    }
}


let poseEstimationCorrespondances: Map<number, {
    videoTimeSecs: number;
    actualTimeInMs: number;
    pageState: PracticePageState;
}> = new Map();
let lastPoseEstimationVideoTime: number = -1;
let lastPoseEstimationSentTimestamp: Date = new Date();
const maximumPoseEstimationFrequencyHz = 10;
const minimumPoseEsstimationIntervalMs = 1000 / maximumPoseEstimationFrequencyHz;

function poseEstimationFrameSent(frameId: number, timestampMs: number) {
    // Associate the webcam frame being sent for pose estimation
    // with the current video timestamp, so that we can later
    // compare the user's pose with the dance pose at that time.
    // console.log("poseEstimationFrameSent", e.detail.frameId, videoCurrentTime);
    poseEstimationCorrespondances.set(frameId, {
        videoTimeSecs: videoCurrentTime,
        actualTimeInMs: Date.now(),
        pageState: pageState,
    });
    lastPoseEstimationVideoTime = videoCurrentTime;
}

/**
 * An override function used by the virtual mirror element to determine
 * whether or not to send the next frame to pose estimation. When pose estimation
 * is enabled (`poseEstimationEnabled`), VirtualMirror will call this function
 * just before sending the next frame to pose estimation. If this function returns
 * false, the frame will not be sent. This is useful for limiting the frequency
 * of pose estimation to save resources during situations when high pose estimation
 * frequency is unnecessary (such as during the countdown when the video is paused).
 */
function shouldSendNextPoseEstimationFrame() {

    // When the video is paused (such as during countdown), limit the fps 
    // of pose estimation to avoid wasting resources.
    if (
        lastPoseEstimationVideoTime === videoCurrentTime && 
        lastPoseEstimationSentTimestamp.getTime() > Date.now() - minimumPoseEsstimationIntervalMs
    ) {
        return false;
    }
    return true;
}

function poseEstimationFrameReceived(detail: PoseEstimationResultDetail) {
     // console.log("poseEstimationFrameReceived", e.detail.frameId, e.detail.result);

    if (!referenceDancePoses2D) {
        console.log("No dance pose information", detail);
        return;
    };
    
    const frameId = detail.frameId;
    if (!poseEstimationCorrespondances.has(frameId)) {
        console.log(`No matching correspondance for ${frameId}`, detail, "current correspondances: ", poseEstimationCorrespondances)
        return;
    };
    const {
        videoTimeSecs,
        actualTimeInMs,
        pageState
    } = poseEstimationCorrespondances.get(frameId)!;

    poseEstimationCorrespondances.delete(frameId);

    const srcWidth = detail.srcWidth;
    const srcHeight = detail.srcHeight;
    const userNormalizedPose = (detail.estimated2DPose ?? null) as NormalizedLandmark[] | null;
    const user3DPose = (detail.estimated3DPose ?? null) as Pose3DLandmarkFrame | null;
    if (!userNormalizedPose || !user3DPose) { return; }

    // Flip normalized pose, since the user will be mirroring the dance
    let evaluation2DPose = GetPixelLandmarksFromNormalizedLandmarks(userNormalizedPose, srcWidth, srcHeight);
    let evaluation3DPose = user3DPose;MirrorXPose
    if (mirrorForEvaluation) {
        const userDanceFlippedNormalizedPose = MirrorXPose(userNormalizedPose);
        const userDanceFlippedPixelPose = GetPixelLandmarksFromNormalizedLandmarks(userDanceFlippedNormalizedPose, srcWidth, srcHeight);
        evaluation2DPose = userDanceFlippedPixelPose;
        evaluation3DPose = MirrorXPose(user3DPose);
    }
    if (!evaluation2DPose) { return; }
    try {
        lastEvaluationResult = evaluator?.evaluateFrame(
            trialId, 
            dance.clipRelativeStem,
            practiceStep?.segmentDescription ?? 'undefined',
            videoTimeSecs,
            actualTimeInMs,
            evaluation2DPose,
            evaluation3DPose,
            pageState !== 'playing' || trialId === null,
        ) ?? null;
    }
    catch (e) {
        lastEvaluationResult = null;
        console.warn('Error evaluating frame', e);
    }
}

let drawReferenceDanceSkeleton = false;
let toggleSkeletonInvervel: null | number = null;
//  window.setInterval(() => {
//     drawReferenceDanceSkeleton = !drawReferenceDanceSkeleton;
// }, 1000);

onMount(() => {
    if (!virtualMirrorElement) {
        console.warn('Virtual mirror element not ready during onMount() call');
    }

    // Prepare pose estimation, so that it'll be ready 
    // when we need it, as opposed to creating the model
    // after the video starts playing.
    clickAudioElement = new Audio(metronomeClickSoundSrc);
    videoCurrentTime = practiceStep?.startTime ?? 0;
    poseEstimationReady = Promise.resolve(); //virtualMirrorElement?.setupPoseEstimation() ?? Promise.reject("Virtual mirror is undefined or setupPoseEstimation returned a null promise");
    reset();
    isMounted = true;

    return () => {
        if (unpauseVideoTimeout) {
            clearTimeout(unpauseVideoTimeout);
        }
        if (toggleSkeletonInvervel) {
            clearInterval(toggleSkeletonInvervel);
        }
        if (webcamRecorder) {
            webcamRecorder.stop();
            webcamRecorder = null;
        }
        isMounted = false;
    }
})

function onContinueClicked() {
    reset(false);
    dispatch('nextClicked');
}


// this is the effect that keeeps doing to infinite depth
// Auto-pause the video when the practice activity is over
$effect(() => {
    if (pageState=== "feedback" || pageState=== "paused"){
        return;
    }

    if ((practiceStep?.endTime && videoCurrentTime >= currentPlaybackEndtime) || 
        (videoDuration > 0 && videoCurrentTime >= videoDuration)) {

        isVideoPausedBinding = true;
        console.log('Pausing video');

        if (currentPlaybackEndtime >= (practiceStep?.endTime ?? videoDuration)) {
            console.log("Practice activity is over");
            pageState= "feedback";
            
            terminalFeedback = null;
            performanceSummary = null;
            let recordedTrack = null as null | FrontendEvaluationTrack;
            
            let subsequences = Object.fromEntries(
                containingDanceTreeLeafNodes.map((node) => 
                    [node.id, { startTime: node.start_time, endTime: node.end_time }]
                )
            );

            if (trialId) {
                performanceSummary = evaluator?.generatePerformanceSummary(
                    trialId, 
                    subsequences,
                    "terminalfeedback-plots"
                ) ?? null;
                
                console.log("saving performance summary", $state.snapshot(performanceSummary));
                recordedTrack = performanceSummary?.adjustedTrack ?? null;
            }
            trialId = null;

           
            feedbackPromise = getFeedback(performanceSummary, recordedTrack);
            feedbackDialogOpen = true;
            feedbackPromise
                .then(feedback => {
                    terminalFeedback = feedback ?? null;
                    feedbackDialogOpen = true;
                    performanceSummary = performanceSummary;
                });
        }
        else {
            console.log("Reached a pause point in the middle of the practice activity");
            pageState= "paused"
            if (unpauseVideoTimeout === null) {
                unpauseVideoTimeout = window.setTimeout(unPauseVideo, 1000 * $debugPauseDurationSecs);
            }
        }
    }
});

$effect(() => {
    console.log("PracticePage state", pageState);
    dispatch('stateChanged', pageState);
});

$effect(() => {
    console.log("VideoDuration", videoDuration);
});

$effect(() => {
    console.log("New performance summary", performanceSummary);
})

$effect(() => {
    // reset the customized playback speed if it's not valid for the current practice step
    if (customizedPlaybackSpeed && 
        (!practiceStep?.speedAdjustment?.enabled ||
        practiceStep.speedAdjustment?.speedOptions.indexOf(customizedPlaybackSpeed) === -1
        )) 
    {
        customizedPlaybackSpeed = undefined;
    } 
});

$effect(() => {
    console.log('trialId changed, now is: ', trialId);
});

$effect(() => {
    danceSrc = getDanceVideoSrc(supabase, dance);
});

</script>

<section class="practicePage" 
    class:hasDanceTree={practiceStep?.danceTree}
    class:hasProgressBar={hasProgressBar}
    class:hasFeedback={isShowingFeedback}
    class:isPracticing={!isShowingFeedback}
    class:hasOnlyDemoVideo={hasVisibleReferenceVideo && !hasUserWebcamVisible}
    class:hasOnlyUserMirror={hasUserWebcamVisible && !hasVisibleReferenceVideo}
    >

    <div class="demovid gridItem" style:display={!hasVisibleReferenceVideo ? 'none' : 'flex'}>
        <PlayableVideoWithSkeleton
            bind:this={videoWithSkeleton}
            bind:currentTime={videoCurrentTime}
            bind:playbackRate={videoPlaybackSpeed}
            bind:paused={isVideoPausedBinding}
            bind:duration={videoDuration}
            flipHorizontal={flipVideo}
            fitToFlexbox={fitVideoToFlexbox}
            poseData={referenceDancePoses2D}
            drawSkeleton={drawReferenceDanceSkeleton}
            volume={videoVolume}
            src={danceSrc}
        >
            {#snippet children()}
                <source src={danceSrc} type="video/mp4" />    
            {/snippet}
        </PlayableVideoWithSkeleton>
    </div>
    <div 
        class="mirror gridItem flex"
        class:hidden={!hasUserWebcamVisible}
        >
        <div class="absolute inset-0">
            <VirtualMirror
                bind:this={virtualMirrorElement}
                {poseEstimationEnabled}
                drawSkeleton={false}
                poseEstimationCheckFunction={shouldSendNextPoseEstimationFrame}
                customDrawFn={(ctx, pose) => {
                    if (!skeletonDrawingEnabled) return;
                    
                    const evalResToPass = skeletonDrawingEnabled ? lastEvaluationResult : null;
                    Draw2dSkeleton(ctx, pose, evalResToPass, mirrorForEvaluation);
                }}
                onPoseEstimationFrameSent={poseEstimationFrameSent}
                onPoseEstimationResult={poseEstimationFrameReceived}
            />
    </div>
    </div>
    {#if hasProgressBar && progressBarProps !== undefined}

    <div class="progressBar flex items-center flex-col space-y-4">
        <SegmentedProgressBar {...progressBarProps} 
            currentTime={videoCurrentTime} />
        <div class="flex gap-4 w-full justify-between" >
            <div class="left space-x-4 flex items-center">
                <DropdownButton position="top">
                    {#snippet buttonTitle()}
                            <span class="iconify-[icon-park-solid--speed] text-xl"></span>
                            {effectivePlaybackSpeed.toFixed(2)}x
                    {/snippet}
                    <div class="daisy-card daisy-card-compact bg-neutral text-neutral-content mb-1">
                        <div class="daisy-card-body grid grid-cols-2-maxcontent items-center">

                            <label for="speedSelect">Speed</label>
                            <select id="speedSelect" disabled={!practiceStep?.speedAdjustment?.enabled} 
                                    class="daisy-select daisy-select-sm daisy-select-bordered max-w-xs" 
                                    bind:value={customizedPlaybackSpeed}>
                                <option selected value={undefined}>Default {`(${(practiceStep?.playbackSpeed ?? 1).toFixed(2)}x)`}</option>
                                {#each practiceStep?.speedAdjustment?.speedOptions ?? [] as speed}
                                    <option value={speed}>{speed.toFixed(2)}x</option>
                                {/each}
                            </select>
                        </div>
                    </div>
                </DropdownButton>
            
            </div>
            <div class="center space-x-4">
                <button 
                    
                    class="daisy-btn" 
                    class:daisy-btn-primary={pageState=== 'waitStartUserInteraction'}
                    disabled={countdownActive || pageState=== "waitWebcam"} 
                    bind:this={mainContinueButton}
                    onclick={() => reset(true)}
                >
                    {#if pageState=== 'waitStartUserInteraction'}
                        Start Countdown
                    {:else if pageState=== 'feedback'}
                        Do Again
                    {:else if pageState=== "playing"}
                        Restart
                    {:else if pageState=== "waitWebcam"}
                        Waiting for webcam
                    {:else}
                        <span class="daisy-loading daisy-loading-spinner"></span>
                    {/if}
                </button>
            </div>
            <div class="right space-x-4">
                {#if videoRecording !== undefined && pageState === "feedback" && $practiceActivities__enablePerformanceRecording}
                <button 
                    class="daisy-btn" 
                    onclick={() => {showingPerformanceReviewPage = !showingPerformanceReviewPage}}>
                    <BarCharIcon class="text-xl" />
                    Review
                </button>
                {/if}
                <div class="daisy-dropdown  daisy-dropdown-top daisy-dropdown-end"
                    class:daisy-dropdown-open={feedbackDialogOpen}
                    class:hidden={pageState!== "feedback"}>
                    <button class="daisy-btn daisy-btn-neutral" tabindex="0" onclick={() => {
                        feedbackDialogOpen = !feedbackDialogOpen;
                        // unfocus the dialog
                        if (!feedbackDialogOpen) {
                            mainContinueButton?.focus();
                        }
                        
                    }}>Feedback
                        {#if feedbackDialogOpen}
                            <span class="iconify-[lucide--chevron-up]"></span>
                        {:else}
                            <span class="iconify-[lucide--chevron-down]"></span>
                        {/if}
                    
                    </button>
                    <div class="daisy-dropdown-content daisy-card daisy-card-compact w-[55ch] max-w-[90vw] h-auto p-2 m-1 shadow bg-neutral text-neutral-content">
                        <div class="daisy-card-body space-y-4 overflow-y-scroll"
                            style="max-height: calc(100vh - 10rem);">
                            <TerminalFeedbackScreen 
                                feedback={terminalFeedback}
                                performanceSummary={performanceSummary ?? undefined}
                            />

                            <div id="terminalfeedback-plots">
                            </div>

                            <div class="text-center">
                                <div class="daisy-join">
                                    <button class="daisy-btn daisy-join-item" 
                                        onclick={() => reset(true)}
                                        class:daisy-btn-accent={terminalFeedback?.suggestedAction === "repeat"}>
                                        Do Again
                                    </button>
                                    <button 
                                        class="daisy-btn daisy-join-item" 
                                        class:daisy-btn-success={terminalFeedback?.suggestedAction === "next"}
                                        onclick={() => onContinueClicked()}
                                    >
                                        {continueBtnTitle}

                                        {#if continueBtnIcon === "nextarrow"}
                                            <span class="iconify-[lucide--arrow-big-right]"></span>
                                        {:else if continueBtnIcon === "check"}
                                            <span class="iconify-[lucide--check-circle]"></span>
                                        {/if}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>     
            </div>
        </div>
    </div>
    {/if}

    <Dialog 
        open={showingPerformanceReviewPage && videoRecording !== undefined} 
        on:dialog-closed={() => showingPerformanceReviewPage = false }>
        {#snippet title()}
            <span>Performance Review</span>
        {/snippet}
        <div class="reviewPageWrapper">
            {#if videoRecording !== undefined}
            <PerformanceReviewPage 
                recordingUrl={videoRecording.url}
                recordingMimeType={videoRecording.mimeType}
                referenceVideoUrl={videoRecording.referenceVideoUrl}
                recordingStartOffset={videoRecording.recordingStartOffset}
                recordingSpeed={videoRecording.recordingSpeed}
            />
            {/if}
        </div>
    </Dialog>

    {#if countdown >= 0}
    <div class="absolute inset-0 flex justify-center items-center">
        <div class="bg-accent rounded-full p-4 size-24 text-accent-content grid items-center justify-center shadow-xl">
            <span class="text-6xl">
                {countdown}
            </span>
        </div>
    </div>
    {/if}
</section>

<style lang="scss">

.demovid { 
    grid-area: demovid; 
    max-height: calc(100% - 94px - 1rem);
}
.mirror {  grid-area: mirror;  }
// .feedback { grid-area: feedback; overflow: hidden;}

.practicePage {
    overflow: hidden;
    display: grid;
    grid-template: "demovid mirror" 1fr / 1fr 1fr;
    align-items: center;
    justify-content: stretch;
    box-sizing: border-box;
    height: 100%;
    width: 100%;
    gap: 1rem;

    &.hasOnlyDemoVideo {
        grid-template: "demovid" 1fr / 1fr;
    }
    &.hasOnlyUserMirror {
        grid-template: "mirror" 1fr / 1fr;
    }

    &.hasProgressBar {
        grid-template: "demovid mirror" 1fr 
            "progress progress" auto / 1fr 1fr;

        &.hasOnlyDemoVideo {
            grid-template: "demovid" 1fr 
                "progress" auto / 1fr;
        }
        &.hasOnlyUserMirror {
            grid-template: "mirror" 1fr 
                "progress" auto / 1fr;
        }
    }

    & > .gridItem {
        place-self: center;
        position: relative;
        flex-grow: 1;
        flex-shrink: 1;
        flex-basis: 1rem;
        width: 100%;
        height: 100%;
        border-radius: 0.5em;
        display: flex;
        align-items: stretch;
        justify-content: stretch;
        flex-direction: column;
    }

    .progressBar {
        grid-area: progress; 
    }
}

// .countdown {
//     position: absolute;
//     top: 0;
//     left: 0;
//     right: 0;
//     bottom: 0;
//     display: flex;
//     align-items: center;
//     justify-content: center;
//     pointer-events: none;
// }

// .count {
//     width: 4rem;
//     height: 4rem;
//     text-align: center;
//     font-size: 4rem;
//     font-weight: bold;
//     color: white;
//     background-color: rgba(0, 0, 0, 0.2);
//     //  add background blur
//     backdrop-filter: blur(5px);
//     -webkit-backdrop-filter: blur(5px);

//     padding: 3rem;
//     border-radius: 50%;
// }

.hidden {
    position: absolute !important; 
    left: 9999vw !important;
}

</style>