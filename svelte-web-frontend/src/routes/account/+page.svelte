<!-- src/routes/account/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { navbarProps } from '$lib/elements/NavBar.svelte';
	import { onMount } from 'svelte';

	onMount(() => {
		navbarProps.set({
			collapsed: false,
			pageTitle: 'Account',
			back: {
				url: '/menu',
				title: 'Home'
			}
		});
	});

	export let data;
	export let form;

	let { session, supabase, profile } = data;
	$: ({ session, supabase, profile } = data);

	let profileForm: HTMLFormElement;
	let loading = false;
	let fullName: string = profile?.full_name ?? '';
	let username: string = profile?.username ?? '';
	let avatarUrl: string = profile?.avatar_url ?? '';

	/** @type {import('./$types').SubmitFunction} */
	const handleSubmit = () => {
		loading = true;
		return async ({ update }) => {
			update();
			loading = false;
		};
	};

	/** @type {import('./$types').SubmitFunction} */
	const handleSignOut = () => {
		loading = true;
		return async ({ update }) => {
			update();
			loading = false;
		};
	};
</script>

<svelte:head>
	<title>Account | DanceTeacher</title>
	<meta name="description" content="Dance Teacher Account Page" />
</svelte:head>

<div class="accountPage">
	<div class="mt-4 flex flex-col justify-center space-y-2">
		<form
			class="grid grid-cols-2-maxcontent items-center justify-center gap-2 gap-y-4"
			method="post"
			action="?/update"
			use:enhance={handleSubmit}
			bind:this={profileForm}
		>
			<label class="justify-self-end" for="email">Email</label>
			<input
				class="daisy-input daisy-input-bordered"
				id="email"
				type="text"
				value={session?.user?.email}
				disabled
			/>

			<label class="justify-self-end" for="fullName">Full Name</label>
			<input
				class="daisy-input daisy-input-bordered"
				id="fullName"
				name="fullName"
				type="text"
				value={form?.fullName ?? fullName}
			/>

			<label class="justify-self-end" for="username">Username</label>
			<input
				class="daisy-input daisy-input-bordered"
				id="username"
				name="username"
				type="text"
				value={form?.username ?? username}
			/>

			<div class="col-span-2 text-center">
				<button type="submit" class="daisy-btn daisy-btn-primary daisy-btn-block" disabled={loading}
					>{loading ? 'Loading...' : 'Update'}</button
				>
				<span
					>{#if form?.success}Update Successful{/if}</span
				>
			</div>
		</form>

		<form class="text-center" method="post" action="?/signout" use:enhance={handleSignOut}>
			<button class="daisy-btn daisy-btn-link daisy-btn-sm" disabled={loading}>Sign Out</button>
		</form>

		<a class="daisy-btn daisy-btn-link daisy-btn-sm" href="/updatepassword">Update Password</a>
	</div>
</div>
