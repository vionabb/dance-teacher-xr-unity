import { json, type RequestEvent } from '@sveltejs/kit';

import { getFeedback as getAnthropicLLMFeedback } from '$lib/ai/backend/anthropic';
import { getFeedback as getOpenAILLMFeedback } from '$lib/ai/backend/openai';

export async function POST(event: RequestEvent) {
	const data = await event.request.json();

	const danceStructureDistillation = data.danceStructureDistillation;
	const currentSectionName = data.currentSectionName;
	const performanceDistillation = data.performanceDistillation;
	const performanceHistoryDistillation = data.performanceHistoryDistillation;
	const achivementsDistillation = data.achivementsDistillation as string | undefined;

	if (
		!danceStructureDistillation ||
		!currentSectionName ||
		!performanceDistillation ||
		!performanceHistoryDistillation
	) {
		const missingParameters = [
			danceStructureDistillation ? undefined : 'danceStructureDistillation',
			currentSectionName ? undefined : 'currentSectionName',
			performanceDistillation ? undefined : 'performanceDistillation',
			performanceHistoryDistillation ? undefined : 'performanceHistoryDistillation'
		].filter((x) => x !== undefined);

		return json(
			{
				error: 'Missing required parameters: ' + missingParameters.join(', ')
			},
			{
				status: 400
			}
		);
	}

	const feedbackData = await getOpenAILLMFeedback(
		danceStructureDistillation,
		currentSectionName,
		performanceDistillation,
		performanceHistoryDistillation,
		achivementsDistillation
	);

	return json(feedbackData);
}
