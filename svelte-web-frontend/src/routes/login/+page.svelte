<script lang="ts">
	import { navbarProps } from '$lib/elements/NavBar.svelte';
	import { onMount } from 'svelte';
	import EmailAuthView from '$lib/elements/auth/EmailAuthView.svelte';
	import { goto } from '$app/navigation';

	export let data;

	let state = 'sign_in' as 'sign_in' | 'sign_up' | 'forgot_password';

	let forgotPasswordRedirectPath: string;
	$: forgotPasswordRedirectPath = `${data.origin}/auth/callback`;
	onMount(() => {
		navbarProps.set({
			collapsed: true,
			pageTitle: 'Login'
		});
		forgotPasswordRedirectPath = `${data.origin}/auth/callback`;
		return {};
	});
	$: console.log('Redirect path: ', forgotPasswordRedirectPath);
</script>

<svelte:head>
	<title>Login | DanceTeacher</title>
	<meta name="description" content="Dance Teacher Login Page" />
</svelte:head>

<div class="mt-4 flex items-center justify-center">
	<EmailAuthView
		supabaseClient={data.supabase}
		view={state}
		{forgotPasswordRedirectPath}
		on:signedup={() => {
			goto('/menu');
			// goto("/account")
		}}
		on:signedin={() => {
			goto('/menu');
		}}
	/>
</div>

<style>
	.buttons {
		gap: 0.25rem;
	}
</style>
