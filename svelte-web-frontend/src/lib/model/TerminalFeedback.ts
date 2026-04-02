import type { ValueOf } from '$lib/data/dances-store';

export const TerminalFeedbackBodyParts = {
	head: 0,
	torso: 1,
	leftarm: 2,
	rightarm: 3,
	leftleg: 4,
	rightleg: 5
};
export type TerminalFeedbackBodyPart = keyof typeof TerminalFeedbackBodyParts;
export type TerminalFeedbackBodyPartIndex = ValueOf<typeof TerminalFeedbackBodyParts>;

export type TerminalFeedbackAction = 'repeat' | 'next' | 'navigate';
export type TerminalFeedback = {
	// headline: string;
	paragraphs: string[];
	achievements?: string[];
	segmentName?: string;
	suggestedAction: TerminalFeedbackAction;
	navigateOptions?: { label: string; url: string; nodeId?: string }[];

	score?: {
		achieved: number;
		maximumPossible: number;
	};
	incorrectBodyPartsToHighlight?: TerminalFeedbackBodyPart[];
	correctBodyPartsToHighlight?: TerminalFeedbackBodyPart[];

	debug?: {
		llmInput?: any;
		llmOutput?: any;
	};
};
