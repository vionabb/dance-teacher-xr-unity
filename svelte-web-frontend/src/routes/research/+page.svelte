<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { get } from 'svelte/store';
	import { navbarProps } from '$lib/elements/NavBar.svelte';
	import { getLastMetric } from '$lib/utils/last-inspected-metric';

	type Performance = {
		id: string;
		participantLabel: string;
		study: string;
		danceName: string;
		condition: string;
		phase: string | null;
		segments: Array<{ id: string; clipNumber: number }>;
	};
	const preferredDanceOrder = ['bartender', 'last-christmas', 'mad-at-disney', 'pajama-party'];
	const danceLabels: Record<string, string> = {
		bartender: 'Bartender',
		'last-christmas': 'Last Christmas',
		'mad-at-disney': 'Mad at Disney',
		'pajama-party': 'Pajama Party'
	};
	let performances = $state<Performance[]>([]);
	let loading = $state(true);
	let error = $state('');
	let query = $state('');
	let selectedDance = $state(page.url.searchParams.get('dance') ?? '');
	let openingId = $state('');
	const danceNames = $derived.by(() => {
		const names = [...new Set(performances.map((performance) => performance.danceName))];
		return names.sort((a, b) => {
			const aOrder = preferredDanceOrder.indexOf(a);
			const bOrder = preferredDanceOrder.indexOf(b);
			if (aOrder >= 0 && bOrder >= 0) return aOrder - bOrder;
			if (aOrder >= 0) return -1;
			if (bOrder >= 0) return 1;
			return danceLabel(a).localeCompare(danceLabel(b));
		});
	});
	const dancePerformances = $derived(
		performances.filter((performance) => performance.danceName === selectedDance)
	);
	const filteredPerformances = $derived.by(() => {
		const search = query.trim().toLowerCase();
		return dancePerformances.filter((performance) =>
			[performance.participantLabel, performance.condition, performance.phase ?? '']
				.join(' ')
				.toLowerCase()
				.includes(search)
		);
	});

	onMount(() => {
		const previous = get(navbarProps);
		navbarProps.set({ collapsed: false, pageTitle: 'Browse performances', hideSettings: true });
		void loadCatalog();
		return () => navbarProps.set(previous);
	});

	async function loadCatalog() {
		loading = true;
		error = '';
		try {
			const response = await fetch('/api/dev/participant-catalog', { cache: 'no-store' });
			if (!response.ok)
				throw new Error(`Could not load the participant dataset (${response.status}).`);
			const result = (await response.json()) as { performances: Performance[] };
			performances = result.performances;
		} catch (caught) {
			error = caught instanceof Error ? caught.message : 'Could not load the participant dataset.';
		} finally {
			loading = false;
		}
	}

	function chooseDance(dance: string) {
		selectedDance = dance;
		query = '';
		const url = new URL(page.url);
		url.searchParams.set('dance', dance);
		void goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}
	function showDances() {
		selectedDance = '';
		const url = new URL(page.url);
		url.searchParams.delete('dance');
		void goto(url, { replaceState: true, keepFocus: true, noScroll: true });
	}
	function phaseLabel(phase: string | null) {
		return phase ? phase.charAt(0).toUpperCase() + phase.slice(1) : 'Segmented';
	}
	function danceLabel(dance: string) {
		return (
			danceLabels[dance] ??
			dance
				.split('-')
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
				.join(' ')
		);
	}
	function hasParticipantVariant(performance: Performance) {
		return (
			dancePerformances.filter(
				(candidate) => candidate.participantLabel === performance.participantLabel
			).length > 1
		);
	}
	async function openPerformance(performance: Performance) {
		openingId = performance.id;
		const metric = getLastMetric();
		try {
			await goto(`/metrics/${metric}?performance=${encodeURIComponent(performance.id)}&time=0`);
		} catch {
			error = 'Could not open this performance.';
		} finally {
			openingId = '';
		}
	}
</script>

<svelte:head>
	<title>Browse performances</title>
	<meta name="description" content="Choose a dance and participant performance to inspect." />
</svelte:head>

<main class="mx-auto max-w-6xl space-y-5 px-4 py-6 lg:px-8">
	<header class="flex flex-wrap items-end justify-between gap-3">
		<div>
			<p class="text-primary text-xs font-bold tracking-[.16em] uppercase">Motion metrics</p>
			<h1 class="text-2xl font-bold sm:text-3xl">
				{selectedDance ? danceLabel(selectedDance) : 'Choose a dance'}
			</h1>
		</div>
		<div class="flex gap-2">
			<a class="daisy-btn daisy-btn-outline daisy-btn-sm" href="/research/records">Source records</a
			>
			<a class="daisy-btn daisy-btn-ghost daisy-btn-sm" href="/metrics/qijia2d?source=local"
				>Qijia2D local</a
			>
			<a class="daisy-btn daisy-btn-ghost daisy-btn-sm" href="/metrics/viona2d?source=local"
				>Viona2D local</a
			>
		</div>
	</header>

	{#if loading}
		<div class="flex items-center gap-3 py-12" role="status">
			<span class="daisy-loading daisy-loading-spinner"></span><span
				>Loading local performances…</span
			>
		</div>
	{:else if error}
		<div class="daisy-alert daisy-alert-error">
			<span>{error}</span><button class="daisy-btn daisy-btn-sm" onclick={loadCatalog}>Retry</button
			>
		</div>
	{:else if performances.length === 0}
		<div class="rounded-box bg-base-200 p-6 text-sm">
			<p>No participant performances were found in the local dataset.</p>
			<p class="mt-1 opacity-70">
				Set <code>MOTION_PIPELINE_USER_STUDY_DATA_DIR</code> to the participant cache and restart the
				development server.
			</p>
		</div>
	{:else if !selectedDance}
		<section class="grid gap-4 sm:grid-cols-2" aria-label="Choose a dance">
			{#each danceNames as dance (dance)}
				{@const count = performances.filter(
					(performance) => performance.danceName === dance
				).length}
				<button
					class="daisy-card bg-base-100 border-base-300 hover:border-primary overflow-hidden border text-left transition-colors"
					onclick={() => chooseDance(dance)}
				>
					<div class="relative">
						<img
							class="aspect-video w-full object-cover"
							src={`/api/dev/reference-clips/${dance}/thumbnail`}
							alt={`${danceLabel(dance)} reference dance`}
							loading="lazy"
						/>
						<span class="daisy-badge daisy-badge-neutral absolute right-3 bottom-3"
							>{count} performances</span
						>
					</div>
					<div class="daisy-card-body p-4">
						<h2 class="daisy-card-title">{danceLabel(dance)}</h2>
					</div>
				</button>
			{/each}
		</section>
	{:else}
		<div class="flex flex-wrap items-center justify-between gap-3">
			<button class="daisy-btn daisy-btn-ghost daisy-btn-sm -ml-2" onclick={showDances}
				>← Dances</button
			>
			<label class="daisy-input daisy-input-bordered daisy-input-sm flex items-center gap-2">
				<span class="opacity-50">⌕</span><input
					type="search"
					placeholder="Participant number"
					bind:value={query}
					aria-label="Search participants"
				/>
			</label>
		</div>
		{#if filteredPerformances.length === 0}
			<p class="rounded-box bg-base-200 p-5 text-sm opacity-70">
				No participant performances found for this dance.
			</p>
		{:else}
			<section
				class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
				aria-label="Participant performances"
			>
				{#each filteredPerformances as performance (performance.id)}
					<button
						class="daisy-card bg-base-100 border-base-300 hover:border-primary overflow-hidden border text-left transition-colors"
						disabled={openingId !== ''}
						onclick={() => openPerformance(performance)}
					>
						<div class="relative">
							<img
								class="aspect-video w-full object-cover"
								src={`/api/dev/participant-catalog/performance/${performance.id}/thumbnail`}
								alt=""
								loading="lazy"
							/>
							<span class="daisy-badge daisy-badge-neutral absolute right-3 bottom-3"
								>{performance.segments.length}
								{performance.segments.length === 1 ? 'segment' : 'segments'}</span
							>
						</div>
						<div class="daisy-card-body gap-1 p-4">
							<h2 class="daisy-card-title text-base">{performance.participantLabel}</h2>
							{#if hasParticipantVariant(performance)}
								<span class="daisy-badge daisy-badge-primary daisy-badge-outline mt-1 w-fit">
									{performance.study === 'study1' ? 'Study 1' : 'Study 2'} · {performance.condition} ·
									{phaseLabel(performance.phase)}
								</span>
							{:else}
								<p class="text-xs opacity-65">
									{performance.study === 'study1' ? 'Study 1' : 'Study 2'} · {performance.condition} ·
									{phaseLabel(performance.phase)}
								</p>
							{/if}
							{#if openingId === performance.id}<span class="text-primary mt-1 text-xs"
									>Opening…</span
								>{/if}
						</div>
					</button>
				{/each}
			</section>
		{/if}
	{/if}
</main>
