<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { DiscrepancyTask, ResearchBackend } from '$lib/research/discrepancy-client';
	import {
		fetchScores,
		readCachedScores,
		writeCachedScores,
		writeDistribution,
		type SegmentScore
	} from '$lib/research/score-cache';
	import { formatGap, gapDirection, rankGaps, scoreGap } from '$lib/research/segment-score';
	let { data }: { data: { tasks: DiscrepancyTask[]; researchBackend?: ResearchBackend } } =
		$props();
	const backend = $derived(data.researchBackend ?? 'local');
	let query = $state('');
	let status = $state('all');
	let limit = $state(50);
	let sort = $state('rank-gap');
	let scores = $state<Record<string, SegmentScore>>({});
	let scoring = $state(false);
	let scoreError = $state('');
	const scorable = $derived(data.tasks.filter((task) => task.referenceAvailable));
	const scoredCount = $derived(scorable.filter((task) => scores[task.segmentId]).length);
	const metricOf = (task: DiscrepancyTask) => scores[task.segmentId]?.score ?? null;
	const gapOf = (task: DiscrepancyTask) => scoreGap(metricOf(task), task.human.human_rating);
	const ranks = $derived(
		scoredCount === scorable.length
			? rankGaps(
					scorable.map((task) => ({
						id: task.segmentId,
						human: task.human.human_rating,
						metric: metricOf(task)
					}))
				)
			: new Map<string, number>()
	);
	const ranksReady = $derived(ranks.size > 0);

	onMount(() => {
		const controller = new AbortController();
		scores = readCachedScores(backend, __RESEARCH_METRIC_RELEASE__);
		void scoreMissing(controller.signal);
		return () => controller.abort();
	});
	async function scoreMissing(signal: AbortSignal) {
		const missing = scorable.filter((task) => !scores[task.segmentId]).map((t) => t.segmentId);
		if (!missing.length) return saveDistribution();
		scoring = true;
		scoreError = '';
		const batches: string[][] = [];
		for (let i = 0; i < missing.length; i += 25) batches.push(missing.slice(i, i + 25));
		const worker = async () => {
			while (batches.length && !signal.aborted) {
				const batch = batches.shift()!;
				const results = await fetchScores(backend, batch, signal);
				const next = { ...scores };
				for (const result of results)
					if (result.valid > 0) next[result.segmentId] = result;
					else next[result.segmentId] = { ...result, score: null };
				scores = next;
				writeCachedScores(backend, __RESEARCH_METRIC_RELEASE__, $state.snapshot(scores));
			}
		};
		try {
			await Promise.all([worker(), worker(), worker()]);
			saveDistribution();
		} catch (caught) {
			if (!signal.aborted)
				scoreError = caught instanceof Error ? caught.message : 'Scoring failed.';
		} finally {
			scoring = false;
		}
	}
	function saveDistribution() {
		const rows = scorable.filter(
			(task) => metricOf(task) !== null && task.human.human_rating !== null
		);
		if (rows.length !== scorable.length) return;
		writeDistribution(backend, __RESEARCH_METRIC_RELEASE__, {
			humans: rows.map((task) => task.human.human_rating!),
			metrics: rows.map((task) => metricOf(task)!),
			count: rows.length
		});
	}
	function rescore() {
		scores = {};
		writeCachedScores(backend, __RESEARCH_METRIC_RELEASE__, {});
		void scoreMissing(new AbortController().signal);
	}

	const tasks = $derived(
		data.tasks.filter(
			(task) =>
				`${task.participantLabel} ${task.study} ${task.dance} ${task.condition} ${task.clipNumber}`
					.toLowerCase()
					.includes(query.toLowerCase()) &&
				(status === 'all' || (status === 'reviewed') === task.observations.length > 0)
		)
	);
	/** Unknown values sort last in every direction. */
	const known = (value: number | null | undefined): value is number =>
		value !== null && value !== undefined && Number.isFinite(value);
	const byDescending = (a: number | null | undefined, b: number | null | undefined) =>
		known(a) && known(b) ? b - a : known(a) ? -1 : known(b) ? 1 : 0;
	const abs = (value: number | null | undefined) => (known(value) ? Math.abs(value) : null);
	const sortedTasks = $derived(
		[...tasks].sort((a, b) => {
			if (sort === 'rank-gap')
				return byDescending(abs(ranks.get(a.segmentId)), abs(ranks.get(b.segmentId)));
			if (sort === 'gap') return byDescending(abs(gapOf(a)), abs(gapOf(b)));
			if (sort === 'harsher') return byDescending(-(gapOf(a) ?? NaN), -(gapOf(b) ?? NaN));
			if (sort === 'kinder') return byDescending(gapOf(a), gapOf(b));
			if (sort === 'agreement')
				return byDescending(-(abs(gapOf(a)) ?? NaN), -(abs(gapOf(b)) ?? NaN));
			if (sort === 'human-low') return (a.human.human_rating ?? 0) - (b.human.human_rating ?? 0);
			if (sort === 'human-high') return (b.human.human_rating ?? 0) - (a.human.human_rating ?? 0);
			if (sort === 'rater-spread') {
				const spread = (task: (typeof tasks)[number]) => {
					const ratings = [task.human.rating_1, task.human.rating_2, task.human.rating_3].filter(
						(value): value is number => value !== null
					);
					return ratings.length > 1 ? Math.max(...ratings) - Math.min(...ratings) : -1;
				};
				return spread(b) - spread(a);
			}
			return 0;
		})
	);
	function barStyle(gap: number | null, span: number) {
		if (gap === null) return 'display:none';
		const width = Math.min(50, (Math.abs(gap) / span) * 50);
		return `left:${gap < 0 ? 50 - width : 50}%;width:${width}%`;
	}
	function exportNotes() {
		const blob = new Blob(
			[
				JSON.stringify(
					{
						schemaVersion: 1,
						exportedAt: new Date().toISOString(),
						tasks: data.tasks.filter((task) => task.observations.length)
					},
					null,
					2
				)
			],
			{ type: 'application/json' }
		);
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = 'discrepancy-observations.json';
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<svelte:head><title>Human–metric discrepancy review</title></svelte:head>
<main class="mx-auto max-w-6xl space-y-4 p-4 sm:p-8">
	<a href={resolve('/research')} class="link link-primary">← Research studio</a>
	<h1 class="text-2xl font-bold">Human–metric discrepancy review</h1>
	<p>
		Investigate why automatic motion scores and prior-study human similarity ratings may disagree.
		Choose a segment, play the video with its metric curve, and mark observations. Agreement cases
		are useful comparisons too.
	</p>
	<details class="text-sm opacity-80">
		<summary class="cursor-pointer">How the metric score and discrepancy are calculated</summary>
		<p class="mt-2">
			<strong>Metric</strong> is the Qijia2D baseline (all 8 vectors, no visibility weighting): the
			mean over valid frames of 5 × (1 − mean vector error / 2), using the same pose pairing as the
			inspector. <strong>Human</strong> is the prior-study mean of three 1–3 ratings mapped to 1–5.
			<strong>Gap</strong> is metric − human on that shared 0–5 axis; the scales are not calibrated
			against each other. <strong>Rank gap</strong> is the metric's percentile among all scored segments
			minus the human rating's percentile, in percentile points, and is shown once every segment has a
			score. Negative means the metric is harsher than the raters.
		</p>
	</details>
	<div class="flex flex-wrap items-center gap-3">
		<input
			class="daisy-input"
			aria-label="Find a review segment"
			placeholder="Participant, dance, condition…"
			bind:value={query}
		/>
		<select class="daisy-select w-auto" aria-label="Review status" bind:value={status}
			><option value="all">All segments</option><option value="unreviewed"
				>Without observations</option
			><option value="reviewed">With observations</option></select
		>
		<select class="daisy-select w-auto" aria-label="Sort review segments" bind:value={sort}>
			<option value="rank-gap">Largest rank gap</option>
			<option value="gap">Largest score gap</option>
			<option value="harsher">Metric harsher first</option>
			<option value="kinder">Metric kinder first</option>
			<option value="agreement">Best agreement</option>
			<option value="identity">Performance order</option>
			<option value="human-low">Lowest human mean</option>
			<option value="human-high">Highest human mean</option>
			<option value="rater-spread">Largest rater disagreement</option>
		</select>
		<button class="daisy-btn daisy-btn-outline" onclick={exportNotes}
			>Export observations (JSON)</button
		>
		<span class="text-sm" role="status"
			>{tasks.length} segments · {data.tasks.filter((task) => task.observations.length).length} reviewed</span
		>
	</div>
	{#if scoring || scoreError || scoredCount < scorable.length}
		<div class="flex flex-wrap items-center gap-3 text-sm" aria-live="polite">
			{#if scoring}<progress
					class="daisy-progress daisy-progress-primary w-48"
					value={scoredCount}
					max={scorable.length}
				></progress>
				<span
					>Scoring segments {scoredCount} / {scorable.length}. Rank gaps appear when all are scored.</span
				>{:else if scoreError}<span class="text-error">{scoreError}</span><button
					class="daisy-btn daisy-btn-sm"
					onclick={() => void scoreMissing(new AbortController().signal)}>Retry</button
				>{/if}
		</div>
	{:else}
		<p class="text-xs opacity-60">
			Scores cached in this browser for metric release {__RESEARCH_METRIC_RELEASE__.slice(0, 8)}.
			<button class="link" onclick={rescore}>Recompute</button>
		</p>
	{/if}
	{#if !tasks.length}<p class="daisy-alert">
			No matching segments. Try clearing your filters. Review requires matching human ratings,
			participant video and pose data.
		</p>{:else}
		<div class="overflow-x-auto">
			<table class="daisy-table">
				<thead
					><tr
						><th>Performance</th><th>Segment</th><th>Human / 5</th><th>Raters 1–3</th><th
							>Metric / 5</th
						><th>Gap</th><th>Rank gap</th><th>Notes</th><th>Inspect</th></tr
					></thead
				><tbody>
					{#each sortedTasks.slice(0, limit) as task (task.segmentId)}
						{@const gap = gapOf(task)}
						{@const rank = ranks.get(task.segmentId) ?? null}
						<tr>
							<td
								>{task.participantLabel}
								<div class="text-xs opacity-70">
									{task.study} · {task.dance} · {task.condition}{task.phase
										? ` · ${task.phase}`
										: ''}
								</div></td
							>
							<td>{task.clipNumber}</td><td>{task.human.human_rating?.toFixed(2)}</td><td
								>{[task.human.rating_1, task.human.rating_2, task.human.rating_3]
									.map((value) => value ?? '—')
									.join(' / ')}</td
							><td class="tabular-nums"
								>{metricOf(task)?.toFixed(2) ??
									(scores[task.segmentId] ? 'no valid frames' : '…')}</td
							>
							<td class="tabular-nums">
								<div class="flex items-center gap-2">
									<span class="gap-bar" aria-hidden="true"
										><i class:harsher={(gap ?? 0) < 0} style={barStyle(gap, 2)}></i></span
									><strong>{formatGap(gap)}</strong>
								</div>
								<div class="text-xs opacity-70">{gap === null ? '' : gapDirection(gap)}</div>
							</td>
							<td class="tabular-nums"
								>{ranksReady && rank !== null ? `${formatGap(rank, 0)} pts` : '—'}</td
							>
							<td>{task.observations.length}</td>
							<td
								>{#if task.referenceAvailable}<a
										class="daisy-btn daisy-btn-primary daisy-btn-sm"
										href={resolve(
											`/metrics/qijia2d?performance=${task.performanceId}&segment=${task.segmentId}&review=discrepancy`
										)}>▶ Review</a
									>{:else}<span class="text-xs">Reference pose missing</span>{/if}</td
							>
						</tr>{/each}
				</tbody>
			</table>
		</div>
		{#if limit < tasks.length}<button
				class="daisy-btn daisy-btn-outline"
				onclick={() => (limit += 50)}>Show 50 more ({tasks.length - limit} remaining)</button
			>{/if}
	{/if}
</main>

<style>
	.gap-bar {
		position: relative;
		display: inline-block;
		width: 5rem;
		height: 0.6rem;
		border-radius: 0.3rem;
		background: color-mix(in srgb, currentColor 10%, transparent);
	}
	.gap-bar::after {
		content: '';
		position: absolute;
		left: 50%;
		top: -0.2rem;
		bottom: -0.2rem;
		width: 1px;
		background: color-mix(in srgb, currentColor 50%, transparent);
	}
	.gap-bar i {
		position: absolute;
		top: 0;
		bottom: 0;
		border-radius: 0.3rem;
		background: #2563eb;
	}
	.gap-bar i.harsher {
		background: #c2410c;
	}
</style>
