<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';

	let {
		home = false,
		hosted = false,
		local = false
	}: {
		home?: boolean;
		hosted?: boolean;
		local?: boolean;
	} = $props();

	const links = $derived([
		{
			href: '/research' as const,
			label: 'Performance analysis',
			description: 'Browse performances and inspect Qijia2D and Viona2D motion metrics.',
			active:
				page.url.pathname === resolve('/research') ||
				page.url.pathname.startsWith(resolve('/metrics/qijia2d')) ||
				page.url.pathname.startsWith(resolve('/metrics/viona2d'))
		},
		{
			href: '/research/discrepancy' as const,
			label: 'Discrepancy review',
			description: 'Review differences between human ratings and motion metrics.',
			active: page.url.pathname.startsWith(resolve('/research/discrepancy'))
		},
		...(hosted
			? [
					{
						href: '/research/studies' as const,
						label: 'Research recordings',
						description: 'Open participant videos and raw pose files by study.',
						active: page.url.pathname.startsWith(resolve('/research/studies'))
					},
					{
						href: '/research/materials' as const,
						label: 'Research materials',
						description: 'Find reference videos, human ratings, and reviewed poses.',
						active: page.url.pathname.startsWith(resolve('/research/materials'))
					}
				]
			: []),
		...(local
			? [
					{
						href: '/research/hypothesis' as const,
						label: 'Hypotheses',
						description: 'Discuss research questions, manage their status, and record findings.',
						active: page.url.pathname.startsWith(resolve('/research/hypothesis'))
					},
					{
						href: '/research/records' as const,
						label: 'Source records',
						description: 'Inspect local source records and video usability ratings.',
						active: page.url.pathname === resolve('/research/records')
					},
					{
						href: '/research/records/rate' as const,
						label: 'Video usability review',
						description: 'Continue the local queue of videos awaiting a usability rating.',
						active: page.url.pathname.startsWith(resolve('/research/records/rate'))
					}
				]
			: [])
	]);
</script>

{#if home}
	<section aria-labelledby="research-heading" class="mx-4 mb-8 space-y-3">
		<h2 id="research-heading" class="text-xl font-semibold">Research workspace</h2>
		<nav aria-label="Research tools" class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{#each links as link (link.href)}
				<a
					href={resolve(link.href)}
					class="daisy-card border-base-300 bg-base-100 hover:border-primary border transition-colors"
				>
					<div class="daisy-card-body gap-2 p-4">
						<span class="text-primary font-semibold">{link.label} →</span>
						<p class="text-sm opacity-75">{link.description}</p>
					</div>
				</a>
			{/each}
		</nav>
	</section>
{:else}
	<nav
		aria-label="Research workspace"
		class="border-base-300 bg-base-100 flex flex-wrap items-center gap-2 border-b px-4 py-3"
	>
		<a href={resolve('/menu')} class="daisy-btn daisy-btn-ghost daisy-btn-sm">← Home</a>
		{#each links as link (link.href)}
			<a
				href={resolve(link.href)}
				aria-current={link.active ? 'page' : undefined}
				class={['daisy-btn daisy-btn-sm', link.active ? 'daisy-btn-primary' : 'daisy-btn-ghost']}
				>{link.label}</a
			>
		{/each}
	</nav>
{/if}
