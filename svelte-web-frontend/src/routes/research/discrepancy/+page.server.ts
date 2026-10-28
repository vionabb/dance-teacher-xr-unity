import { dev } from '$app/environment';
import { isLoopbackClientAddress } from '$lib/server/client-address';
import { discrepancyTasks } from '$lib/server/research-discrepancy';
import { hostedTasks } from '$lib/server/hosted-analysis';
import { privateHeaders } from '$lib/server/hosted-analysis';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, getClientAddress, setHeaders }) => {
	setHeaders(privateHeaders);
	if (dev && isLoopbackClientAddress(getClientAddress()))
		return { tasks: await discrepancyTasks(), researchBackend: 'local' as const };
	const { tasks } = await hostedTasks(locals);
	return { tasks, researchBackend: 'hosted' as const };
};
