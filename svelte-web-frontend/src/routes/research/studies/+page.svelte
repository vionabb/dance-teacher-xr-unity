<script lang="ts">
	import { resolve } from '$app/paths';
	import ResearchHeader from '$lib/elements/ResearchHeader.svelte';
	import ResearchIcon from '$lib/elements/ResearchIcon.svelte';
	import { recordingTitle } from '$lib/research/source-stem';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
	const studyLabel = (study: string) => (study === 'chi25_study1' ? 'Study 1' : 'Study 2');
	const pageHref = (page: number) =>
		`${resolve('/research/studies')}?study=${data.study}${page > 1 ? `&page=${page}` : ''}`;
</script>

<svelte:head>
	<title>CHI25 research recordings</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
	<ResearchHeader title="Research recordings">
		{#snippet description()}
			<p>Read-only CHI25 participant videos with their raw 2D pose files.</p>
		{/snippet}
		{#snippet actions()}
			<nav aria-label="Studies" class="daisy-tabs daisy-tabs-box daisy-tabs-sm">
				{#each data.studies as study (study)}
					<a
						class={['daisy-tab', data.study === study && 'daisy-tab-active']}
						aria-current={data.study === study ? 'page' : undefined}
						href={`${resolve('/research/studies')}?study=${study}`}>{studyLabel(study)}</a
					>
				{/each}
			</nav>
		{/snippet}
	</ResearchHeader>

	<section class="daisy-card border-base-300 bg-base-100 overflow-hidden border">
		<div
			class="border-base-300 text-base-content/70 flex items-center justify-between gap-3 border-b px-4 py-2.5 text-sm"
		>
			<span>{studyLabel(data.study)} · {data.media.length} recordings on this page</span>
			<span class="tabular-nums">Page {data.page} of {data.pages}</span>
		</div>
		{#if data.media.length}
			<ul class="daisy-list">
				{#each data.media as item (item.id)}
					<li>
						<a
							class="daisy-list-row hover:bg-base-200 items-center rounded-none px-4 py-3 transition-colors"
							href={resolve('/research/studies/[id]', { id: item.id })}
						>
							<span class="bg-base-200 text-base-content/60 rounded-field p-2"
								><ResearchIcon name="video" /></span
							>
							<span class="daisy-list-col-grow min-w-0">
								<span class="block truncate font-medium">{recordingTitle(item.source_stem)}</span>
								<span class="text-base-content/50 block truncate font-mono text-xs"
									>{item.source_stem}</span
								>
							</span>
							<ResearchIcon name="chevron-right" class="text-base-content/40 size-4" />
						</a>
					</li>
				{/each}
			</ul>
		{:else}
			<p class="text-base-content/65 p-8 text-center text-sm">No recordings in this study.</p>
		{/if}
	</section>

	{#if data.pages > 1}
		<nav aria-label="Pages" class="flex justify-center">
			<div class="daisy-join">
				<a
					class={['daisy-join-item daisy-btn daisy-btn-sm', data.page <= 1 && 'daisy-btn-disabled']}
					aria-disabled={data.page <= 1}
					href={pageHref(Math.max(1, data.page - 1))}
					><ResearchIcon name="chevron-left" />Previous</a
				>
				<span class="daisy-join-item daisy-btn daisy-btn-sm pointer-events-none tabular-nums"
					>{data.page} / {data.pages}</span
				>
				<a
					class={[
						'daisy-join-item daisy-btn daisy-btn-sm',
						data.page >= data.pages && 'daisy-btn-disabled'
					]}
					aria-disabled={data.page >= data.pages}
					href={pageHref(Math.min(data.pages, data.page + 1))}
					>Next<ResearchIcon name="chevron-right" /></a
				>
			</div>
		</nav>
	{/if}
</main>
