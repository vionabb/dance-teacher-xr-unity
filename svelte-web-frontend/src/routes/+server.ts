import { redirect, type RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { isLoopbackClientAddress } from '$lib/server/client-address';

export async function GET(event: RequestEvent) {
	if (dev && isLoopbackClientAddress(event.getClientAddress())) {
		redirect(303, '/research');
	}
	if (!event.locals.session) {
		redirect(303, '/login');
	}
	redirect(303, '/menu');
}
