
import type { FeedbackFunction } from "$lib/model/PracticeStep";
import type PracticeStep from "$lib/model/PracticeStep";
import type { TerminalFeedback, TerminalFeedbackAction } from "$lib/model/TerminalFeedback";
import { summaryFeedback_skeleton3d_goodPerformanceThreshold, summaryFeedback_skeleton3d_mediumPerformanceThreshold } from "$lib/model/settings";
import { get } from "svelte/store";
import { getLLMResponse } from "../feedback";
import { distillPracticePlan } from "../textual-distillation";

export function CreateDrillStep(
    segmentDescription: string,
    startTime: number,
    endTime: number,
): PracticeStep {
    
    const drillStep: PracticeStep = {
        segmentDescription: segmentDescription,
        startTime: startTime,
        endTime: endTime,
        id: 'drill',
        title: 'Drilling',
        purpose: 'drill',
        interfaceMode: 'bothVideos',
        terminalFeedbackEnabled: true,
        showUserSkeleton: true,
        playbackSpeed: 0.75,
        speedAdjustment: {
            enabled: true,
            speedOptions: [0.33, 0.5, 0.75, 1],
        },
        feedbackFunction: GenerateDrillFeedback,
    }
    return drillStep;
}

const HUMAN_PROMPT = '\n\nHuman:';
const AI_PROMPT = '\n\nAssistant:';

export const GenerateDrillFeedback: FeedbackFunction = async (args) => {

    let prompt = `${HUMAN_PROMPT} You are an AI dance coach and you are giving feedback to a dancer, who is learning a dance choreography from a dance video. `;

    if (args.practicePlan) {
        prompt += distillPracticePlan(args.practicePlan);
    }

    const allActivities = args.practicePlan?.stages.flatMap((stage) => stage.activities) ?? [];
    const parentActivity = allActivities.find((activity) => activity.id === args.practiceStep?.parentActivityId);

    prompt += `They have performed the "${args.practiceStep?.title}" step of the practice plan, as part of the "${parentActivity?.title}" activity, and the system has analyzed their performance. `

    let suggestedAction: TerminalFeedbackAction = 'repeat'; 
    const score = args.performanceSummary?.wholePerformance.skeleton3DAngleSimilarity.overallScore;
    const feedbackScore: TerminalFeedback["score"] = score ? {
        achieved: score,
        maximumPossible: 1,
    } : undefined;
    if (score) {
        const mediumPerformanceThreshold = get(summaryFeedback_skeleton3d_mediumPerformanceThreshold);
        const goodPerformanceThreshold = get(summaryFeedback_skeleton3d_goodPerformanceThreshold);

        if (score >= goodPerformanceThreshold) {
            suggestedAction = 'next';
            prompt += "The system has computed a score for their performance. They did well!"
        } else if (score >= mediumPerformanceThreshold) {
            suggestedAction = 'repeat';
            prompt += "The system has computed a score for their performance. They did okay."
        } else {
            suggestedAction = 'repeat';
            prompt += "The system has computed a score for their performance. They did poorly. "
        }
        
    } else {
        suggestedAction = 'repeat';
        prompt += "The system was not able to compute a score for their performance. As a fallback, the system suggests that they refresh the page before trying again."
    }

    if (suggestedAction === 'repeat') {
        prompt += " The system is suggesting that they repeat the current activity."
    } else if (suggestedAction === 'next') {
        prompt += " The system is suggesting that they proceed to the next activity."
    }

    prompt +=  "Can you response a message that will be spoken aloud to the user letting them know this? The suggestion on what to do next should be included in the message and phrased as a suggestive question (e.g. 'How about we try that again?', 'Shall we move on now?', etc.). ";

    prompt += "You should take the persona of an AI dance coach, and pretend that YOU, as an young, friendly, positive AI dance coach, have made these observations, thereby mimicing the experience of learning from a human dance coach. Your message should be short - not more than 2 sentances long. Please please please do not make up anything about their dance performance other than what the system has identified. Also, be aware that the system is quite limited it's ability to perceive dance performances, and the utility of the accuracy score is limited. Therefore, the message should be deferential to the user's own judgement.";

    prompt += "Please put the feedback message for the using within xml tags in the following format: <feedbackmessage>YOUR MESSAGE HERE</feedbackmessage>"

    prompt += AI_PROMPT;

    let feedbackText: string;
    try {
        const llmText = await getLLMResponse(prompt);

        const msgText = llmText.match(/<feedbackmessage>([\s\S]*?)<\/feedbackmessage>/)?.[1];

        if (!msgText) {
            throw new Error('No feedback message tags found in LLM response');
        }

        feedbackText = msgText;
    } catch (e) {
        feedbackText = "There was an error generating feedback. Please try again and consider refreshing the page."
    }
    

    const feedback: TerminalFeedback = {
        paragraphs: [
            feedbackText,
        ],
        score: feedbackScore,
        suggestedAction: 'repeat',
    }

    return feedback;
}
