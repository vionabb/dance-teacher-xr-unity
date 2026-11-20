<script lang="ts">
	import { resolve } from '$app/paths';
	import ResearchHeader from '$lib/elements/ResearchHeader.svelte';
	import ResearchIcon from '$lib/elements/ResearchIcon.svelte';
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
	const totalMoves = $derived(dances.reduce((sum, dance) => sum + dance.moveCount, 0));
	const totalDescribed = $derived(dances.reduce((sum, dance) => sum + dance.describedCount, 0));
	const started = $derived(dances.filter((dance) => dance.moveCount > 0).length);
</script>

<svelte:head>
	<title>Reference key moves</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
	<ResearchHeader title="Reference key moves">
		{#snippet description()}
			<p>
				Mark the recognizable moves in each CHI25 reference video and describe them in your own
				words. This page shows no ratings or metric results.
			</p>
		{/snippet}
	</ResearchHeader>

	<div
		class="daisy-stats daisy-stats-vertical sm:daisy-stats-horizontal border-base-300 bg-base-100 w-full border"
	>
		<div class="daisy-stat py-3">
			<div class="daisy-stat-title">Dances started</div>
			<div class="daisy-stat-value text-2xl">
				{started} <span class="text-base-content/50 text-base font-normal">of {dances.length}</span>
			</div>
		</div>
		<div class="daisy-stat py-3">
			<div class="daisy-stat-title">Moves marked</div>
			<div class="daisy-stat-value text-2xl">{totalMoves}</div>
		</div>
		<div class="daisy-stat py-3">
			<div class="daisy-stat-title">Described</div>
			<div class="daisy-stat-value text-2xl">
				{totalDescribed}
				<span class="text-base-content/50 text-base font-normal">of {totalMoves}</span>
			</div>
		</div>
	</div>

	<ul class="grid gap-3 sm:grid-cols-2">
		{#each dances as dance (dance.dance)}
			{@const missing = dance.moveCount - dance.describedCount}
			<li>
				<a
					href={resolve('/research/key-moves/[dance]', { dance: dance.dance })}
					class="daisy-card border-base-300 bg-base-100 hover:border-primary group block h-full border transition-colors"
				>
					<div class="daisy-card-body gap-3 p-4">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<h2 class="daisy-card-title text-base">{dance.label}</h2>
								<p class="text-base-content/60 truncate text-xs">
									{dance.videoLabel} · {dance.clipCount} clips
								</p>
							</div>
							{#if !dance.timingKnown}
								<span
									class="daisy-badge daisy-badge-warning daisy-badge-soft daisy-badge-sm shrink-0"
									>Frame rate not verified</span
								>
							{:else if !dance.moveCount}
								<span class="daisy-badge daisy-badge-ghost daisy-badge-sm shrink-0"
									>Not started</span
								>
							{:else if missing > 0}
								<span
									class="daisy-badge daisy-badge-warning daisy-badge-soft daisy-badge-sm shrink-0"
									>{missing} to describe</span
								>
							{:else}
								<span
									class="daisy-badge daisy-badge-success daisy-badge-soft daisy-badge-sm shrink-0"
									><ResearchIcon name="check" class="size-3" />Described</span
								>
							{/if}
						</div>
						<div class="flex items-center gap-3">
							<progress
								class={[
									'daisy-progress h-1.5 flex-1',
									!dance.moveCount
										? ''
										: missing > 0
											? 'daisy-progress-warning'
											: 'daisy-progress-success'
								]}
								value={dance.describedCount}
								max={Math.max(dance.moveCount, 1)}
								aria-label={`${dance.describedCount} of ${dance.moveCount} moves described`}
							></progress>
							<span class="text-base-content/70 text-xs whitespace-nowrap tabular-nums"
								>{dance.moveCount} {dance.moveCount === 1 ? 'move' : 'moves'}</span
							>
							<ResearchIcon
								name="arrow-right"
								class="text-base-content/40 group-hover:text-primary size-4 transition-colors"
							/>
						</div>
					</div>
				</a>
			</li>
		{/each}
	</ul>
</main>
