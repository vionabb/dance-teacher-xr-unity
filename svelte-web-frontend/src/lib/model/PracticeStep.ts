import type { MotionVideo } from "$lib/ai/backend/IDataBackend";
import type { FrontendEvaluationTrack, FrontendPerformanceSummary } from "$lib/ai/FrontendDanceEvaluator";
import type { MotionSegmentation , MotionSegmentationNode } from "$lib/data/dances-store";
import type { PracticePlan } from "./PracticePlan";
import type { TerminalFeedback } from "./TerminalFeedback";

export type FeedbackFunction = ((opts: {
    attemptSettings: {
        startTime: number,
        endTime: number,
        playbackSpeed: number,
        referenceVideoVisible: boolean,
        userVideoVisible: boolean,
    },
    practicePlan?: PracticePlan,
    practiceStep?: PracticeStep,
    performanceSummary: FrontendPerformanceSummary | null, 
    recordedTrack:  FrontendEvaluationTrack | null
}) => Promise<TerminalFeedback | undefined>);

export type StepEndBehavior = {
    preFeedbackMessage?: string;
    llmFeedback?: {
        feedbackType: 'encouragement' | 'poseAccuracy';
    },
    completion: {
        disableManualCompletion?: boolean;
    }
}

export type PracticeStepInterfaceSettings = {
    referenceVideo: {
        visibility: 'visible' | 'hidden',
        skeleton: 'user' | 'reference' | 'none',
    },
    userVideo: {
        visibility: 'visible' | 'hidden',
        skeleton: 'user' | 'reference' | 'none',
    },
}
// 1. When marking, users will want to see the reference video, and 
//    possibly themselves. They might want to test their marking by seeing
//    only the virtual mirror. We shouldn't provide any live or terminal feedback.
//    They should be able to review a recording of their performance.
//
//    * User only needs a skeleton over their own video in order to get in frame?
//
// 2. When drilling, the user will have a variety of needs. They may want to:
//      - See the reference video, with a skeleton of themselves overlaid
//      - See their own video, with a skeleton of the reference overlaid
//      - See both videos, with a skeleton of themselves overlaid

export const PracticeInterfaceModes = {
    watchDemo : {
        referenceVideo: {
            visibility: 'visible',
            skeleton: 'none',
        },
        userVideo: {
            visibility: 'hidden',
        skeleton: 'none',
        },
    } as PracticeStepInterfaceSettings,

    userVideoOnly : {
        referenceVideo: {
            visibility: 'hidden',
            skeleton: 'none',
        },
        userVideo: {
            visibility: 'visible',
            skeleton: 'user',
        },
    } as PracticeStepInterfaceSettings,

    bothVideos : {
        referenceVideo: {
            visibility: 'visible',
            skeleton: 'none',
        },
        userVideo: {
            visibility: 'visible',
            skeleton: 'user',
        },
    } as PracticeStepInterfaceSettings,
} as const;

export type PracticeStepModeKey = keyof typeof PracticeInterfaceModes;
export const PracticeInterfaceModeOptions: Record<PracticeStepModeKey, string> = {
    watchDemo: 'Demo Video',
    bothVideos: 'Demo + Mirror',
    userVideoOnly: 'Mirror',
} as const;
export const PracticeStepDefaultInterfaceSetting: PracticeStepModeKey = 'bothVideos';
export default interface PracticeStep {
    id: string;
    title: string;
    startTime: number;
    endTime: number;
    interfaceMode: PracticeStepModeKey;
    terminalFeedbackEnabled: boolean;
    showUserSkeleton: boolean;
    playbackSpeed: number;
    segmentDescription: string;

    parentActivityId?: string;

    motionVideo?: MotionVideo;
    motionSegmentation?: MotionSegmentation;
    motionSegmentationNode?: MotionSegmentationNode;

    speedAdjustment?: {
        enabled: boolean;
        speedOptions: number[];
    };

    feedbackFunction?: FeedbackFunction;

    state?: {
        completed?: boolean;
    }
};