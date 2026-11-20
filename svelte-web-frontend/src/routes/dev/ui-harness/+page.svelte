<script lang="ts">
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head><title>UI screenshot harness</title></svelte:head>

<main class="mx-auto max-w-3xl space-y-3 p-6">
	<h1 class="text-2xl font-semibold">UI screenshot harness</h1>
	<p class="text-sm opacity-80">
		Dev-only fixture pages for <code>pnpm screenshots</code>. See svelte-web-frontend/AGENTS.md.
	</p>
	<ul class="list-disc pl-6">
		{#each data.scenarios as scenario (scenario.id)}
			<li>
				<a class="daisy-link" href={`/dev/ui-harness/${scenario.id}`}>{scenario.title}</a>
				<code class="text-xs opacity-70">{scenario.id}</code>
			</li>
		{/each}
	</ul>
</main>
