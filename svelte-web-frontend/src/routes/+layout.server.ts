// src/routes/+layout.server.ts
import type { LayoutServerLoad } from './$types';
import { dev } from '$app/environment';
import { isLoopbackClientAddress } from '$lib/server/client-address';
import { RESEARCH_STUDIES } from '$lib/server/research-hosted';

export const load: LayoutServerLoad = async ({
	locals: { safeGetSession, supabase },
	cookies,
	getClientAddress,
	depends
}) => {
	depends('supabase:auth');
	const { session, user } = await safeGetSession();
	let hasResearchAccess = false;
	if (user) {
		const { data, error } = await supabase
			.from('research_access')
			.select('study')
			.eq('user_id', user.id);
		if (error && !['PGRST205', '42P01'].includes(error.code)) throw error;
		hasResearchAccess =
			!error && Boolean(data?.some((row) => RESEARCH_STUDIES.includes(row.study)));
	}

	return {
		hasResearchAccess,
		localResearchAccess: dev && isLoopbackClientAddress(getClientAddress()),
		session,
		user,
		cookies: cookies.getAll()
	};
};
