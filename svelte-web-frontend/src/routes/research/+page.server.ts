import { dev } from '$app/environment';
import { isLoopbackClientAddress } from '$lib/server/client-address';
import { analysisAccess } from '$lib/server/hosted-analysis';
import { privateHeaders } from '$lib/server/hosted-analysis';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, getClientAddress, setHeaders }) => {
	setHeaders(privateHeaders);
	if (dev && isLoopbackClientAddress(getClientAddress()))
		return { researchBackend: 'local' as const };
	await analysisAccess(locals);
	return { researchBackend: 'hosted' as const };
};
