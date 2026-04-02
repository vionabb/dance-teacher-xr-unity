<script lang="ts">
	import { goto } from '$app/navigation';
	import { navbarProps } from '$lib/elements/NavBar.svelte';
	import { waitSecs } from '$lib/utils/async.js';
	import { onMount } from 'svelte';

	export let data;
	export let newPassword: string = '';
	export let confirmNewPassword: string = '';

	let errorMessage = null as null | string;
	let successMessage = null as null | string;
	let submitInProgress = false;

	async function handleSubmit() {
		submitInProgress = true;
		errorMessage = null;

		if (newPassword !== confirmNewPassword) {
			errorMessage = 'Passwords do not match';
			submitInProgress = false;
			return;
		}

		const result = await data.supabase.auth.updateUser({ password: newPassword });
		if (result.error) {
			errorMessage = result.error.message;
			submitInProgress = false;
			return;
		}

		errorMessage = null;
		successMessage = 'Password updated successfully. Redirecting in 3';
		await waitSecs(1);
		successMessage = 'Password updated successfully. Redirecting in 2';
		await waitSecs(1);
		successMessage = 'Password updated successfully. Redirecting in 1';
		await waitSecs(1);

		goto('/');
	}

	onMount(() => {
		// Get the code from the query parameter
		navbarProps.set({
			collapsed: false,
			pageTitle: `Edit Password`,
			back: {
				url: '/',
				title: 'Home'
			}
		});
	});
</script>

<main>
	<form on:submit|preventDefault={handleSubmit}>
		<label for="email">Email:</label>
		<input class="outlined thin text-disabled" type="email" value={data.user?.email} disabled />
		<label for="password">New Password:</label>
		<input class="outlined thin" type="password" bind:value={newPassword} />
		<label for="confirmpassword">Confirm New Password:</label>
		<input class="outlined thin" type="confirmpassword" bind:value={confirmNewPassword} />

		<button class="daisy-btn" type="submit" disabled={submitInProgress}>Set Password</button>
		{#if errorMessage}
			<p style="color: red">{errorMessage}</p>
		{/if}
		{#if successMessage}
			<p style="color: green">{successMessage}</p>
		{/if}
	</form>
</main>

<style>
	main {
		display: flex;
		height: var(--content_height, auto);
		justify-content: center;
		align-items: center;
	}

	form {
		flex-grow: 0;
		display: grid;
		grid-template-columns: auto 1fr;
		flex-flow: column nowrap;
		gap: 0.25rem;

		& > * {
			grid-column: 1 / span 2;
		}
		& > label {
			grid-column: 1 / span 1;
			justify-self: end;
		}
		& > input {
			grid-column: 2 / span 1;
		}
	}
</style>
