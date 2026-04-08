<script lang="ts">
	import { webcamStream } from './streams';

	let state: 'start' | 'busy' | 'devicelist' | 'success' = 'start';
	let busyText = '';
	let lastError: Error | null | undefined = undefined;
	let videoDeviceList: MediaDeviceInfo[] = [];
	let audioDeviceList: MediaDeviceInfo[] = [];

	let selectedAudioDeviceId: MediaDeviceInfo['deviceId'] | undefined = undefined;
	let selectedVideoDeviceId: MediaDeviceInfo['deviceId'] | undefined = undefined;

	async function startWebcam() {
		state = 'busy';
		lastError = undefined;
		busyText = 'Detecting Devices...';

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: true,
				audio: true
			});
			const devices = await navigator.mediaDevices.enumerateDevices();
			videoDeviceList = devices.filter((device) => device.kind === 'videoinput');
			audioDeviceList = devices.filter((device) => device.kind === 'audioinput');

			if (videoDeviceList.length === 0) {
				state = 'start';
				lastError = new Error('No devices found');
				return;
			}
			if (videoDeviceList.length === 1) {
				webcamStream.set(stream);
				state = 'success';
				return;
			}

			selectedVideoDeviceId = videoDeviceList[0].deviceId;
			selectedAudioDeviceId = audioDeviceList[0].deviceId;
			state = 'devicelist';
		} catch (error) {
			lastError = error;
			state = 'start';
			return;
		}
	}
	async function selectDevices() {
		lastError = undefined;
		state = 'busy';
		busyText = 'Starting Webcam...';

		try {
			const stream = await navigator.mediaDevices.getUserMedia({
				video: { deviceId: selectedVideoDeviceId },
				audio: { deviceId: selectedAudioDeviceId }
			});
			webcamStream.set(stream);
			state = 'success';
		} catch (error) {
			lastError = error;
			state = 'devicelist';
		}
	}
</script>

<div class="webcamSelector space-y-4">
	{#if state === 'start'}
		<div class="ta-center">
			<button id="startWebcam" class="daisy-btn daisy-btn-primary" on:click={startWebcam}>
				Start Webcam
			</button>
			{#if lastError}
				<div class="error">
					<p>Failed to start webcam: <code>{lastError?.message}</code></p>
				</div>
			{/if}
		</div>
	{:else if state === 'busy'}
		<div class="text-center">
			<span class="daisy-loading daisy-loading-spinner daisy-loading-md"></span>
			<p>{busyText}</p>
		</div>
	{:else if state === 'devicelist'}
		<label class="daisy-form-control" for="videoDevices">
			<div class="label"><span class="label-text">Video Devices</span></div>
			<select
				class="daisy-select daisy-select-bordered"
				name="videoDevices"
				bind:value={selectedVideoDeviceId}
			>
				{#each videoDeviceList as device}
					<option value={device.deviceId}>{device.label}</option>
				{/each}
			</select>
		</label>

		<label class="daisy-form-control" for="audioDevices">
			<div class="label"><span class="label-text">Audio Devices</span></div>
			<select
				class="daisy-select daisy-select-bordered"
				name="audioDevices"
				bind:value={selectedAudioDeviceId}
			>
				{#each audioDeviceList as device}
					<option value={device.deviceId}>{device.label}</option>
				{/each}
			</select>
		</label>

		<button class="daisy-btn daisy-btn-primary" on:click={selectDevices}>Start Webcam</button>
	{:else if state === 'success'}
		<div>Webcam Started</div>
	{/if}
</div>

<style lang="scss">
	.error {
		color: var(--color-red);

		& > p {
			max-width: var(--max-line-width);
		}
	}

	.webcamSelector {
		display: flex;
		flex-direction: column;
		align-items: start;
		justify-content: center;
		height: 100%;
		gap: 0.25rem;
	}

	.spacer {
		height: 1rem;
	}
</style>
