<script lang="ts">
	import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { navbarProps } from '$lib/elements/NavBar.svelte';

	onMount(() => {
		const previous = get(navbarProps);
		navbarProps.set({ collapsed: false, pageTitle: 'Motion metric explorer', hideSettings: true });
		return () => navbarProps.set(previous);
	});
</script>

<svelte:head>
	<title>Motion metric explorer</title>
	<meta name="description" content="Explore frame-level motion similarity metrics." />
</svelte:head>

<main class="mx-auto max-w-6xl space-y-6 px-4 py-8 lg:px-8">
	<header class="max-w-3xl space-y-2">
		<p class="text-primary text-xs font-bold tracking-[.18em] uppercase">Research tools</p>
		<h1 class="text-3xl font-bold sm:text-4xl">Motion metric explorer</h1>
		<p class="opacity-70">
			Inspect how a motion metric scores individual frames, then follow the score back to the poses
			and vector pairs that produced it.
		</p>
	</header>

	<section class="grid gap-4 md:grid-cols-2" aria-label="Motion metrics">
		<article class="daisy-card border-primary bg-base-100 border-2 shadow-sm">
			<div class="daisy-card-body">
				<div class="flex items-center justify-between gap-3">
					<h2 class="daisy-card-title">Qijia2D similarity</h2>
					<span class="daisy-badge daisy-badge-primary">Available</span>
				</div>
				<p class="text-sm opacity-70">
					Compare eight normalized upper-body vectors and inspect the per-frame 0–5 similarity
					score.
				</p>
				<div class="daisy-card-actions mt-2 flex-wrap">
					<a class="daisy-btn daisy-btn-primary" href="/metrics/qijia2d"
						>Browse participant dataset</a
					>
					<a class="daisy-btn daisy-btn-outline" href="/metrics/qijia2d?source=local"
						>Use local files</a
					>
				</div>
			</div>
		</article>

		{#each ['Viona2D', '3D pose similarity', 'Temporal alignment'] as metric (metric)}
			<article class="daisy-card border-base-300 bg-base-100 border opacity-65">
				<div class="daisy-card-body">
					<div class="flex items-center justify-between gap-3">
						<h2 class="daisy-card-title">{metric}</h2>
						<span class="daisy-badge daisy-badge-ghost">Planned</span>
					</div>
					<p class="text-sm">A frame-by-frame inspector for this metric is not available yet.</p>
					<button class="daisy-btn daisy-btn-sm mt-2" disabled>Coming later</button>
				</div>
			</article>
		{/each}
	</section>

	<p class="text-xs opacity-60">
		Participant media is served only from the local development cache.
	</p>
</main>
