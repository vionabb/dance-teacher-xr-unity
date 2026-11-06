import { runPrompt } from '$lib/ai/backend/anthropic';
import { json, type RequestEvent } from '@sveltejs/kit';

export async function POST(event: RequestEvent) {
	const data = await event.request.json();
	const prompt = data.prompt;

	console.log('Prompt:', prompt);

	const result = await runPrompt(prompt);

	return json({ response: result });
}
