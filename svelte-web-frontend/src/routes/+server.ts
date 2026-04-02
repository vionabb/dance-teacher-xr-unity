import { json, redirect, type RequestEvent } from '@sveltejs/kit';

export async function GET(event: RequestEvent) {
	if (!event.locals.session) {
		redirect(303, '/login');
	}
	redirect(303, '/menu');
}
