<script lang="ts">
	import { resolve } from '$app/paths';
	import type { ActionData, PageData } from './$types';
	import ReferenceSpanMarker from './ReferenceSpanMarker.svelte';
	let { data, form }: { data: PageData; form: ActionData | null } = $props();
</script>

<svelte:head>
	<title>Reference dance start and end · Research</title>
	<meta
		name="description"
		content="Mark where the dance moves begin and end in each CHI25 reference video."
	/>
</svelte:head>

<main class="mx-auto max-w-6xl space-y-6 px-4 py-8 lg:px-8">
	<header class="space-y-2">
		<a
			class="link link-primary text-sm"
			href={resolve('/research/hypothesis/[slug]', { slug: 'rating-relevant-time-spans' })}
			>← Time spans that matter for human ratings</a
		>
		<h1 class="text-3xl font-bold">Reference dance start and end</h1>
		<p class="max-w-3xl text-sm leading-6 opacity-80">
			Some reference videos include time where the dancer is waiting for the moves to start or
			backing up from the camera, and time after the dance where they walk back to turn it off. Mark
			when the dance moves begin and end in each video. The analysis will then compare each metric
			with and without the time outside these marks. Saving a new mark keeps earlier marks as
			history.
		</p>
	</header>

	{#if !data.annotatorConfigured}<p class="daisy-alert daisy-alert-warning text-sm">
			<span>
				Set <code class="break-all">RESEARCH_ANNOTATOR</code> when starting the local server to save marks.
			</span>
		</p>{/if}
	{#if data.saved}<p class="daisy-alert daisy-alert-success text-sm" role="status">
			Saved the mark for {data.dances.find((item) => item.dance === data.saved)?.title ??
				'the video'}.
		</p>{/if}
	{#if data.backupWarning}<p class="daisy-alert daisy-alert-warning text-sm">
			The mark was saved, but its database snapshot could not be verified. Back up the local
			research database before continuing.
		</p>{/if}
	{#if form?.message && !form?.dance}<p class="daisy-alert daisy-alert-error text-sm">
			{form.message}
		</p>{/if}

	{#each data.dances as item (item.dance)}
		<ReferenceSpanMarker
			dance={item.dance}
			title={item.title}
			clipSpacingSeconds={item.clipSpacingSeconds}
			videoAvailable={item.videoAvailable}
			current={item.current}
			earlierCount={item.earlierCount}
			disabled={!data.annotatorConfigured}
			error={form?.dance === item.dance ? (form?.message ?? null) : null}
		/>
	{/each}
</main>
