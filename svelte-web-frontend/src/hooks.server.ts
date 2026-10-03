// src/hooks.server.ts
import { dev } from '$app/environment';
import { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { isDevLocalRequestAllowed, isLoopbackClientAddress } from '$lib/server/client-address';

const supabase: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(
		NEXT_PUBLIC_SUPABASE_URL,
		NEXT_PUBLIC_SUPABASE_ANON_KEY,
		{
			cookies: {
				getAll() {
					return event.cookies.getAll();
				},
				setAll(cookiesToSet) {
					/**
					 * Note: You have to add the `path` variable to the
					 * set and remove method due to sveltekit's cookie API
					 * requiring this to be set, setting the path to an empty string
					 * will replicate previous/standard behavior (https://kit.svelte.dev/docs/types#public-types-cookies)
					 */
					cookiesToSet.forEach(({ name, value, options }) =>
						event.cookies.set(name, value, { ...options, path: '/' })
					);
				}
			}
		}
	);

	/**
	 * Unlike `supabase.auth.getSession()`, which returns the session _without_
	 * validating the JWT, this function also calls `getUser()` to validate the
	 * JWT before returning the session.
	 */
	event.locals.safeGetSession = async () => {
		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		if (!session) {
			return { session: null, user: null };
		}

		const {
			data: { user },
			error
		} = await event.locals.supabase.auth.getUser();
		if (error) {
			// JWT validation has failed
			return { session: null, user: null };
		}

		return { session, user };
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			/**
			 * Supabase libraries use the `content-range` and `x-supabase-api-version`
			 * headers, so we need to tell SvelteKit to pass it through.
			 */
			return name === 'content-range' || name === 'x-supabase-api-version';
		}
	});
};

const authGuard: Handle = async ({ event, resolve }) => {
	const localPage =
		event.url.pathname === '/research' ||
		event.url.pathname.startsWith('/research/') ||
		event.url.pathname === '/metrics/qijia2d' ||
		event.url.pathname === '/metrics/viona2d';
	const localDataEndpoint =
		event.url.pathname === '/api/dev/participant-catalog' ||
		event.url.pathname.startsWith('/api/dev/participant-catalog/') ||
		event.url.pathname.startsWith('/api/dev/reference-clips/') ||
		event.url.pathname.startsWith('/api/dev/research-review/') ||
		event.url.pathname.startsWith('/api/dev/research-frame/');
	if (localDataEndpoint) {
		if (!isDevLocalRequestAllowed(event.request, event.getClientAddress(), dev))
			return new Response(null, { status: 404 });
		event.locals.session = null;
		event.locals.user = null;
		return resolve(event);
	}
	if (localPage && dev && isLoopbackClientAddress(event.getClientAddress())) {
		event.locals.session = null;
		event.locals.user = null;
		return resolve(event);
	}

	const { session, user } = await event.locals.safeGetSession();
	event.locals.session = session;
	event.locals.user = user;

	if (!event.locals.session && !event.url.pathname.startsWith('/login')) {
		redirect(303, '/login');
	}

	// if (!event.locals.session && event.url.pathname.startsWith('/private')) {
	//   redirect(303, '/auth')
	// }

	// if (event.locals.session && event.url.pathname === '/auth') {
	//   redirect(303, '/private')
	// }

	return resolve(event);
};

export const handle: Handle = sequence(supabase, authGuard);
