
import type PracticeStep from "$lib/model/PracticeStep";
import { GenerateDrillFeedback } from "./drill-step";

export function CreateFulloutStep(
    segmentDescription: string,
    startTime: number,
    endTime: number,
): PracticeStep {
    
    const fulloutStep: PracticeStep = {
        segmentDescription: segmentDescription,
        startTime: startTime,
        endTime: endTime,
        id: 'fullOut',
        title: 'Full Out',
        purpose: 'mastery',
        interfaceMode: 'userVideoOnly',
        terminalFeedbackEnabled: true,
        showUserSkeleton: false,
        playbackSpeed: 1,
        feedbackFunction: GenerateDrillFeedback,
    }
    return fulloutStep;
}