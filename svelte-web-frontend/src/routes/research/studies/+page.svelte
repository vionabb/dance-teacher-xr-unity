<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>CHI25 research recordings</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
	<h1 class="text-2xl font-semibold">CHI25 research recordings</h1>
	<p class="text-sm">Read-only participant videos and raw 2D pose files.</p>
	<nav aria-label="Studies" class="flex flex-wrap gap-3">
		{#each data.studies as study (study)}
			<a
				class="btn btn-sm {data.study === study ? 'btn-primary' : 'btn-ghost'}"
				href={`${resolve('/research/studies')}?study=${study}`}
			>
				{study === 'chi25_study1' ? 'Study 1' : 'Study 2'}
			</a>
		{/each}
	</nav>
	<p class="text-sm">
		{data.media.length} recordings on this page · Page {data.page} of {data.pages}
	</p>
	{#each data.media as item (item.id)}
		<article class="card border-base-300 bg-base-100 border p-4">
			<h2 class="mb-2 font-medium break-all">
				<a class="link" href={resolve('/research/studies/[id]', { id: item.id })}
					>{item.source_stem}</a
				>
			</h2>
			<p class="text-sm">Video and raw 2D pose available for inspection</p>
		</article>
	{/each}
	<nav aria-label="Pages" class="flex gap-3">
		{#if data.page > 1}<a
				class="btn btn-sm"
				href={`${resolve('/research/studies')}?study=${data.study}&page=${data.page - 1}`}
				>Previous</a
			>{/if}
		{#if data.page < data.pages}<a
				class="btn btn-sm"
				href={`${resolve('/research/studies')}?study=${data.study}&page=${data.page + 1}`}>Next</a
			>{/if}
	</nav>
</main>
