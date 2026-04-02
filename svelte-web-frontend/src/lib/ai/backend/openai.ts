import { ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { OPENAI_API_KEY } from '$env/static/private';
import type { BaseLanguageModelInput } from '@langchain/core/language_models/base';

const model = new ChatOpenAI({
	apiKey: OPENAI_API_KEY,
	model: 'gpt-4o-mini'
});

export async function runPrompt(prompt: string) {
	const response = await model.invoke([new SystemMessage(prompt)]);

	const msg = response as AIMessage;
	return msg.content;
}

export async function getFeedback(
	danceStructureDistillation: string,
	currentSectionName: string,
	performanceDistillation: string,
	performanceHistoryDistillation: string,
	achivementsDistillation?: string
): Promise<{ feedbackMessage: string }> {
	const messages: Array<SystemMessage | HumanMessage> = [new SystemMessage(taskStatement)];
	if (achivementsDistillation)
		messages.push(new HumanMessage(`<achievements>${achivementsDistillation}</achievements>`));
	if (danceStructureDistillation)
		messages.push(
			new HumanMessage(
				`<danceStructureDistillation>${danceStructureDistillation}</danceStructureDistillation>`
			)
		);
	if (currentSectionName)
		messages.push(
			new HumanMessage(`<currentSectionName>${currentSectionName}</currentSectionName>`)
		);
	if (performanceDistillation)
		messages.push(
			new HumanMessage(
				`<performanceDistillation>${performanceDistillation}</performanceDistillation>`
			)
		);

	const response = await model.invoke(messages);

	const msg = response as AIMessage;
	const msgContent = msg.content as string;
	const feedbackMessage = msgContent.match(/<feedbackmessage>([\s\S]*?)<\/feedbackmessage>/)?.[1];

	if (!feedbackMessage) {
		throw new Error(
			`Invalid OpenAI Text (missing expected xml for <feedbackmessage>): ${msgContent}`
		);
	}

	return { feedbackMessage };
}

const taskStatement = `You are an AI dance coach and you are giving feedback to a dancer, who is learning a dance choreography from a dance video. 
They have performed a part of the dance routine, and the system has analyzed their performance and distilled it into a textual representation (surrounded by <performanceDistillation><performanceDistillation/> tags), along with other context (surrounded by <performanceDistillation><performanceDistillation/> and <performanceHistoryDistillation></performanceHistoryDistillation> tags) that you can use to provide coaching guidance. In addition, the system has detected any achievements that the user has earned with this most recent performance (surrounded by <achievements></achievements> tags, if present) - these are shown to the user in the UI.

Please generate a message that describes how they did on their performance. It should be honest, but also encouraging and respectful, and as specific and constructive as possible. It should be no more than two sentances long and surrounded by <feedbackmessage></feedbackmessage> tags. You may refer to specific data points from the distillations if you think these would be helpful for the dance student, but there is no requirement to do so, and you should never report a match score for a poor performance. Honesty is important - if you do not have specific feedback to give that is firmly grounded in the data, you should not make something up. Simply communicate that you do not have any specific feedback to give at this time. If there are any reported achievements, you should mention those here. This will be shown to the user.

In the user-visible feedback, you should refrain from going into excessive detail about the mechanics of how the feedback is being generated. Instead, you should pretend that YOU, as an AI dance coach, have made these observations, thereby mimicing the experience of learning from a human dance coach.

You should treat the student as a peer, and you should not use language that is overly formal or technical. In particular, you should not refer to the 'data' or 'distillation' you have been provided, or describe their format. Focus on the what the student would care about. If some of the system provided information is corrupted or missing, refrain from implying anything about their performance or need for more practice. Instead, simply encourage them to practice as they see fit.
`;
