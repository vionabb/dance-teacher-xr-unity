<script lang="ts">
	/** Mockup A's round Play/Pause in the timeline dock: plays the segment from the playhead. */
	let {
		playing,
		localTime,
		duration,
		onplay,
		onpause
	}: {
		playing: boolean;
		localTime: number;
		duration: number;
		onplay: (from: number, to: number) => void;
		onpause: () => void;
	} = $props();
	function toggle() {
		if (playing) return onpause();
		onplay(localTime >= duration - 0.05 ? 0 : localTime, duration);
	}
</script>

<div class="review-play">
	<button
		type="button"
		class="daisy-btn daisy-btn-primary daisy-btn-circle"
		aria-label={playing ? 'Pause' : 'Play segment'}
		title="Space"
		onclick={toggle}
	>
		{#if playing}<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
				><rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor"></rect><rect
					x="14"
					y="5"
					width="4"
					height="14"
					rx="1"
					fill="currentColor"
				></rect></svg
			>{:else}<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"
				><path d="M8 5v14l11-7z" fill="currentColor"></path></svg
			>{/if}
	</button>
	<span class="time">{localTime.toFixed(2)}s / {duration.toFixed(2)}s</span>
</div>

<style>
	.review-play {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}
	.review-play button {
		width: 3rem;
		height: 3rem;
	}
	.time {
		font-size: 0.85rem;
		font-variant-numeric: tabular-nums;
	}
</style>
