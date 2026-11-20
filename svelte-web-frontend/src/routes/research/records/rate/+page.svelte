<script lang="ts">
	import ResearchHeader from '$lib/elements/ResearchHeader.svelte';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Rate video usability</title></svelte:head>
<main class="mx-auto max-w-2xl space-y-4 px-4 py-6 sm:px-6">
	<ResearchHeader
		title="Rate video usability"
		crumbs={[{ label: 'Source records', href: '/research/records' }]}
	/>
	<p class="daisy-alert daisy-alert-soft">{data.reason}</p>
</main>
