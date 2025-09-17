<script lang="ts">
	import { run } from 'svelte/legacy';

	import type { TerminalFeedback } from '$lib/model/TerminalFeedback';
	import { debugMode } from '$lib/model/settings';

	import SeekToStartIcon from 'virtual:icons/lucide/arrow-left-to-line';
	import PlayIcon from 'virtual:icons/lucide/play';
	import PauseIcon from 'virtual:icons/lucide/pause';
	import { onDestroy } from 'svelte';

	interface Props {
		referenceVideoUrl: string | undefined;
		recordingBlob: Blob | undefined;
		recordingStartOffset?: number;
		recordingSpeed?: number;
		recordingMimeType: string | undefined;
	}

	let {
		referenceVideoUrl,
		recordingBlob,
		recordingStartOffset = 0,
		recordingSpeed = $bindable(1),
		recordingMimeType
	}: Props = $props();

	let lastRecordingBlobUrl: string | undefined = undefined;
	const recordingBlobUrl = $derived.by(() => {
		// Revoke previous object URL if it exists and is different
		if (lastRecordingBlobUrl && recordingBlob && lastRecordingBlobUrl !== undefined) {
			URL.revokeObjectURL(lastRecordingBlobUrl);
			lastRecordingBlobUrl = undefined;
		}
		if (recordingBlob) {
			lastRecordingBlobUrl = URL.createObjectURL(recordingBlob);
			return lastRecordingBlobUrl;
		}
		return undefined;
	});
	onDestroy(() => {
		if (lastRecordingBlobUrl) {
			URL.revokeObjectURL(lastRecordingBlobUrl);
		}
	});

	let recordingVideoTime: number = $state(0);
	let recordingDuration: number = $state(0);
	let referenceVideoTime: number = $state(0);

	let referenceCorrespondingDuration = $derived(recordingDuration * recordingSpeed);
	let referenceVideoStart = $derived(recordingStartOffset);
	let referenceVideoEnd = $derived(recordingStartOffset + referenceCorrespondingDuration);
	let isNearPlaybackEnd = $derived(referenceVideoTime > referenceVideoEnd - 0.5);

	let referenceVideoPaused = $state(true);
	let recordingVideoPaused = $state(true);

	let recordingVideoWidth = $state(1);
	let recordingVideoHeight = $state(1);
	let referenceVideoWidth = $state(1);
	let referenceVideoHeight = $state(1);
	let recordingAspectRatio = $derived(recordingVideoWidth > 0 && recordingVideoHeight > 0 ? 
    recordingVideoWidth / recordingVideoHeight
    : 1
  );
  let referenceAspectRatio = $derived(referenceVideoWidth > 0 && referenceVideoHeight > 0 ? 
    recordingVideoWidth / referenceVideoHeight
    : 1
  );

	function togglePlayPauseRecording() {
		if (recordingVideoPaused) {
			referenceVideoPaused = false;
			recordingVideoPaused = false;
		} else {
			referenceVideoPaused = true;
			recordingVideoPaused = true;
		}
	}

	function resetToStart() {
		referenceVideoTime = referenceVideoStart;
		recordingVideoTime = 0;
	}

	function getCorrespondingRecordingTime(referenceTime: number) {
		const recordingVideoEquivalentTime = (referenceTime - recordingStartOffset) / recordingSpeed;
		return recordingVideoEquivalentTime;
	}

	function setBothTimes(referenceTime: number) {
		if (isNaN(+referenceTime)) {
			return;
		}

		referenceVideoTime = referenceTime;
		const recordingVideoEquivalentTime = getCorrespondingRecordingTime(referenceTime);
		recordingVideoTime = recordingVideoEquivalentTime;
	}

	const debugDigits = 2;
</script>

<section
	class="reviewPage"
	style:grid-template-columns={`${referenceAspectRatio}fr ${recordingAspectRatio}fr`}
>
	<div class="refVideoWrapper videoWrapper">
		<video
			src={referenceVideoUrl}
			class="refVideo"
			bind:currentTime={referenceVideoTime}
			bind:playbackRate={recordingSpeed}
			bind:paused={referenceVideoPaused}
			bind:videoWidth={referenceVideoWidth}
			bind:videoHeight={referenceVideoHeight}
			onloadeddata={() => {
				referenceVideoTime = referenceVideoStart;
			}}
		>
      <track kind="captions" />
  </video>
	</div>
	<div class="recordedVideoWrapper videoWrapper">
		<video
			src={recordingBlobUrl}
			class="recordedVideo"
			style="transform: scaleX(-1);"
			bind:currentTime={recordingVideoTime}
			bind:duration={recordingDuration}
			bind:paused={recordingVideoPaused}
			bind:videoWidth={recordingVideoWidth}
			bind:videoHeight={recordingVideoHeight}
			onended={() => {
				referenceVideoPaused = true;
				recordingVideoPaused = true;
			}}
		>
      <track kind="captions" />
    </video>
	</div>

	<div class="controls">
		<div class="control-row">
			<input
				class="seeker"
				type="range"
				name="videoTime"
				min={referenceVideoStart}
				max={referenceVideoEnd - 4 / 30}
				value={referenceVideoTime}
				step={1 / 30}
				oninput={(e) => setBothTimes(+e.currentTarget.value)}
			/>
		</div>
		{#if $debugMode}
			<div>
				Recording ({recordingSpeed.toFixed(2)}x): {getCorrespondingRecordingTime(
					referenceVideoStart
				).toFixed(debugDigits)}s --- {recordingVideoTime.toFixed(debugDigits)}s ---{getCorrespondingRecordingTime(
					referenceVideoEnd
				).toFixed(debugDigits)}s &nbsp;Duration: {recordingDuration.toFixed(debugDigits)}s
			</div>
			<div>
				Reference: {referenceVideoStart.toFixed(debugDigits)}s --- {referenceVideoTime.toFixed(
					debugDigits
				)}s --- {referenceVideoEnd.toFixed(debugDigits)}s &nbsp;Duration: {referenceCorrespondingDuration.toFixed(
					debugDigits
				)}s
			</div>
		{/if}

		<div class="control-row space-x-2">
			<button class="daisy-btn" onclick={resetToStart} aria-label="Reset to start">
				<SeekToStartIcon />
			</button>
			<button class="daisy-btn" onclick={togglePlayPauseRecording}>
				{#if recordingVideoPaused}
					<PlayIcon />
				{:else}
					<PauseIcon />
				{/if}
			</button>
		</div>
	</div>
</section>

<style lang="scss">
	.reviewPage {
		display: grid;
		grid-template-areas:
			'refVideo recordedVideo'
			'controls controls';
		grid-template-rows: 1fr auto;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
		height: 100%;
		width: 100%;

		& video {
			min-width: 0;
			min-height: 0;
			max-width: 100%;
			max-height: 100%;
			align-self: center;
		}
	}

	.videoWrapper {
		min-height: 0;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}
	.refVideoWrapper {
		grid-area: refVideo;
		// background: blue;
	}
	.recordedVideoWrapper {
		grid-area: recordedVideo;
		// background: red;
	}
	.controls {
		grid-area: controls;
	}

	.seeker {
		width: 100%;
	}

	.control-row {
		display: flex;
		flex-flow: row wrap;
		align-items: start;
		justify-content: center;
	}
</style>
