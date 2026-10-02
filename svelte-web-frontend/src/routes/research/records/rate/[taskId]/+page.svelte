<script lang="ts">
	import { onMount } from 'svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData | null } = $props();
	type Point = [number | null, number | null] | null;
	type Landmarks = {
		frames: Array<Record<string, Point>>;
		pose_edges: Array<[string, string]>;
	};
	let videoElement: HTMLVideoElement | undefined = $state();
	let canvasElement: HTMLCanvasElement | undefined = $state();
	let landmarks = $state<Landmarks | null>(null);
	let overlayError = $state('');
	let showOverlay = $state(true);
	let playbackRate = $state('1');
	let rating = $state('');
	let animationFrame = 0;

	onMount(() => {
		let cancelled = false;
		void fetch(`/api/dev/research-review/${data.taskId}/landmarks`, { cache: 'no-store' })
			.then(async (response) => {
				if (!response.ok) throw new Error(`Pose overlay unavailable (${response.status}).`);
				return (await response.json()) as Landmarks;
			})
			.then((result) => {
				if (!cancelled) {
					landmarks = result;
					drawOverlay();
				}
			})
			.catch((caught: unknown) => {
				if (!cancelled)
					overlayError = caught instanceof Error ? caught.message : 'Pose overlay unavailable.';
			});
		return () => {
			cancelled = true;
			cancelAnimationFrame(animationFrame);
		};
	});

	function drawOverlay() {
		const canvas = canvasElement;
		const video = videoElement;
		if (!canvas || !video) return;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.clearRect(0, 0, canvas.width, canvas.height);
		if (!showOverlay || !landmarks) return;
		const frame =
			landmarks.frames[
				Math.min(landmarks.frames.length - 1, Math.max(0, Math.floor(video.currentTime * data.fps)))
			];
		if (!frame) return;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		for (const [first, second] of landmarks.pose_edges) {
			const from = frame[first];
			const to = frame[second];
			if (
				!from ||
				!to ||
				!Number.isFinite(from[0]) ||
				!Number.isFinite(from[1]) ||
				!Number.isFinite(to[0]) ||
				!Number.isFinite(to[1])
			)
				continue;
			ctx.beginPath();
			ctx.moveTo(from[0]!, from[1]!);
			ctx.lineTo(to[0]!, to[1]!);
			ctx.strokeStyle = '#101828';
			ctx.lineWidth = 5;
			ctx.stroke();
			ctx.strokeStyle = '#5eead4';
			ctx.lineWidth = 2.5;
			ctx.stroke();
		}
	}

	function drawWhilePlaying() {
		drawOverlay();
		if (videoElement && !videoElement.paused)
			animationFrame = requestAnimationFrame(drawWhilePlaying);
	}
	function startDrawing() {
		cancelAnimationFrame(animationFrame);
		animationFrame = requestAnimationFrame(drawWhilePlaying);
	}
	function stopDrawing() {
		cancelAnimationFrame(animationFrame);
		drawOverlay();
	}
	function setPlaybackRate(event: Event) {
		playbackRate = (event.currentTarget as HTMLSelectElement).value;
		if (videoElement) videoElement.playbackRate = Number(playbackRate);
	}
</script>

<svelte:head>
	<title>Rate video usability · {data.identity.dance} segment {data.identity.segmentNumber}</title>
	<meta
		name="description"
		content="Review pose tracking accuracy for one CHI25 participant segment."
	/>
</svelte:head>

<main class="mx-auto max-w-5xl space-y-5 px-4 py-6 lg:px-8">
	<header class="space-y-2">
		<a class="link link-primary text-sm" href="/research/records">← Research source records</a>
		<h1 class="text-2xl font-bold">Rate pose-tracking usability</h1>
		<p class="text-sm opacity-70">
			CHI25 · {data.identity.study} · user {data.identity.userId} · {data.identity.dance} ·
			{data.identity.condition} · segment {data.identity.segmentNumber}
		</p>
		<p class="text-sm opacity-70">
			This segment has a prior-study human similarity rating. Its value is hidden during this
			review. {data.remaining} eligible unrated segments remain.
		</p>
	</header>

	{#if data.recorded}<p class="daisy-alert daisy-alert-success">
			Previous rating saved. Here is the next segment.
		</p>{/if}
	{#if form?.message}<p class="daisy-alert daisy-alert-error">{form.message}</p>{/if}
	{#if !data.annotator}<p class="daisy-alert daisy-alert-warning">
			Set RESEARCH_ANNOTATOR on the local server to enable saving.
		</p>{/if}

	<section class="space-y-3">
		<div
			class="rounded-box relative mx-auto w-full max-w-3xl overflow-hidden bg-black"
			style={`aspect-ratio: ${data.width} / ${data.height};`}
		>
			<video
				bind:this={videoElement}
				class="absolute inset-0 h-full w-full object-contain"
				src={`/api/dev/research-review/${data.taskId}/video`}
				controls
				playsinline
				preload="metadata"
				onplay={startDrawing}
				onpause={stopDrawing}
				ontimeupdate={drawOverlay}
				onseeked={drawOverlay}
				onloadedmetadata={drawOverlay}
			>
				<track kind="captions" />
			</video>
			<canvas
				bind:this={canvasElement}
				class="pointer-events-none absolute inset-0 h-full w-full"
				width={data.width}
				height={data.height}
				aria-hidden="true"
			></canvas>
		</div>
		<div class="flex flex-wrap items-center justify-between gap-3 text-sm">
			<label class="flex cursor-pointer items-center gap-2">
				<input
					class="daisy-checkbox daisy-checkbox-sm"
					type="checkbox"
					bind:checked={showOverlay}
					onchange={drawOverlay}
				/> Show raw pose overlay
			</label>
			<label class="flex items-center gap-2"
				>Playback speed
				<select
					class="daisy-select daisy-select-sm"
					value={playbackRate}
					onchange={setPlaybackRate}
				>
					<option value="0.25">0.25×</option><option value="0.5">0.5×</option>
					<option value="1">1×</option><option value="1.5">1.5×</option>
				</select>
			</label>
		</div>
		{#if overlayError}<p class="daisy-alert daisy-alert-error text-sm">
				{overlayError} Do not rate until the pose overlay is available.
			</p>{/if}
	</section>

	<form method="POST" class="rounded-box border-base-300 space-y-4 border p-4">
		<fieldset class="space-y-3" disabled={!data.annotator || !landmarks || !!overlayError}>
			<legend class="text-lg font-semibold">Overall visible pose-tracking accuracy</legend>
			<p class="text-sm opacity-70">
				Rate the tracking, including missing poses and incorrect joints. Motion similarity and video
				suitability for analysis are separate questions.
			</p>
			<div class="grid gap-2 sm:grid-cols-2">
				{#each [{ value: 'unusable', label: 'Unusable', description: 'Exclude the whole video for pose tracking.' }, { value: 'marginal', label: 'Marginal', description: 'Usable only with substantial caveats.' }, { value: 'correctable', label: 'Correctable', description: 'Repair or discount localized problems.' }, { value: 'perfect', label: 'Perfect', description: 'No meaningful tracking-quality concerns.' }] as const as option (option.value)}
					<label
						class="border-base-300 has-[:checked]:border-primary has-[:checked]:bg-primary/10 rounded-box flex cursor-pointer gap-3 border p-3"
					>
						<input
							type="radio"
							name="rating"
							value={option.value}
							bind:group={rating}
							required
							class="daisy-radio daisy-radio-sm mt-0.5"
						/>
						<span
							><strong>{option.label}</strong><span class="block text-sm opacity-70"
								>{option.description}</span
							></span
						>
					</label>
				{/each}
			</div>
			<label class="block space-y-1 text-sm"
				><span>Optional note</span>
				<textarea
					name="note"
					class="daisy-textarea daisy-textarea-bordered w-full"
					rows="3"
					maxlength="2000"
					placeholder="Describe tracking errors or missing poses; keep analysis suitability separate."
				></textarea>
			</label>
			<p class="text-xs opacity-60">
				Saving as {data.annotator}. Each new rating is stored with source hashes and a verified
				local database snapshot.
			</p>
			<button class="daisy-btn daisy-btn-primary" type="submit" disabled={!rating}
				>Save rating and open next</button
			>
		</fieldset>
	</form>
</main>
