<script lang="ts">
	import { onMount } from 'svelte';
	import {
		parseRawPoseCsv,
		reindexFramesByRowIndex,
		sourcePoseRowAtTime,
		UPPER_SKELETON_EDGES,
		type InspectorFrame
	} from '$lib/ai/motionmetrics/qijia2d-inspector';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
	let videoElement: HTMLVideoElement | undefined;
	let frames: Map<number, InspectorFrame> | null = null;
	let currentPose = $state<InspectorFrame | null>(null);
	let dimensions = $state({ width: 640, height: 360 });
	let poseError = $state('');
	let showPose = $state(true);

	onMount(() => {
		let active = true;
		void fetch(`/research/studies/media/${data.media.id}/pose`, { cache: 'no-store' })
			.then(async (response) => {
				if (!response.ok) throw new Error('Could not load the raw pose file.');
				return response.text();
			})
			.then((csv) => {
				if (active) {
					frames = reindexFramesByRowIndex(parseRawPoseCsv(csv));
					if (videoElement) syncPoseAt(videoElement.currentTime);
				}
			})
			.catch((reason: unknown) => {
				if (active) poseError = reason instanceof Error ? reason.message : 'Could not load pose.';
			});
		return () => {
			active = false;
		};
	});

	function syncPoseAt(timeSeconds: number) {
		const row = frames ? sourcePoseRowAtTime(frames, timeSeconds, 30) : null;
		currentPose = row === null ? null : (frames?.get(row) ?? null);
	}

	function syncPose(event: Event) {
		syncPoseAt((event.currentTarget as HTMLVideoElement).currentTime);
	}

	function onMetadata(event: Event) {
		const video = event.currentTarget as HTMLVideoElement;
		if (video.videoWidth > 0 && video.videoHeight > 0)
			dimensions = { width: video.videoWidth, height: video.videoHeight };
		syncPose(event);
	}
</script>

<svelte:head>
	<title>CHI25 recording</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="mx-auto max-w-5xl space-y-4 p-4 sm:p-8">
	<a class="link" href="/research/studies?study={data.media.study}">Back to recordings</a>
	<h1 class="text-xl font-semibold break-all">{data.media.source_stem}</h1>
	<p class="text-sm">
		{data.media.study === 'chi25_study1' ? 'Study 1' : 'Study 2'} · Raw image-space pose at 30 frames
		per second
	</p>
	<div class="relative max-w-3xl bg-black">
		<!-- svelte-ignore a11y_media_has_caption: Source study recordings have no caption tracks. -->
		<video
			class="block w-full"
			bind:this={videoElement}
			controls
			preload="metadata"
			src="/research/studies/media/{data.media.id}/video"
			onloadedmetadata={onMetadata}
			ontimeupdate={syncPose}
			onseeked={syncPose}
			aria-label="Participant recording"
		></video>
		{#if showPose && currentPose}
			<svg
				class="pointer-events-none absolute inset-0 h-full w-full"
				viewBox="0 0 {dimensions.width} {dimensions.height}"
				role="img"
				aria-label="Raw pose overlay"
			>
				{#each UPPER_SKELETON_EDGES as [a, b] (`${a}-${b}`)}
					{@const first = currentPose.landmarks[a]}
					{@const second = currentPose.landmarks[b]}
					{#if Number.isFinite(first.x) && Number.isFinite(first.y) && Number.isFinite(second.x) && Number.isFinite(second.y)}
						<line
							x1={first.x}
							y1={first.y}
							x2={second.x}
							y2={second.y}
							stroke="#f8fafc"
							stroke-width="3"
						/>
					{/if}
				{/each}
			</svg>
		{/if}
	</div>
	<label class="flex items-center gap-2"
		><input type="checkbox" class="checkbox" bind:checked={showPose} /> Show raw pose</label
	>
	{#if poseError}<p class="text-error" role="alert">{poseError}</p>{/if}
	<a class="link" href="/research/studies/media/{data.media.id}/pose" download
		>Download raw 2D pose CSV</a
	>
</main>
