<script lang="ts">
	import { resolve } from '$app/paths';
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

<main class="mx-auto max-w-7xl px-3 py-2 sm:px-4">
	<header class="mb-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
		<div>
			<a class="link link-primary text-xs" href={resolve('/research/records')}
				>← Research source records</a
			>
			<h1 class="text-lg leading-tight font-bold sm:text-xl">Rate pose-tracking usability</h1>
			<p class="text-xs opacity-70">
				CHI25 · {data.identity.study} · user {data.identity.userId} · {data.identity.dance} ·
				{data.identity.condition} · segment {data.identity.segmentNumber}
			</p>
		</div>
	</header>

	{#if data.recorded}<p class="daisy-alert daisy-alert-success mb-2 text-sm">
			Previous rating saved. Here is the next segment.
		</p>{/if}
	{#if form?.message}<p class="daisy-alert daisy-alert-error mb-2 text-sm">{form.message}</p>{/if}
	{#if !data.annotator}<p class="daisy-alert daisy-alert-warning mb-2 text-sm">
			Set RESEARCH_ANNOTATOR on the local server to enable saving.
		</p>{/if}

	<div class="grid items-start gap-2 md:grid-cols-[minmax(0,1fr)_minmax(18rem,23rem)] md:gap-4">
		<section class="min-w-0 space-y-2">
			<div class="rounded-box relative mx-auto w-fit max-w-full overflow-hidden bg-black">
				<video
					bind:this={videoElement}
					class="block h-auto max-h-[31dvh] w-auto max-w-full sm:max-h-[48dvh] md:max-h-[60dvh]"
					width={data.width}
					height={data.height}
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
			<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs sm:text-sm">
				<label class="flex min-h-8 cursor-pointer items-center gap-1.5">
					<input
						class="daisy-checkbox daisy-checkbox-xs"
						type="checkbox"
						bind:checked={showOverlay}
						onchange={drawOverlay}
					/> Skeleton overlay
				</label>
				<div class="flex min-h-8 items-center gap-1.5">
					<label for="playback-speed">Speed</label>
					<select
						id="playback-speed"
						class="daisy-select daisy-select-xs w-20"
						value={playbackRate}
						onchange={setPlaybackRate}
					>
						<option value="0.25">0.25×</option><option value="0.5">0.5×</option>
						<option value="1">1×</option><option value="1.5">1.5×</option>
					</select>
				</div>
			</div>
			{#if overlayError}<p class="daisy-alert daisy-alert-error text-sm">
					{overlayError} Do not rate until the pose overlay is available.
				</p>{/if}
		</section>

		<form method="POST" class="rounded-box border-base-300 border p-2 sm:p-3">
			<fieldset class="space-y-2" disabled={!data.annotator || !landmarks || !!overlayError}>
				<legend class="text-sm font-semibold">Overall tracking accuracy</legend>
				<div class="grid grid-cols-2 gap-1.5">
					{#each [{ value: 'unusable', label: 'Unusable', description: 'Exclude the whole video for pose tracking.' }, { value: 'marginal', label: 'Marginal', description: 'Usable only with substantial caveats.' }, { value: 'correctable', label: 'Correctable', description: 'Repair or discount localized problems.' }, { value: 'perfect', label: 'Perfect', description: 'No meaningful tracking-quality concerns.' }] as const as option (option.value)}
						<label
							class="border-base-300 has-[:checked]:border-primary has-[:checked]:bg-primary/10 rounded-box flex min-h-11 cursor-pointer items-center gap-2 border px-2 text-sm"
							title={option.description}
						>
							<input
								type="radio"
								name="rating"
								value={option.value}
								bind:group={rating}
								required
								class="daisy-radio daisy-radio-sm"
							/>
							<span>{option.label}<span class="sr-only">. {option.description}</span></span>
						</label>
					{/each}
				</div>
				<button
					class="daisy-btn daisy-btn-primary daisy-btn-sm w-full"
					type="submit"
					disabled={!rating}>Save rating and open next</button
				>
				<details class="text-xs">
					<summary class="cursor-pointer">Rating guide and optional note</summary>
					<p class="mt-1 opacity-70">
						Rate visible pose tracking, including missing poses and incorrect joints. The
						prior-study human similarity rating is hidden during review. {data.remaining} eligible segments
						remain.
					</p>
					<div class="mt-1 space-y-0.5 opacity-70">
						<p>Unusable: exclude the whole video.</p>
						<p>Marginal: usable with substantial caveats.</p>
						<p>Correctable: repair or discount localized problems.</p>
						<p>Perfect: no meaningful tracking concerns.</p>
					</div>
					<label class="mt-2 block" for="rating-note">Optional note</label>
					<textarea
						id="rating-note"
						name="note"
						class="daisy-textarea daisy-textarea-sm mt-1 w-full"
						rows="2"
						maxlength="2000"
						placeholder="Describe tracking errors or missing poses."
					></textarea>
				</details>
			</fieldset>
		</form>
	</div>
</main>
