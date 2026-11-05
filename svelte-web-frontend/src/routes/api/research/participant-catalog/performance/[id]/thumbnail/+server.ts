import { requireHostedPerformance, privateHeaders } from '$lib/server/hosted-analysis';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ locals, params }) => {
	await requireHostedPerformance(locals, params.id);
	return new Response(
		'<svg xmlns="http://www.w3.org/2000/svg" width="240" height="135" viewBox="0 0 240 135"><rect width="240" height="135" fill="#172338"/><text x="120" y="72" text-anchor="middle" fill="white" font-size="16">Open performance</text></svg>',
		{
			headers: {
				...privateHeaders,
				'Content-Type': 'image/svg+xml',
				'X-Content-Type-Options': 'nosniff'
			}
		}
	);
};
