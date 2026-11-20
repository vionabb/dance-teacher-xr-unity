<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import ResearchIcon, { type IconName } from './ResearchIcon.svelte';

	let {
		home = false,
		hosted = false,
		local = false,
		current
	}: {
		home?: boolean;
		hosted?: boolean;
		local?: boolean;
		/** Overrides the current path, for the dev UI harness. */
		current?: string;
	} = $props();
	const path = $derived(current ?? page.url.pathname);
	let scroller: HTMLElement | undefined = $state();
	// On narrow screens the bar scrolls sideways: keep the current tool in view.
	$effect(() => {
		void path;
		scroller
			?.querySelector('[aria-current="page"]')
			?.scrollIntoView({ block: 'nearest', inline: 'center' });
	});

	const links = $derived([
		{
			href: '/research' as const,
			icon: 'activity' as IconName,
			label: 'Performance analysis',
			description: 'Browse performances and inspect Qijia2D and Viona2D motion metrics.',
			active:
				path === resolve('/research') ||
				path.startsWith(resolve('/metrics/qijia2d')) ||
				path.startsWith(resolve('/metrics/viona2d'))
		},
		{
			href: '/research/discrepancy' as const,
			icon: 'git-compare' as IconName,
			label: 'Discrepancy review',
			description: 'Review differences between human ratings and motion metrics.',
			active: path.startsWith(resolve('/research/discrepancy'))
		},
		...(hosted
			? [
					{
						href: '/research/studies' as const,
						icon: 'video' as IconName,
						label: 'Research recordings',
						description: 'Open participant videos and raw pose files by study.',
						active: path.startsWith(resolve('/research/studies'))
					},
					{
						href: '/research/key-moves' as const,
						icon: 'footprints' as IconName,
						label: 'Reference key moves',
						description: 'Mark and describe the recognizable moves in each reference video.',
						active: path.startsWith(resolve('/research/key-moves'))
					},
					{
						href: '/research/materials' as const,
						icon: 'folder-open' as IconName,
						label: 'Research materials',
						description: 'Find reference videos, human ratings, and reviewed poses.',
						active: path.startsWith(resolve('/research/materials'))
					}
				]
			: []),
		...(local
			? [
					{
						href: '/research/records' as const,
						icon: 'table' as IconName,
						label: 'Source records',
						description: 'Inspect local source records and video usability ratings.',
						active: path === resolve('/research/records')
					},
					{
						href: '/research/records/rate' as const,
						icon: 'star' as IconName,
						label: 'Video usability review',
						description: 'Continue the local queue of videos awaiting a usability rating.',
						active: path.startsWith(resolve('/research/records/rate'))
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
						<span class="text-primary flex items-center gap-2 font-semibold">
							<ResearchIcon name={link.icon} />{link.label}
						</span>
						<p class="text-sm opacity-75">{link.description}</p>
					</div>
				</a>
			{/each}
		</nav>
	</section>
{:else}
	<nav
		aria-label="Research workspace"
		data-theme="research"
		class="border-base-300 bg-base-100 border-b"
	>
		<div bind:this={scroller} class="flex items-center gap-1 overflow-x-auto px-2 sm:px-4">
			<a
				href={resolve('/menu')}
				class="daisy-btn daisy-btn-ghost daisy-btn-sm shrink-0 gap-1.5"
				aria-label="Home"
			>
				<ResearchIcon name="house" /><span class="hidden sm:inline">Home</span>
			</a>
			<span class="bg-base-300 h-5 w-px shrink-0" aria-hidden="true"></span>
			<ul class="daisy-menu daisy-menu-horizontal daisy-menu-sm flex-nowrap gap-0.5 px-1 py-1.5">
				{#each links as link (link.href)}
					<li>
						<a
							href={resolve(link.href)}
							aria-current={link.active ? 'page' : undefined}
							class={[
								'gap-1.5 whitespace-nowrap',
								link.active ? 'bg-primary/10 text-primary font-semibold' : 'text-base-content/75'
							]}><ResearchIcon name={link.icon} />{link.label}</a
						>
					</li>
				{/each}
			</ul>
		</div>
	</nav>
{/if}
