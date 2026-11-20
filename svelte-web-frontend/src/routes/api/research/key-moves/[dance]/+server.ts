import { json } from '@sveltejs/kit';
import { KEY_MOVE_LIMITS } from '$lib/research/key-moves';
import { privateHeaders, readAnalysisMutation } from '$lib/server/hosted-analysis';
import { saveKeyMoves } from '$lib/server/reference-key-moves';
import type { RequestHandler } from './$types';

/** Appends one revision holding the caller's whole key-move set for a reference dance. */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const body = await readAnalysisMutation(request, KEY_MOVE_LIMITS.bodyBytes);
	return json(await saveKeyMoves(locals, params.dance, body), { headers: privateHeaders });
};
