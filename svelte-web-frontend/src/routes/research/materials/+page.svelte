<script lang="ts">
	import { standaloneDownload } from '$lib/pwa/download';
	import { resolve } from '$app/paths';
	import ResearchHeader from '$lib/elements/ResearchHeader.svelte';
	import ResearchIcon from '$lib/elements/ResearchIcon.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let references = $derived(data.materials.filter((item) => item.kind === 'reference_video'));
	let ratings = $derived(data.materials.filter((item) => item.kind === 'human_ratings'));
	let reviewed = $derived(data.materials.filter((item) => item.kind === 'reviewed_pose'));
	const scopeLabel = (scope: string) =>
		scope === 'shared'
			? 'Reference videos'
			: scope === 'chi25_study1'
				? 'Study 1 participants'
				: scope === 'chi25_study2'
					? 'Study 2 participants'
					: scope;
	const reviewedGroups = $derived(
		[...new Set(reviewed.map((item) => item.scope))].map((scope) => ({
			scope,
			items: reviewed.filter((item) => item.scope === scope)
		}))
	);
	const fileHref = (id: string) => resolve('/research/materials/file/[id]', { id });
	function size(bytes: number | null | undefined) {
		if (!bytes) return '';
		const units = ['B', 'KB', 'MB', 'GB'];
		let value = bytes;
		let unit = 0;
		while (value >= 1024 && unit < units.length - 1) {
			value /= 1024;
			unit++;
		}
		return `${value < 10 && unit ? value.toFixed(1) : Math.round(value)} ${units[unit]}`;
	}
</script>

<svelte:head>
	<title>CHI25 research materials</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

{#snippet fileList(items: typeof data.materials, empty: string, flush = false)}
	{#if items.length}
		<ul
			class={[
				'daisy-list bg-base-100 overflow-hidden',
				flush ? 'border-base-300 border-t' : 'daisy-card border-base-300 border'
			]}
		>
			{#each items as item (item.id)}
				<li class="daisy-list-row items-center px-4 py-3">
					<span class="bg-base-200 text-base-content/60 rounded-field p-2"
						><ResearchIcon name="file-spreadsheet" /></span
					>
					<span class="daisy-list-col-grow min-w-0">
						<span class="block text-sm font-medium break-all">{item.label}</span>
						<span class="text-base-content/60 text-xs"
							>CSV{item.bytes ? ` · ${size(item.bytes)}` : ''}</span
						>
					</span>
					<a
						class="daisy-btn daisy-btn-sm daisy-btn-ghost"
						href={fileHref(item.id)}
						download={`chi25-${item.kind}-${item.id}.csv`}
						use:standaloneDownload={`chi25-${item.kind}-${item.id}.csv`}
						aria-label={`Download ${item.label}`}
						><ResearchIcon name="download" /><span class="hidden sm:inline">Download</span></a
					>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="text-base-content/65 text-sm">{empty}</p>
	{/if}
{/snippet}

<main class="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6">
	<ResearchHeader title="Research materials">
		{#snippet description()}
			<p>Read-only reference videos, human ratings, and frozen reviewed pose files.</p>
		{/snippet}
	</ResearchHeader>

	<section class="space-y-3" aria-labelledby="reference-heading">
		<h2 id="reference-heading" class="text-lg font-semibold">Reference videos</h2>
		<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{#each references as item (item.id)}
				<article class="daisy-card border-base-300 bg-base-100 overflow-hidden border">
					<figure class="bg-neutral-900">
						<!-- svelte-ignore a11y_media_has_caption -->
						<video
							class="aspect-[9/16] max-h-80 w-full object-contain"
							controls
							preload="metadata"
							src={`${fileHref(item.id)}?reference`}
							aria-label={item.label}
						></video>
					</figure>
					<div class="daisy-card-body gap-0.5 p-3">
						<h3 class="truncate text-sm font-medium" title={item.label}>{item.label}</h3>
						{#if item.bytes}<p class="text-base-content/60 text-xs">{size(item.bytes)}</p>{/if}
					</div>
				</article>
			{:else}
				<p class="text-base-content/65 text-sm">No reference videos.</p>
			{/each}
		</div>
	</section>

	<section class="space-y-3" aria-labelledby="ratings-heading">
		<h2 id="ratings-heading" class="text-lg font-semibold">Human ratings</h2>
		{@render fileList(ratings, 'No human rating files.')}
	</section>

	<section class="space-y-3" aria-labelledby="reviewed-heading">
		<div>
			<h2 id="reviewed-heading" class="text-lg font-semibold">Frozen reviewed poses</h2>
			<p class="text-base-content/65 text-sm">
				From the 20261002-first-manual-review release. These are reviewed segments, not automatic
				full-recording poses.
			</p>
		</div>
		{#each reviewedGroups as group, index (group.scope)}
			<details
				class="daisy-collapse daisy-collapse-arrow border-base-300 bg-base-100 border"
				open={index === 0}
			>
				<summary class="daisy-collapse-title min-h-0 py-3 font-medium">
					{scopeLabel(group.scope)}
					<span class="daisy-badge daisy-badge-ghost daisy-badge-sm ml-1 tabular-nums"
						>{group.items.length}</span
					>
				</summary>
				<div class="daisy-collapse-content px-0 pb-0">
					{@render fileList(group.items, '', true)}
				</div>
			</details>
		{:else}
			<p class="text-base-content/65 text-sm">No reviewed pose files.</p>
		{/each}
	</section>
</main>
