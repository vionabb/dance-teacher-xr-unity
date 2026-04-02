<script lang="ts">
	import { goto, invalidateAll } from '$app/navigation';

	import type { SupabaseClient } from '@supabase/supabase-js';
	import { createEventDispatcher } from 'svelte';

	let dispatch = createEventDispatcher();

	export let supabaseClient: SupabaseClient;
	export let view: 'sign_in' | 'sign_up' | 'forgot_password';
	export let forgotPasswordRedirectPath = '';

	let error = '';
	let message = '';
	let loading = false;
	let email = '';
	let password = '';
	let confirmpassword = '';

	async function submit() {
		error = '';
		message = '';
		loading = true;

		if (view == 'sign_up') {
			if (confirmpassword !== password) {
				error = 'Passwords do not match';
				loading = false;
				return;
			}

			const signupResult = await supabaseClient.auth.signUp({
				email,
				password
			});

			if (signupResult.error) {
				error = signupResult.error.message;
			} else {
				dispatch('signedup', {
					session: signupResult.data.session,
					user: signupResult.data.user
				});
				message = 'Sign up successful!';
			}
		} else if (view == 'sign_in') {
			const signinResult = await supabaseClient.auth.signInWithPassword({
				email,
				password
			});

			if (signinResult.error) {
				error = signinResult.error.message;
			} else {
				dispatch('signedin', {
					session: signinResult.data.session,
					user: signinResult.data.user
				});
				message = 'Sign in successful!';
			}
		} else if (view == 'forgot_password') {
			const resetPasswordEmailResult = await supabaseClient.auth.resetPasswordForEmail(email, {
				redirectTo: forgotPasswordRedirectPath
			});

			if (resetPasswordEmailResult.error) {
				error = resetPasswordEmailResult.error.message;
			} else {
				resetPasswordEmailResult.data;
				message = 'Check your email for the password reset link';
			}
		}

		loading = false;
	}
</script>

<form on:submit|preventDefault={submit}>
	<h3 class="text-xl">
		{#if view === 'sign_in'}
			Sign In
		{:else if view === 'sign_up'}
			Create Account
		{:else if view === 'forgot_password'}
			Password Reset
		{:else}
			{view}
		{/if}
	</h3>

	<label class="daisy-form-control w-full max-w-xs">
		<div class="daisy-label">
			<span class="daisy-label-text">Email</span>
		</div>
		<input
			class="daisy-input daisy-input-bordered w-full max-w-xs"
			name="email"
			type="email"
			bind:value={email}
		/>
	</label>

	{#if view == 'sign_up' || view == 'sign_in'}
		<label class="daisy-form-control w-full max-w-xs">
			<div class="daisy-label">
				<span class="daisy-label-text">Password</span>
			</div>
			<input
				class="daisy-input daisy-input-bordered w-full max-w-xs"
				name="password"
				type="password"
				bind:value={password}
			/>
		</label>
	{/if}
	{#if view == 'sign_up'}
		<label class="daisy-form-control w-full max-w-xs">
			<div class="daisy-label">
				<span class="daisy-label-text">Confirm Password</span>
			</div>
			<input
				class="daisy-input daisy-input-bordered w-full max-w-xs"
				name="confirmpassword"
				type="password"
				bind:value={confirmpassword}
			/>
		</label>
	{/if}

	{#if view == 'sign_up'}
		<button class="daisy-btn daisy-btn-primary w-full max-w-xs" type="submit" disabled={loading}
			>Sign up</button
		>
	{:else if view == 'sign_in'}
		<button class="daisy-btn daisy-btn-primary w-full max-w-xs" type="submit" disabled={loading}
			>Sign in</button
		>
	{:else}
		<button class="daisy-btn daisy-btn-primary w-full max-w-xs" type="submit" disabled={loading}
			>Reset Password</button
		>
	{/if}

	<div class="flex flex-col gap-2">
		{#if view !== 'sign_in'}
			<button class="daisy-btn daisy-btn-link daisy-btn-sm" on:click={() => (view = 'sign_in')}
				>Sign In</button
			>
		{/if}
		{#if view !== 'sign_up'}
			<button class="daisy-btn daisy-btn-link daisy-btn-sm" on:click={() => (view = 'sign_up')}
				>Create Account</button
			>
		{/if}
		{#if view !== 'forgot_password'}
			<button
				class="daisy-btn daisy-btn-link daisy-btn-sm"
				on:click={() => (view = 'forgot_password')}>Forgot Password</button
			>
		{/if}
	</div>

	{#if message}
		<p>{message}</p>
	{/if}

	{#if error}
		<p class="text-red">{error}</p>
	{/if}
</form>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.buttons {
		gap: 0.25rem;
	}

	p,
	h3 {
		margin: 0;
	}
</style>
