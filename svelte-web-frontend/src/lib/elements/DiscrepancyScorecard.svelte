<script lang="ts">
	import { onMount } from 'svelte';
	import type { DiscrepancyTask, ResearchBackend } from '$lib/research/discrepancy-client';
	import { readDistribution, type ScoreDistribution } from '$lib/research/score-cache';
	import {
		formatGap,
		gapDirection,
		intervalScores,
		percentileRank,
		scoreGap,
		type ScoreSample
	} from '$lib/research/segment-score';

	/** Mockup A's band above the videos: human mean, metric score, gap and rank gap. */
	let {
		human,
		unrated = false,
		samples = null,
		baselineCurve = false,
		backend,
		metric
	}: {
		human: DiscrepancyTask['human'] | null;
		unrated?: boolean;
		/** Frame scores for the active segment; null when the metric has no 0–5 score. */
		samples?: ScoreSample[] | null;
		baselineCurve?: boolean;
		backend: ResearchBackend;
		metric: 'qijia2d' | 'viona2d';
	} = $props();

	let distribution = $state<ScoreDistribution | null>(null);
	onMount(() => {
		distribution = readDistribution(backend, __RESEARCH_METRIC_RELEASE__);
	});
	const whole = $derived(samples ? intervalScores(samples, 0, Infinity).whole : null);
	const humanMean = $derived(human?.human_rating ?? null);
	const gap = $derived(scoreGap(whole?.score ?? null, humanMean));
	const rankGap = $derived.by(() => {
		const metricScore = whole?.score ?? null;
		if (!baselineCurve || !distribution || metricScore === null || humanMean === null) return null;
		const metricRank = percentileRank(distribution.metrics, metricScore);
		const humanRank = percentileRank(distribution.humans, humanMean);
		return metricRank === null || humanRank === null ? null : 100 * (metricRank - humanRank);
	});
	/** Position on the shared 1–5 axis as a percentage. */
	const axis = (value: number | null) =>
		value === null ? null : Math.max(0, Math.min(100, ((value - 1) / 4) * 100));
	const humanPos = $derived(axis(humanMean));
	const metricPos = $derived(axis(whole?.score ?? null));
</script>

<section class="scorecard-band" aria-label="Human rating versus metric score">
	<div>
		<span class="label">Human similarity (mean of 3 raters)</span>
		{#if unrated}<strong class="value">—</strong><span class="detail"
				>No prior-study rating for this segment</span
			>{:else if human}<strong class="value"
				>{humanMean?.toFixed(2) ?? 'missing'}<small> / 5</small></strong
			><span class="detail"
				>Raters {[human.rating_1, human.rating_2, human.rating_3]
					.map((value) => value ?? '—')
					.join(' / ')} on 1–3</span
			>{:else}<strong class="value">…</strong>{/if}
	</div>
	<div>
		<span class="label"
			>{metric === 'qijia2d'
				? `Metric score (${baselineCurve ? 'Qijia2D baseline' : 'your first curve'}, whole segment)`
				: 'Metric score'}</span
		>
		{#if whole}<strong class="value"
				>{whole.score?.toFixed(2) ?? 'no valid frames'}<small> / 5</small></strong
			><span class="detail"
				>5 × (1 − mean error / 2) · {whole.valid}/{whole.total} valid frames</span
			>{:else}<strong class="value">—</strong><span class="detail"
				>{metric === 'viona2d'
					? 'Viona2D has no 0–5 score; compare with the dissimilarity curve'
					: 'Loading pose data…'}</span
			>{/if}
	</div>
	<div>
		<span class="label">Discrepancy (metric − human)</span>
		<strong class="value" class:harsher={(gap ?? 0) < 0} class:kinder={(gap ?? 0) > 0}
			>{formatGap(gap)}</strong
		><span class="detail"
			>{gap === null
				? 'Needs both a human rating and a metric score'
				: gapDirection(gap)}{rankGap !== null
				? ` · rank gap ${formatGap(rankGap, 0)} percentile pts`
				: ''}</span
		>
	</div>
	<div class="axis-cell" aria-hidden="true">
		<span class="label">Common 1–5 axis (uncalibrated)</span>
		<div class="axis">
			{#if humanPos !== null && metricPos !== null}<span
					class="span"
					class:harsher={(gap ?? 0) < 0}
					style:left={`${Math.min(humanPos, metricPos)}%`}
					style:width={`${Math.abs(humanPos - metricPos)}%`}
				></span>{/if}
			{#if metricPos !== null}<span class="dot metric" style:left={`${metricPos}%`}></span>{/if}
			{#if humanPos !== null}<span class="dot human" style:left={`${humanPos}%`}></span>{/if}
		</div>
		<span class="legend"><span>● metric</span><span>■ human</span></span>
	</div>
</section>

<style>
	.scorecard-band {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr));
		gap: 1rem;
		align-items: start;
		padding: 1rem 1.25rem;
		background: var(--color-base-100);
		border: 1px solid var(--color-base-300);
		border-radius: 0.75rem;
	}
	.scorecard-band > div {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		min-width: 0;
	}
	.label {
		font-size: 0.75rem;
		opacity: 0.75;
	}
	.value {
		font-size: 1.75rem;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		line-height: 1.2;
	}
	.value small {
		font-size: 0.85rem;
		font-weight: 400;
		opacity: 0.7;
	}
	.value.harsher {
		color: #c2410c;
	}
	.value.kinder {
		color: #2563eb;
	}
	.detail {
		font-size: 0.75rem;
		opacity: 0.8;
	}
	.axis {
		position: relative;
		height: 1.9rem;
		margin-top: 0.25rem;
		border-radius: 0.4rem;
		background: var(--color-base-200);
	}
	.span {
		position: absolute;
		top: calc(50% - 2px);
		height: 4px;
		background: #93b4f5;
	}
	.span.harsher {
		background: #f0a46a;
	}
	.dot {
		position: absolute;
		top: calc(50% - 7px);
		width: 14px;
		height: 14px;
		margin-left: -7px;
	}
	.dot.metric {
		border-radius: 50%;
		background: #c2410c;
	}
	.dot.human {
		border-radius: 3px;
		background: #3a539b;
	}
	.legend {
		display: flex;
		gap: 0.75rem;
		font-size: 0.7rem;
		opacity: 0.75;
	}
</style>
