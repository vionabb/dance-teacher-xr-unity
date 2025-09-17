import type PracticeStep from "$lib/model/PracticeStep";
import type { TerminalFeedback } from "$lib/model/TerminalFeedback";
import type { FrontendPerformanceSummary } from "./FrontendDanceEvaluator";

export type VideoRecording = {
    blob: Blob;
    mimeType: string;
    referenceVideoUrl: string;
    recordingSpeed: number;
    recordingStartOffset: number;
};

export type AttemptSettings = {
    effectivePlaybackSpeed: number;
    referenceVideoVisible: boolean;
    userVideoVisible: boolean;
}

/**
 * Interface for a practice page, exposing the functionality 
 * available to other components
 */
export interface IPracticePage {

    videoRecordingEnabled: boolean;
    enablePoseEstimation: boolean;

    /** Restarts the current activity */
    restartCurrentActivity(): void;

    /** Load Activity */
    startActivity(practiceStep: PracticeStep): void;

    /** Callback for when a practice attempt is completed */
    onPracticeAttemptCompleted?: (attempt: {
        motionVideoId: number,
        learningModelId?: string,
        attemptSettings: AttemptSettings
        attemptDurationsSecs?: number,
        videoRecording?: VideoRecording,
        performanceSummary?: FrontendPerformanceSummary,
    }) => Promise<null | TerminalFeedback>;

}