<script lang="ts">
	type Revision = {
		revision_id: number;
		start_seconds: number;
		end_seconds: number;
		annotator: string;
		note: string;
		created_at: string;
	};
	let {
		dance,
		title,
		clipSpacingSeconds,
		videoAvailable,
		current,
		earlierCount,
		disabled,
		error
	}: {
		dance: string;
		title: string;
		clipSpacingSeconds: number;
		videoAvailable: boolean;
		current: Revision | null;
		earlierCount: number;
		disabled: boolean;
		error: string | null;
	} = $props();

	const FRAME = 1 / 30;
	let video = $state<HTMLVideoElement>();
	let time = $state(0);
	let duration = $state(0);
	// Editable draft values; they start from the saved mark when one exists.
	// svelte-ignore state_referenced_locally
	let start = $state(current ? current.start_seconds.toFixed(3) : '');
	// svelte-ignore state_referenced_locally
	let end = $state(current ? current.end_seconds.toFixed(3) : '');
	let note = $state('');

	const clips = $derived(
		duration > 0
			? Array.from({ length: Math.ceil(duration / clipSpacingSeconds) }, (_, index) => ({
					number: index + 1,
					from: index * clipSpacingSeconds,
					to: Math.min((index + 1) * clipSpacingSeconds, duration)
				}))
			: []
	);
	const startValue = $derived(start === '' ? NaN : Number(start));
	const endValue = $derived(end === '' ? NaN : Number(end));
	const valid = $derived(
		Number.isFinite(startValue) &&
			Number.isFinite(endValue) &&
			startValue >= 0 &&
			endValue > startValue &&
			duration > 0 &&
			endValue <= duration + 0.05
	);

	function seek(seconds: number) {
		if (!video || !Number.isFinite(seconds)) return;
		video.pause();
		const target = Math.min(Math.max(seconds, 0), duration || seconds);
		video.currentTime = target;
		time = target;
	}
	// Position (0–100 %) of a time on the scrub bar, for the start/end overlay.
	function percent(seconds: number) {
		return duration > 0 ? Math.min(Math.max(seconds / duration, 0), 1) * 100 : 0;
	}
	const hasStart = $derived(Number.isFinite(startValue) && duration > 0);
	const hasEnd = $derived(Number.isFinite(endValue) && duration > 0);
	function step(delta: number) {
		if (video) seek(video.currentTime + delta);
	}
	function now() {
		return (video?.currentTime ?? time).toFixed(3);
	}
	function excluded(clip: { from: number; to: number }) {
		if (!valid) return 0;
		const before = Math.max(0, Math.min(clip.to, startValue) - clip.from);
		const after = Math.max(0, clip.to - Math.max(clip.from, endValue));
		return before + after;
	}
</script>

<section
	id={dance}
	class="rounded-box border-base-300 scroll-mt-6 space-y-4 border p-5"
	aria-labelledby="{dance}-heading"
>
	<div class="flex flex-wrap items-baseline justify-between gap-2">
		<h2 id="{dance}-heading" class="text-xl font-semibold">{title}</h2>
		{#if current}
			<p class="text-sm">
				Saved: dance from <strong>{current.start_seconds.toFixed(3)} s</strong> to
				<strong>{current.end_seconds.toFixed(3)} s</strong>
				<span class="opacity-60"
					>· {current.annotator} ·
					<time datetime={current.created_at}>{current.created_at}</time>{earlierCount
						? ` · ${earlierCount} earlier mark${earlierCount > 1 ? 's' : ''} kept`
						: ''}</span
				>
			</p>
		{:else}
			<p class="text-sm opacity-60">Not marked yet</p>
		{/if}
	</div>
	{#if error}<p class="daisy-alert daisy-alert-error text-sm">{error}</p>{/if}

	{#if !videoAvailable}
		<p class="daisy-alert daisy-alert-warning text-sm">
			<span>
				The reference video is not staged locally. Start the server with
				<code class="break-all">MOTION_PIPELINE_REFERENCE_VIDEO_DIR</code> pointing at the folder
				that holds the CHI study reference videos (<code>chi-studyvideos</code>), then reload.
			</span>
		</p>
	{:else}
		<div class="grid gap-5 md:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
			<!-- svelte-ignore a11y_media_has_caption -->
			<video
				bind:this={video}
				bind:currentTime={time}
				bind:duration
				onseeked={() => video && (time = video.currentTime)}
				class="bg-base-300 max-h-[70vh] w-full rounded"
				src="/api/dev/reference-clips/{dance}/video"
				controls
				preload="metadata"
				playsinline
			></video>
			<div class="space-y-4">
				<div class="flex flex-wrap items-center gap-2">
					<span class="font-mono text-lg tabular-nums" aria-live="off">{time.toFixed(3)} s</span>
					<span class="text-sm opacity-60">of {duration ? duration.toFixed(3) : '…'} s</span>
				</div>
				<div class="space-y-1">
					<label class="text-sm font-medium" for="{dance}-scrub">Scrub through the video</label>
					<input
						id="{dance}-scrub"
						type="range"
						class="daisy-range daisy-range-sm w-full"
						min="0"
						max={duration || 0}
						step={FRAME}
						value={time}
						disabled={!duration}
						aria-valuetext="{time.toFixed(3)} seconds"
						oninput={(event) => seek(Number(event.currentTarget.value))}
					/>
					<!-- Draft start/end marks on the same timeline as the scrub bar. -->
					<div class="bg-base-300 relative h-2 rounded" aria-hidden="true">
						{#if hasStart && hasEnd && endValue > startValue}
							<div
								class="bg-primary/40 absolute inset-y-0"
								style:left="{percent(startValue)}%"
								style:width="{percent(endValue) - percent(startValue)}%"
							></div>
						{/if}
						{#if hasStart}
							<div
								class="bg-primary absolute -inset-y-1 w-0.5"
								style:left="{percent(startValue)}%"
							></div>
						{/if}
						{#if hasEnd}
							<div
								class="bg-primary absolute -inset-y-1 w-0.5"
								style:left="{percent(endValue)}%"
							></div>
						{/if}
					</div>
					<p class="text-xs opacity-60">
						Drag the slider, or click it and use the arrow keys to move one frame at a time.
					</p>
				</div>
				<div class="flex flex-wrap gap-2">
					<button type="button" class="daisy-btn daisy-btn-sm" onclick={() => step(-0.5)}
						>−0.5 s</button
					>
					<button type="button" class="daisy-btn daisy-btn-sm" onclick={() => step(-FRAME)}
						>−1 frame</button
					>
					<button type="button" class="daisy-btn daisy-btn-sm" onclick={() => step(FRAME)}
						>+1 frame</button
					>
					<button type="button" class="daisy-btn daisy-btn-sm" onclick={() => step(0.5)}
						>+0.5 s</button
					>
				</div>
				<div class="flex flex-wrap gap-2">
					<button
						type="button"
						class="daisy-btn daisy-btn-primary daisy-btn-sm"
						onclick={() => (start = now())}>Dance starts here</button
					>
					<button
						type="button"
						class="daisy-btn daisy-btn-primary daisy-btn-sm"
						onclick={() => (end = now())}>Dance ends here</button
					>
				</div>

				<form method="POST" class="space-y-3">
					<input type="hidden" name="dance" value={dance} />
					<input type="hidden" name="duration" value={duration} />
					<div class="grid grid-cols-2 gap-3">
						<label class="daisy-form-control">
							<span class="text-sm font-medium">Dance start (s)</span>
							<span class="flex gap-1">
								<input
									class="daisy-input daisy-input-bordered daisy-input-sm w-full font-mono"
									name="start"
									inputmode="decimal"
									bind:value={start}
									required
								/>
								<button
									type="button"
									class="daisy-btn daisy-btn-ghost daisy-btn-sm"
									aria-label="Go to dance start"
									onclick={() => seek(startValue)}>Go</button
								>
							</span>
						</label>
						<label class="daisy-form-control">
							<span class="text-sm font-medium">Dance end (s)</span>
							<span class="flex gap-1">
								<input
									class="daisy-input daisy-input-bordered daisy-input-sm w-full font-mono"
									name="end"
									inputmode="decimal"
									bind:value={end}
									required
								/>
								<button
									type="button"
									class="daisy-btn daisy-btn-ghost daisy-btn-sm"
									aria-label="Go to dance end"
									onclick={() => seek(endValue)}>Go</button
								>
							</span>
						</label>
					</div>
					<label class="daisy-form-control block">
						<span class="text-sm font-medium">Note (optional)</span>
						<textarea
							class="daisy-textarea daisy-textarea-bordered w-full text-sm"
							name="note"
							rows="2"
							maxlength="2000"
							bind:value={note}
							placeholder="For example: waits for the beat, then steps back from the camera."
						></textarea>
					</label>
					<button class="daisy-btn daisy-btn-primary" type="submit" disabled={disabled || !valid}
						>{current ? 'Save new mark' : 'Save mark'}</button
					>
				</form>

				{#if clips.length}
					<div class="overflow-x-auto">
						<table class="daisy-table daisy-table-xs">
							<caption class="text-left text-xs opacity-70"
								>Legacy reference segment clips (clip spacing {clipSpacingSeconds} s). Excluded time reflects
								the draft above.</caption
							>
							<thead
								><tr><th>Segment</th><th>Video time</th><th>Excluded lead-in/out</th></tr></thead
							>
							<tbody>
								{#each clips as clip (clip.number)}
									<tr>
										<td>{clip.number}</td>
										<td class="font-mono">{clip.from.toFixed(2)}–{clip.to.toFixed(2)} s</td>
										<td class="font-mono">{valid ? `${excluded(clip).toFixed(2)} s` : '—'}</td>
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</section>
