<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { afterNavigate } from '$app/navigation';
	import AppHistoryButtons from './AppHistoryButtons.svelte';
	import ResearchIcon, { type IconName } from './ResearchIcon.svelte';

	let {
		hosted = false,
		local = false,
		current,
		onsettings
	}: {
		hosted?: boolean;
		local?: boolean;
		/** Overrides the current path, for the dev UI harness. */
		current?: string;
		/** Shows the settings button, as on the main app bar. */
		onsettings?: () => void;
	} = $props();
	const path = $derived(current ?? page.url.pathname);
	let toolsMenu: HTMLDetailsElement | undefined = $state();
	afterNavigate(() => {
		if (toolsMenu) toolsMenu.open = false;
	});

	const links = $derived([
		{
			href: '/research' as const,
			icon: 'activity' as IconName,
			label: 'Performance analysis',
			short: 'Performance',
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
			short: 'Discrepancy',
			description: 'Review differences between human ratings and motion metrics.',
			active: path.startsWith(resolve('/research/discrepancy'))
		},
		...(hosted
			? [
					{
						href: '/research/studies' as const,
						icon: 'video' as IconName,
						label: 'Research recordings',
						short: 'Recordings',
						description: 'Open participant videos and raw pose files by study.',
						active: path.startsWith(resolve('/research/studies'))
					},
					{
						href: '/research/key-moves' as const,
						icon: 'footprints' as IconName,
						label: 'Reference key moves',
						short: 'Key moves',
						description: 'Mark and describe the recognizable moves in each reference video.',
						active: path.startsWith(resolve('/research/key-moves'))
					},
					{
						href: '/research/materials' as const,
						icon: 'folder-open' as IconName,
						label: 'Research materials',
						short: 'Materials',
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
						short: 'Records',
						description: 'Inspect local source records and video usability ratings.',
						active: path === resolve('/research/records')
					},
					{
						href: '/research/records/rate' as const,
						icon: 'star' as IconName,
						label: 'Video usability review',
						short: 'Usability',
						description: 'Continue the local queue of videos awaiting a usability rating.',
						active: path.startsWith(resolve('/research/records/rate'))
					}
				]
			: [])
	]);
	const activeLabel = $derived(links.find((link) => link.active)?.short ?? 'Workspace');
</script>

<!--
		The research workspace uses the app's blue bar, tinted darker and marked
		"Research". Phones list the tools in a menu; wide screens show them inline.
	-->
<nav
	aria-label="Research workspace"
	class="research-bar daisy-navbar text-primary-content relative z-40 min-h-16 gap-0.5 px-1 sm:gap-2 sm:px-4"
>
	<div class="flex flex-none items-center sm:gap-1">
		<AppHistoryButtons />
		<a
			href={resolve('/menu')}
			class="daisy-btn daisy-btn-ghost daisy-btn-sm max-sm:daisy-btn-square gap-1.5"
			aria-label="Learner app"
			title="Learner app"
		>
			<ResearchIcon name="house" /><span class="hidden sm:inline">Learner app</span>
		</a>
	</div>
	<div class="flex min-w-0 flex-1 items-center gap-2">
		<span
			class="daisy-badge daisy-badge-sm shrink-0 border-white/30 bg-white/15 font-semibold tracking-wide text-white uppercase"
			>Research</span
		>
		<span class="truncate text-base sm:text-lg lg:hidden">{activeLabel}</span>
		<ul
			class="daisy-menu daisy-menu-horizontal daisy-menu-sm hidden flex-nowrap gap-0.5 p-0 lg:flex"
		>
			{#each links as link (link.href)}
				<li>
					<a
						href={resolve(link.href)}
						title={link.description}
						aria-current={link.active ? 'page' : undefined}
						class={[
							'gap-1.5 whitespace-nowrap',
							link.active ? 'bg-white/20 font-semibold text-white' : 'text-white/80'
						]}><ResearchIcon name={link.icon} />{link.label}</a
					>
				</li>
			{/each}
		</ul>
	</div>
	<div class="flex flex-none items-center gap-1">
		<details bind:this={toolsMenu} class="daisy-dropdown daisy-dropdown-end lg:hidden">
			<summary
				class="daisy-btn daisy-btn-ghost daisy-btn-sm gap-1.5"
				aria-label="Research tools menu"
				><ResearchIcon name="list" /><span class="hidden sm:inline">Tools</span></summary
			>
			<ul
				data-theme="research"
				class="daisy-menu daisy-dropdown-content rounded-box border-base-300 bg-base-100 text-base-content z-50 mt-2 w-64 border p-2 shadow-lg"
			>
				<li>
					<a href={resolve('/menu')} class="gap-2"
						><ResearchIcon name="house" />Learner app<span class="text-base-content/60 text-xs"
							>dance practice</span
						></a
					>
				</li>
				<li class="daisy-menu-title pt-2">Research tools</li>
				{#each links as link (link.href)}
					<li>
						<a
							href={resolve(link.href)}
							title={link.description}
							aria-current={link.active ? 'page' : undefined}
							class={['gap-2', link.active && 'bg-primary/10 text-primary font-semibold']}
							><ResearchIcon name={link.icon} />{link.label}</a
						>
					</li>
				{/each}
			</ul>
		</details>
		{#if onsettings}
			<button
				type="button"
				class="daisy-btn daisy-btn-ghost daisy-btn-sm daisy-btn-square"
				aria-label="Settings"
				onclick={onsettings}><ResearchIcon name="settings" /></button
			>
		{/if}
	</div>
</nav>

<style>
	/* The app bar's blue (--color-primary #3c64b1), a shade deeper for research. */
	.research-bar {
		background-color: #2b4a86;
	}
</style>
