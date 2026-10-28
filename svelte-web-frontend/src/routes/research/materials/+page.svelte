<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let references = $derived(data.materials.filter((item) => item.kind === 'reference_video'));
	let ratings = $derived(data.materials.filter((item) => item.kind === 'human_ratings'));
	let reviewed = $derived(data.materials.filter((item) => item.kind === 'reviewed_pose'));
</script>

<svelte:head>
	<title>CHI25 research materials</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="mx-auto max-w-5xl space-y-6 p-4 sm:p-8">
	<a class="link" href={resolve('/research/studies')}>Back to recordings</a>
	<h1 class="text-2xl font-semibold">CHI25 research materials</h1>
	<p class="text-sm">Read-only source references, human ratings, and frozen reviewed pose files.</p>

	<section class="space-y-3" aria-labelledby="reference-heading">
		<h2 id="reference-heading" class="text-xl font-semibold">Reference videos</h2>
		{#each references as item (item.id)}
			<article class="card border-base-300 bg-base-100 border p-4">
				<h3 class="font-medium">{item.label}</h3>
				<!-- svelte-ignore a11y_media_has_caption: Source reference videos have no caption tracks. -->
				<video
					class="mt-3 max-h-96 w-full bg-black"
					controls
					preload="none"
					src={resolve('/research/materials/file/[id]', { id: item.id })}
					aria-label={item.label}
				></video>
			</article>
		{/each}
	</section>

	<section class="space-y-3" aria-labelledby="ratings-heading">
		<h2 id="ratings-heading" class="text-xl font-semibold">Human ratings</h2>
		{#each ratings as item (item.id)}
			<p>
				<a class="link" href={resolve('/research/materials/file/[id]', { id: item.id })}
					>{item.label} · Download CSV</a
				>
			</p>
		{/each}
	</section>

	<section class="space-y-3" aria-labelledby="reviewed-heading">
		<h2 id="reviewed-heading" class="text-xl font-semibold">Frozen reviewed poses</h2>
		<p class="text-sm">
			From the 20261002-first-manual-review release. These are reviewed segments, not automatic
			full-recording poses.
		</p>
		{#each reviewed as item (item.id)}
			<p class="break-all">
				<a class="link" href={resolve('/research/materials/file/[id]', { id: item.id })}
					>{item.label} · Download CSV</a
				>
			</p>
		{/each}
	</section>
</main>
