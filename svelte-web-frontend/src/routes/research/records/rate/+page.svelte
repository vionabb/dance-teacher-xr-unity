<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>Rate video usability</title></svelte:head>
<main class="mx-auto max-w-2xl space-y-4 px-4 py-8">
	<a class="link link-primary" href="/research/records">← Research source records</a>
	<h1 class="text-2xl font-bold">Rate video usability</h1>
	<p class="daisy-alert">{data.reason}</p>
</main>
