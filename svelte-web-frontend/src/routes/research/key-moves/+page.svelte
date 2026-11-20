<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	const order = ['bartender', 'last-christmas', 'mad-at-disney', 'pajama-party'];
	const dances = $derived(
		[...data.dances].sort(
			(a, b) =>
				(order.indexOf(a.dance) + 1 || 99) - (order.indexOf(b.dance) + 1 || 99) ||
				a.dance.localeCompare(b.dance)
		)
	);
</script>

<svelte:head>
	<title>Reference key moves</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="mx-auto max-w-4xl space-y-4 p-4 sm:p-8">
	<header class="space-y-1">
		<h1 class="text-2xl font-semibold">Reference key moves</h1>
		<p class="text-sm opacity-80">
			Mark the recognizable moves in each CHI25 reference video and describe them in your own words.
			This page shows no ratings or metric results.
		</p>
	</header>
	<ul class="grid gap-3 sm:grid-cols-2">
		{#each dances as dance (dance.dance)}
			<li>
				<a
					href={resolve('/research/key-moves/[dance]', { dance: dance.dance })}
					class="daisy-card border-base-300 bg-base-100 hover:border-primary block border transition-colors"
				>
					<div class="daisy-card-body gap-1 p-4">
						<span class="text-primary font-semibold">{dance.label} →</span>
						<span class="text-xs opacity-70">{dance.videoLabel} · {dance.clipCount} clips</span>
						{#if !dance.timingKnown}
							<span class="daisy-badge daisy-badge-warning daisy-badge-sm"
								>Frame rate not verified</span
							>
						{:else if dance.moveCount}
							<span class="text-sm">
								{dance.moveCount}
								{dance.moveCount === 1 ? 'move' : 'moves'} marked{dance.describedCount <
								dance.moveCount
									? `, ${dance.moveCount - dance.describedCount} without a description`
									: ''}
							</span>
						{:else}
							<span class="text-sm opacity-70">Not started</span>
						{/if}
					</div>
				</a>
			</li>
		{/each}
	</ul>
</main>
