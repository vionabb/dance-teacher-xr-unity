import type { FeedbackFunction } from '$lib/model/PracticeStep';
import type PracticeStep from '$lib/model/PracticeStep';
import type { TerminalFeedback } from '$lib/model/TerminalFeedback';
import type {
	FrontendEvaluationTrack,
	FrontendPerformanceSummary
} from '../FrontendDanceEvaluator';

export function CreateMarkingStep(
	segmentDescription: string,
	startTime: number,
	endTime: number
): PracticeStep {
	const markStep: PracticeStep = {
		segmentDescription: segmentDescription,
		startTime: startTime,
		endTime: endTime,
		id: 'mark',
		title: 'Marking',
		purpose: 'marking',
		interfaceMode: 'watchDemo',
		terminalFeedbackEnabled: false,
		showUserSkeleton: false,
		playbackSpeed: 0.5,
		speedAdjustment: {
			enabled: true,
			speedOptions: [0.33, 0.5, 0.75, 1]
		},
		feedbackFunction: GenerateMarkingFeedback
	};
	return markStep;
}

const GenerateMarkingFeedback: FeedbackFunction = async (args) => {
	const feedback: TerminalFeedback = {
		paragraphs: [
			'Do you feel like you have a good understanding of the moves?',
			'If so you can move on to the next step. Otherwise feel free to mark this section a few more times.'
		],
		suggestedAction: 'repeat'
	};

	return feedback;
};
