<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import ResearchHeader from '$lib/elements/ResearchHeader.svelte';
	import ResearchIcon from '$lib/elements/ResearchIcon.svelte';
	import { recordingTitle } from '$lib/research/source-stem';
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
		void fetch(
			resolve('/research/studies/media/[id]/[kind]', { id: data.media.id, kind: 'pose' }),
			{ cache: 'no-store' }
		)
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

<main class="mx-auto max-w-5xl space-y-5 px-4 py-6 sm:px-6">
	<ResearchHeader
		title={recordingTitle(data.media.source_stem)}
		crumbs={[
			{
				label: `Recordings · ${data.media.study === 'chi25_study1' ? 'Study 1' : 'Study 2'}`,
				href: `${resolve('/research/studies')}?study=${data.media.study}`
			}
		]}
	>
		{#snippet description()}
			<p>Raw image-space 2D pose at 30 frames per second, drawn over the participant video.</p>
			<p class="text-base-content/50 mt-1 font-mono text-xs break-all">{data.media.source_stem}</p>
		{/snippet}
		{#snippet actions()}
			<a
				class="daisy-btn daisy-btn-sm border-base-300 bg-base-100 hover:bg-base-200"
				href={resolve('/research/studies/media/[id]/[kind]', { id: data.media.id, kind: 'pose' })}
				download><ResearchIcon name="download" />Pose CSV</a
			>
		{/snippet}
	</ResearchHeader>

	<section class="daisy-card border-base-300 bg-base-100 overflow-hidden border">
		<div class="relative flex justify-center bg-neutral-900">
			<div class="relative w-full max-w-3xl">
				<!-- svelte-ignore a11y_media_has_caption: Source study recordings have no caption tracks. -->
				<video
					class="block max-h-[70dvh] w-full"
					bind:this={videoElement}
					controls
					preload="metadata"
					src={resolve('/research/studies/media/[id]/[kind]', { id: data.media.id, kind: 'video' })}
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
		</div>
		<div class="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
			<label class="flex cursor-pointer items-center gap-2">
				<input
					type="checkbox"
					class="daisy-toggle daisy-toggle-sm daisy-toggle-primary"
					bind:checked={showPose}
				/>
				Show raw pose
			</label>
			{#if poseError}
				<span class="text-error flex items-center gap-1.5" role="alert"
					><ResearchIcon name="triangle-alert" />{poseError}</span
				>
			{/if}
		</div>
	</section>
</main>
