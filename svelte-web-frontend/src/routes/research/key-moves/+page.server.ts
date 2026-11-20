import { privateHeaders } from '$lib/server/hosted-analysis';
import { keyMoveDances } from '$lib/server/reference-key-moves';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	setHeaders(privateHeaders);
	return { dances: await keyMoveDances(locals) };
};
