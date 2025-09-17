<script lang="ts">
	import type { ServiceWorkerMessageSession } from './../service-worker.ts';
	import { run } from 'svelte/legacy';

	import '../app.pcss';
	import { tick, onMount, setContext } from 'svelte';
	import { webcamStream } from '$lib/webcam/streams';
	import NavBar, { navbarProps } from '$lib/elements/NavBar.svelte';
	import './styles.scss';
	import SettingsPage from '$lib/pages/SettingsPage.svelte';
	import CloseButton from '$lib/elements/CloseButton.svelte';
	import { invalidate } from '$app/navigation';
	import { waitSecs } from '$lib/utils/async';
	import Dialog from '$lib/elements/Dialog.svelte';
	import { navigating } from '$app/stores';
	import { debugMode } from '$lib/model/settings';
	import type { User } from '@supabase/supabase-js';
	import { NEXT_PUBLIC_SUPABASE_ANON_KEY, NEXT_PUBLIC_SUPABASE_URL } from '$env/static/public';
	

	let showingSettings = $state(false);
	async function toggleSettings(setValue?: boolean) {
		showingSettings = !showingSettings;
		showingSettings = setValue ?? showingSettings;
	}

	let { data, children } = $props();
	const { supabase, databackend } = (data);
	let { session } = $derived(data);

	// Setting client as context is a convenient way to give non-route Svelve elements
	// access to the Supabase client -- otherwise, we'd need to make this properties of every
	// page element that needs it and pass from the route .svelte files.
	// svelte-ignore state_referenced_locally
	import { writable } from 'svelte/store';

	const userStore = writable(data.user ?? null);
	setContext('user', userStore);

	// Listen for auth state changes and update the user store accordingly
	const { data: authData } = supabase.auth.onAuthStateChange(async (_, newSession) => {

		const newUser = await supabase.auth.getUser();
		userStore.set(newUser.data.user ?? null);

		if (newSession?.expires_at !== session?.expires_at) {
			// this triggers to root +layout.ts to run the load function to run again
			invalidate('supabase:auth');
		}
	});

	// No need to make this a writeable store since it doesn't become invalid 
	// with session changes (it will use the latest session internally)
	setContext('supabase', supabase);

	onMount(() => {
		// Register service worker
		if ('serviceWorker' in navigator) {
			const serviceWorkerUrl = new URL('./../service-worker', import.meta.url)
			navigator.serviceWorker.register(serviceWorkerUrl)
				.then(reg => {
					console.log('Service worker registered:', reg);
				})
				.catch(err => {
					console.error('Service worker registration failed:', err);
				});
		}

		const { data } = supabase.auth.onAuthStateChange((_, newSession) => {
			if (newSession?.expires_at !== session?.expires_at) {
				invalidate('supabase:auth');
			}

			const message: ServiceWorkerMessageSession = {
				type: 'SUPABASE_SESSION',
				session: {
					supabase_url: NEXT_PUBLIC_SUPABASE_URL,
					supabase_anon_key: NEXT_PUBLIC_SUPABASE_ANON_KEY,
					access_token: newSession?.access_token ?? '',
					refresh_token: newSession?.refresh_token ?? '',
					user_id: newSession?.user.id ?? ''
				}
			};
			if (navigator.serviceWorker.controller) {
				navigator.serviceWorker.controller.postMessage(message);
				console.debug('Sent session update to service worker');
			} else {
				console.error('No service worker controller to send message to');
			}
		});

		return () => data.subscription.unsubscribe();
	});

</script>

<NavBar on:settingsButtonClicked={() => toggleSettings()} settingsActive={showingSettings} />
<div class="app-content" class:noNavBar={$navbarProps.collapsed}>
	{@render children?.()}
</div>

<!-- <div class="inset-4 flex items-center justify-center" 
	class:absolute={showNavigationOverlay}
	class:hidden={showNavigationOverlay}>

	<div class="daisy-card w-96 bg-neutral text-neutral-content">
		<div class="daisy-card-body items-center text-center">
		  <h2 class="daisy-card-title"><span class="daisy-loading daisy-loading-ring daisy-loading-lg"></span></h2>
		  <p>Navigating</p>
		</div>
	</div>
</div> -->
<Dialog
	bind:open={showingSettings}
	modal={true}
	showCloseButton={true}
	closeWhenClickedOutside={true}
	on:dialog-closed={() => (showingSettings = false)}
>
	{#snippet title()}
		<span>Settings</span>
	{/snippet}
	<SettingsPage user={data.user ?? null} on:navigate={() => toggleSettings(false)} />
</Dialog>

<style lang="scss">
	.app-content {
		// display: flex;
		// flex-direction: column;
		--content_height: calc(100vh - var(--navbar_height));
		min-height: var(--content_height);
		// align-items: center;
		// justify-content: center;
		--navbar_height: 4rem;
	}

	.app-content.noNavBar {
		--content_height: 100vh;
		--navbar_height: 0;
	}
</style>
