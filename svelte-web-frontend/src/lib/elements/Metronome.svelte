<script lang="ts">
	import metronomeClickSoundSrc from '$lib/media/audio/metronome.mp3';
	import { onMount } from 'svelte';
	export let bpm = 120;
	export let playing = false;
	export let volume: number = 1.0;

	let intervalMs: number;
	$: intervalMs = (60 / bpm) * 1000;

	let audioElement: HTMLAudioElement;

	onMount(() => {
		let animFrameId: number | undefined;
		function playNextClick() {
			if (playing) {
				audioElement.play();
			}

			animFrameId = requestAnimationFrame(playNextClick);
		}

		return () => {};
	});
</script>

<audio bind:this={audioElement} src={metronomeClickSoundSrc} bind:volume />
