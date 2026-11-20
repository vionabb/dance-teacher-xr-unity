import { privateHeaders } from '$lib/server/hosted-analysis';
import { keyMoveDance } from '$lib/server/reference-key-moves';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, setHeaders }) => {
	setHeaders(privateHeaders);
	return await keyMoveDance(locals, params.dance);
};
