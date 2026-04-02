<script lang="ts" context="module">
	export type BodyPartHighlight = {
		bodyPart: TerminalFeedbackBodyPart;
		fillColor?: string;
		outlineColor?: string;
	};
</script>

<script lang="ts">
	import type { TerminalFeedbackBodyPart } from '$lib/model/TerminalFeedback';

	export let highlights: BodyPartHighlight[] = [];
	export let stdFillColor = '#000';
	export let stdOutlineColor = '#AAA';
	export let highlightFillColor = '#000';
	export let highlightOutlineColor = '#77F';

	const bodyPartPaths: Record<TerminalFeedbackBodyPart, string> = {
		head: 'M 7 0 C 9.5 0 10 2 10 4 S 8.5 8 7 8 S 4 6 4 4 S 4.5 0 7 0 Z',
		torso:
			'M 7 10 C 10 10 12 10 12 11 S 10.5 18 10.5 21 S 11 26 11 27 S 9 28 7 28 S 3 28 3 27 S 3.5 24 3.5 21 S 2 12 2 11 S 4 10 7 10 Z',
		leftleg:
			'M 8 29 L 8.5 40 L 8.25 50 C 8.25 51 8.35 52 8.5 53.5 C 9.5 53.5 10.75 53.5 10.5 53 L 9.5 51 L 10.5 41 L 10.5 40 L 11 29 C 11 28.25 8 28.25 8 29 Z',
		rightleg:
			'M 6 29 L 5.5 40 L 5.75 50 C 5.75 51 5.65 52 5.5 53.5 C 4.5 53.5 3.25 53.5 3.5 53 L 4.5 51 L 3.5 41 L 3.5 40 L 3 29 C 3 28.25 6 28.25 6 29 Z',
		leftarm:
			'M 12.25 11 C 12.75 11.5 12.75 12 13 13 C 13.5 16 13.75 18 13.75 20 S 13 25 13 26 S 13.2 27 13.2 28 S 12 29 12 28.5 S 11.75 27 12 26 C 12.25 25 12 22 12.5 20 C 12.1 14 11.5 15 12.2 11 Z',
		rightarm:
			'M 1.75 11 C 1.25 11.5 1.25 12 1 13 C 0.5 16 0.25 18 0.25 20 S 1 25 1 26 S 0.8 27 0.8 28 S 2 29 2 28.5 S 2.25 27 2 26 C 1.75 25 2 22 1.5 20 C 1.9 14 2.5 15 1.8 11 Z'
	};
	const allBodyParts = Object.keys(bodyPartPaths) as TerminalFeedbackBodyPart[];
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -1 14 55" preserveAspectRatio="xMinYMin slice">
	{#each allBodyParts as bodyPart, i}
		<path
			d={bodyPartPaths[bodyPart]}
			fill={stdFillColor}
			stroke={stdOutlineColor}
			stroke-width="0.5"
		/>
	{/each}
	{#each highlights as highlight, i}
		<path
			d={bodyPartPaths[highlight.bodyPart]}
			fill={highlight.fillColor ?? highlightFillColor}
			stroke={highlight.outlineColor ?? highlightOutlineColor}
			stroke-width="0.5"
		/>
	{/each}
</svg>

<style lang="scss">
	svg {
		height: 100%;
		max-height: 100%;
		max-width: 100%;
		min-height: 150px;
		min-width: calc(150px * 14 / 55);
	}
</style>
