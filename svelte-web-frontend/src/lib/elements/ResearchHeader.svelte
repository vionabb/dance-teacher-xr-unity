<!--
	Shared page header for research tools: breadcrumbs, title, a short
	description and optional actions on the right.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		crumbs = [],
		description,
		actions
	}: {
		title: string;
		crumbs?: { label: string; href: string }[];
		description?: Snippet;
		actions?: Snippet;
	} = $props();
</script>

<header class="space-y-1">
	{#if crumbs.length}
		<nav class="daisy-breadcrumbs text-base-content/60 py-0 text-sm" aria-label="Breadcrumb">
			<ul>
				{#each crumbs as crumb (crumb.href)}
					<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- callers pass resolved hrefs -->
					<li><a href={crumb.href}>{crumb.label}</a></li>
				{/each}
				<li><span class="text-base-content/80 max-w-[60vw] truncate">{title}</span></li>
			</ul>
		</nav>
	{/if}
	<div class="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
		<div class="min-w-0 space-y-1">
			<h1 class="text-2xl font-bold tracking-tight break-words sm:text-3xl">{title}</h1>
			{#if description}
				<div class="text-base-content/70 max-w-3xl text-sm">{@render description()}</div>
			{/if}
		</div>
		{#if actions}
			<div class="flex flex-wrap items-center gap-2">{@render actions()}</div>
		{/if}
	</div>
</header>
