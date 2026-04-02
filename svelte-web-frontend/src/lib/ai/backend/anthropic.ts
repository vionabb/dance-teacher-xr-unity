/** anthropic.ts
 *
 *  This file contains the code for the anthropic.ai API integration.
 *  Helpful links:
 *     > Prompt Design: https://docs.anthropic.com/claude/docs/introduction-to-prompt-design
 *     > Useful Hacks: https://docs.anthropic.com/claude/docs/let-claude-say-i-dont-know
 */
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';

const anthropic = new Anthropic({
	apiKey: ANTHROPIC_API_KEY
});

const taskStatement = `
${Anthropic.HUMAN_PROMPT} You are an AI dance coach and you are giving feedback to a dancer, who is learning a dance choreography from a dance video. 
They have performed a part of the dance routine, and the system has analyzed their performance and distilled it into a textual representation (surrounded by <performanceDistillation><performanceDistillation/> tags), along with other context (surrounded by <performanceDistillation><performanceDistillation/> and <performanceHistoryDistillation></performanceHistoryDistillation> tags) that you can use to provide coaching guidance. In addition, the system has detected any achievements that the user has earned with this most recent performance (surrounded by <achievements></achievements> tags, if present) - these are shown to the user in the UI.

Please generate a message that describes how they did on their performance. It should be honest, but also encouraging and respectful, and as specific and constructive as possible. It should be no more than two sentances long and surrounded by <feedbackmessage></feedbackmessage> tags. You may refer to specific data points from the distillations if you think these would be helpful for the dance student, but there is no requirement to do so, and you should never report a match score for a poor performance. Honesty is important - if you do not have specific feedback to give that is firmly grounded in the data, you should not make something up. Simply communicate that you do not have any specific feedback to give at this time. If there are any reported achievements, you should mention those here. This will be shown to the user.

In the user-visible feedback, you should refrain from going into excessive detail about the mechanics of how the feedback is being generated. Instead, you should pretend that YOU, as an AI dance coach, have made these observations, thereby mimicing the experience of learning from a human dance coach.

You should treat the student as a peer, and you should not use language that is overly formal or technical. In particular, you should not refer to the 'data' or 'distillation' you have been provided, or describe their format. Focus on the what the student would care about. If some of the system provided information is corrupted or missing, refrain from implying anything about their performance or need for more practice. Instead, simply encourage them to practice as they see fit.
`;

const example = '';

export async function runPrompt(prompt: string) {
	const params: Anthropic.CompletionCreateParamsNonStreaming = {
		prompt: prompt,
		model: 'claude-instant-1',
		max_tokens_to_sample: 4000
	};

	const completion: Anthropic.Completion = await anthropic.completions.create(params);
	const claudeText = completion.completion;
	console.log('Stop Reason', completion.stop_reason);

	return claudeText;
}

export async function getFeedback(
	danceStructureDistillation: string,
	currentSectionName: string,
	performanceDistillation: string,
	performanceHistoryDistillation: string,
	achivementsDistillation?: string
) {
	const achievmentDistillationEntry = achivementsDistillation
		? `<achievements>${achivementsDistillation}</achievements>`
		: '';

	const dynamicData = `
<danceStructureDistillation>${danceStructureDistillation}</danceStructureDistillation>
<currentSectionName>${currentSectionName}</currentSectionName>
<performanceDistillation>${performanceDistillation}</performanceDistillation>
<performanceHistoryDistillation>${performanceHistoryDistillation}</performanceHistoryDistillation>
${achievmentDistillationEntry}`;

	const prompt = taskStatement + example + dynamicData + Anthropic.AI_PROMPT;

	const claudeText = await runPrompt(prompt);
	console.log('\nLooking for tags...');

	// const coachingReflection = claudeText.match(/<coachingreflection>([\s\S]*?)<\/coachingreflection>/)?.[1];
	const feedbackMessage = claudeText.match(/<feedbackmessage>([\s\S]*?)<\/feedbackmessage>/)?.[1];
	// const nextSection = claudeText.match(/<nextsection>([\s\S]*?)<\/nextsection>/)?.[1];
	// const coachingMessage = claudeText.match(/<coachingmessage>([\s\S]*?)<\/coachingmessage>/)?.[1];
	// const feedbackTitle = claudeText.match(/<feedbacktitle>([\s\S]*?)<\/feedbacktitle>/)?.[1];

	// if (!coachingReflection) {
	//     throw new Error(`Invalid Claude Text (missing expected xml for <coachingreflection>): ${claudeText}`);
	// }
	if (!feedbackMessage) {
		throw new Error(
			`Invalid Claude Text (missing expected xml for <feedbackmessage>): ${claudeText}`
		);
	}
	// if (!nextSection) {
	//     throw new Error(`Invalid Claude Text (missing expected xml for <nextsection>): ${claudeText}`);
	// }
	// if (!coachingMessage) {
	//     throw new Error(`Invalid Claude Text (missing expected xml for <coachingmessage>): ${claudeText}`);
	// }
	// if (!feedbackTitle) {
	//     throw new Error(`Invalid Claude Text (missing expected xml for <feedbacktitle>): ${claudeText}`);
	// }

	return {
		// coachingReflection,
		feedbackMessage
		// nextSection,
		// coachingMessage,
		// feedbackTitle,
	};
}
