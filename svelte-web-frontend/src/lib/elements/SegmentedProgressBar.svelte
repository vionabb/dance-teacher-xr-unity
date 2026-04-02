<script lang="ts" context="module">
	export type SegmentedProgressBarProps = {
		startTime: number;
		endTime: number;
		currentTime: number;
		breakpoints: number[];
		labels: string[];
		// classes: string[][],
		enableSegmentClick: boolean[] | boolean;
		isolatedSegments: number | undefined | number[];
	};
	export type SegmentedProgressBarPropsWithoutCurrentTime = Omit<
		SegmentedProgressBarProps,
		'currentTime'
	>;
</script>

<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let startTime = 0;
	export let endTime = 1;
	export let currentTime: number;
	export let breakpoints: number[] = [];
	export let labels: string[] = [];
	export let classes: string[][] = [];
	export let enableSegmentClick: boolean[] | boolean = false;
	export let isolatedSegments: number | undefined | number[];

	const dispatch = createEventDispatcher();

	let segments = [] as {
		index: number;
		start: number;
		end: number;
		duration: number;
		label?: string;
		classes: string[];
	}[];
	$: {
		segments = [];
		let start = startTime;
		let i = 0;
		while (breakpoints.length + 1 > i) {
			let end = breakpoints.length > i ? breakpoints[i] : endTime;
			segments.push({
				index: i,
				start: start,
				end: end,
				duration: end - start,
				label: labels[i],
				classes: classes[i] ?? []
			});
			start = end;
			i += 1;
		}
	}
</script>

<div class="segmented-progress-bar">
	{#each segments as segment, i}
		{@const hasAnIsolatedSegment = isolatedSegments !== undefined}
		{@const isIsolatedSegment =
			hasAnIsolatedSegment &&
			(isolatedSegments === segment.index ||
				(Array.isArray(isolatedSegments) && isolatedSegments.includes(segment.index)))}
		{@const isNonActiveSegment = hasAnIsolatedSegment && !isIsolatedSegment}
		{@const isActiveSegment = !isNonActiveSegment}
		<button
			class="progressbutton daisy-btn rounded-full text-sm"
			class:clickable={enableSegmentClick === true ||
				(Array.isArray(enableSegmentClick) && enableSegmentClick[i])}
			on:click={() => {
				if (
					enableSegmentClick === true ||
					(Array.isArray(enableSegmentClick) && enableSegmentClick[i])
				) {
					dispatch('segmentClicked', segment);
				}
			}}
			style:--segment-time={segment.duration}
			style:--percent-progress={isNonActiveSegment
				? 0
				: Math.max(0, Math.min(segment.duration, currentTime - segment.start)) / segment.duration}
		>
			<span class="progress-container absolute inset-2 overflow-hidden rounded-full bg-white">
				<span class="progress bg-gray block"></span>
			</span>

			{#if segment.label}
				<div class="flex-column absolute inset-0 flex items-center justify-center">
					<span class="m-0 text-xs">{segment.label}</span>
				</div>
			{/if}
		</button>
	{/each}
</div>

<!-- <div style="background: white">
    {currentTime.toFixed(2)}s
    {isolatedSegments?.toString()}
</div> -->

<style lang="scss">
	.segmented-progress-bar {
		display: flex;
		flex-direction: row;
		width: 100%;
		position: relative;

		> .progressbutton {
			// border: none;
			flex-basis: 0;
			flex-grow: var(--segment-time);
			margin: 0;
			overflow: hidden;
			position: relative;

			&.clickable {
				cursor: pointer;
			}

			& .progress {
				right: auto;
				height: 100%;
				background: rgba(0, 0, 0, 0.2);
				width: calc(100% * var(--percent-progress));
			}
		}
	}
</style>
