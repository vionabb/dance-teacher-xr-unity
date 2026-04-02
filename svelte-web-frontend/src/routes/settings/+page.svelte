<script lang="ts">
	import SettingsPage from '$lib/pages/SettingsPage.svelte';

	import { navbarProps } from '$lib/elements/NavBar.svelte';
	import { onMount } from 'svelte';

	onMount(() => {
		navbarProps.set({
			collapsed: false,
			pageTitle: 'Settings',
			back: {
				url: '/',
				title: 'Home'
			},
			hideSettings: true
		});
	});
</script>

<svelte:head>
	<title>Settings | DanceTeacher</title>
	<meta name="description" content="Dance Teacher Settings Page" />
</svelte:head>

<SettingsPage />
