<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Research hypotheses</title>
	<meta name="description" content="Local research hypotheses and evidence trails." />
</svelte:head>

<main class="mx-auto max-w-6xl space-y-8 px-4 py-8 lg:px-8">
	<header class="space-y-3">
		<a class="link link-primary text-sm" href={resolve('/research')}>← Research workspace</a>
		<p class="text-primary text-xs font-bold tracking-[.16em] uppercase">Research workspace</p>
		<h1 class="text-3xl font-bold">Hypotheses</h1>
		<p class="max-w-3xl text-sm opacity-75">
			Candidate questions drawn from the lab log and annotation analyses. Their statuses track the
			research workflow; evidence and uncertainty remain attached to each source.
		</p>
	</header>
	<div class="grid gap-4 md:grid-cols-2">
		{#each data.hypotheses as hypothesis (hypothesis.slug)}
			<a
				class="rounded-box border-base-300 hover:border-primary block space-y-3 border p-5 transition-colors"
				href={resolve('/research/hypothesis/[slug]', { slug: hypothesis.slug })}
			>
				<div class="flex items-start justify-between gap-3">
					<h2 class="text-lg font-semibold">{hypothesis.title}</h2>
					<span class="daisy-badge daisy-badge-outline shrink-0">{hypothesis.status}</span>
				</div>
				<p class="text-sm opacity-75">{hypothesis.question}</p>
				<p class="text-xs opacity-60">{hypothesis.findings} saved findings</p>
			</a>
		{/each}
	</div>
</main>
