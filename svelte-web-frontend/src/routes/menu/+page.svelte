<script lang="ts">
	import { navbarProps } from '$lib/elements/NavBar.svelte';
	import MainMenuPage from '$lib/pages/MainMenuPage.svelte';
	import { onMount } from 'svelte';

	let { data } = $props();

	onMount(() => {
		navbarProps.set({
			collapsed: false,
			pageTitle: 'Main Menu'
		});
	});
</script>

<svelte:head>
	<title>Dance Menu | DanceTeacher</title>
	<meta name="description" content="Dance sleection menu for the dance teacher app." />
</svelte:head>

<div
	class="mx-auto max-w-screen-2xl sm:mt-4 md:mt-8 lg:mt-12
    xl:mt-16 2xl:mt-20"
>
	<h2
		class="mx-4 mb-2 mt-4
        text-xl sm:mb-4 sm:text-center md:mb-8
        md:text-2xl lg:text-3xl xl:text-4xl"
	>
		Pick a dance to learn
	</h2>
	<div class="mx-4 mb-4">
		<MainMenuPage motionVideos={data.motionVideos} />
	</div>
</div>
