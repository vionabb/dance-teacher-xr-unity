/** anthropic.ts
 *
 *  Claude (Anthropic API) backend for the LLM-generated coaching feedback.
 */
import Anthropic from '@anthropic-ai/sdk';
import { env } from '$env/dynamic/private';

// The key is read at runtime, so it is never inlined into the build output.
let client: Anthropic | undefined;
function getClient() {
	client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
	return client;
}

// Fast, low-cost model for short, latency-sensitive feedback.
const MODEL = 'claude-haiku-5-5';
const MAX_TOKENS = 16000;

async function createMessage(system: string | undefined, userContent: string): Promise<string> {
	const response = await getClient().messages.create({
		model: MODEL,
		max_tokens: MAX_TOKENS,
		// Short, latency-sensitive feedback: keep thinking light.
		output_config: { effort: 'low' },
		...(system ? { system } : {}),
		messages: [{ role: 'user', content: userContent }]
	});

	if (response.stop_reason === 'refusal') {
		throw new Error(
			`Claude declined the request (${response.stop_details?.category ?? 'unknown category'})`
		);
	}

	return response.content
		.filter((block) => block.type === 'text')
		.map((block) => block.text)
		.join('');
}

export async function runPrompt(prompt: string) {
	return createMessage(undefined, prompt);
}

export async function getFeedback(
	danceStructureDistillation: string,
	currentSectionName: string,
	performanceDistillation: string,
	performanceHistoryDistillation: string,
	achivementsDistillation?: string
): Promise<{ feedbackMessage: string }> {
	// Same inputs the previous OpenAI backend sent (it did not include the
	// performance history distillation).
	const sections: string[] = [];
	if (achivementsDistillation)
		sections.push(`<achievements>${achivementsDistillation}</achievements>`);
	if (danceStructureDistillation)
		sections.push(
			`<danceStructureDistillation>${danceStructureDistillation}</danceStructureDistillation>`
		);
	if (currentSectionName)
		sections.push(`<currentSectionName>${currentSectionName}</currentSectionName>`);
	if (performanceDistillation)
		sections.push(`<performanceDistillation>${performanceDistillation}</performanceDistillation>`);

	const text = await createMessage(taskStatement, sections.join('\n'));
	const feedbackMessage = text.match(/<feedbackmessage>([\s\S]*?)<\/feedbackmessage>/)?.[1];

	if (!feedbackMessage) {
		throw new Error(`Invalid Claude text (missing expected <feedbackmessage> tags): ${text}`);
	}

	return { feedbackMessage };
}

const taskStatement = `You are an AI dance coach and you are giving feedback to a dancer, who is learning a dance choreography from a dance video. 
They have performed a part of the dance routine, and the system has analyzed their performance and distilled it into a textual representation (surrounded by <performanceDistillation><performanceDistillation/> tags), along with other context (surrounded by <performanceDistillation><performanceDistillation/> and <performanceHistoryDistillation></performanceHistoryDistillation> tags) that you can use to provide coaching guidance. In addition, the system has detected any achievements that the user has earned with this most recent performance (surrounded by <achievements></achievements> tags, if present) - these are shown to the user in the UI.

Please generate a message that describes how they did on their performance. It should be honest, but also encouraging and respectful, and as specific and constructive as possible. It should be no more than two sentances long and surrounded by <feedbackmessage></feedbackmessage> tags. You may refer to specific data points from the distillations if you think these would be helpful for the dance student, but there is no requirement to do so, and you should never report a match score for a poor performance. Honesty is important - if you do not have specific feedback to give that is firmly grounded in the data, you should not make something up. Simply communicate that you do not have any specific feedback to give at this time. If there are any reported achievements, you should mention those here. This will be shown to the user.

In the user-visible feedback, you should refrain from going into excessive detail about the mechanics of how the feedback is being generated. Instead, you should pretend that YOU, as an AI dance coach, have made these observations, thereby mimicing the experience of learning from a human dance coach.

You should treat the student as a peer, and you should not use language that is overly formal or technical. In particular, you should not refer to the 'data' or 'distillation' you have been provided, or describe their format. Focus on the what the student would care about. If some of the system provided information is corrupted or missing, refrain from implying anything about their performance or need for more practice. Instead, simply encourage them to practice as they see fit.
`;
