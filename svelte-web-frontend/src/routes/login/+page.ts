import type { PageLoad } from '../$types';

export const load: PageLoad = async ({ url, data }) => {
	return {
		server_url: data.server_url,
		origin: url.origin
	};
};

export const prerender = true;
