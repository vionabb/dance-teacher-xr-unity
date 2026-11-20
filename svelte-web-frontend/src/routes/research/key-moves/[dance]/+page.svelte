<script lang="ts">
	import { resolve } from '$app/paths';
	import { onMount } from 'svelte';
	import SpanTimeline from '$lib/elements/SpanTimeline.svelte';
	import {
		KEY_MOVE_LIMITS,
		clipAtFrame,
		clipsForMove,
		draftProblem,
		frameToSeekTime,
		freeRange,
		slugTrackId,
		sortedMoves,
		spanSeconds,
		timeToFrame,
		type KeyMove,
		type KeyMoveTrack
	} from '$lib/research/key-moves';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Editing starts from the loaded revision; links between dances go through the index page.
	const loaded = () => ({ revision: data.revision, defaultTracks: data.defaultTracks });
	const initial = loaded().revision;
	let tracks = $state<KeyMoveTrack[]>(
		structuredClone(initial?.tracks ?? loaded().defaultTracks) as KeyMoveTrack[]
	);
	let moves = $state<KeyMove[]>(structuredClone(initial?.moves ?? []) as KeyMove[]);
	let baseRevisionId = $state<number | null>(initial?.id ?? null);
	let savedAt = $state<string | null>(initial?.createdAt ?? null);
	let selectedId = $state<string | null>(null);
	let currentFrame = $state(0);
	let playing = $state(false);
	let playbackRate = $state('1');
	let mirrored = $state(false);
	let newTrackLabel = $state('');
	let panelTab = $state<'move' | 'moves' | 'tracks'>('move');
	let videoElement: HTMLVideoElement | undefined = $state();
	let videoError = $state('');

	type SaveState = 'saved' | 'pending' | 'saving' | 'failed' | 'conflict';
	let saveState = $state<SaveState>('saved');
	let saveMessage = $state('');
	let dirtyVersion = 0;
	let savedVersion = 0;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let inFlight: Promise<void> | null = null;
	let retryMutationId: string | null = null;

	const fps = $derived(data.fps);
	const frameCount = $derived(data.frameCount);
	const selected = $derived(moves.find((move) => move.id === selectedId) ?? null);
	const ordered = $derived(sortedMoves(moves));
	const markers = $derived(
		data.clips.map((clip) => ({
			frame: Math.round(clip.startSeconds * fps),
			label: `Clip ${clip.clipNumber}`
		}))
	);
	const currentClip = $derived(clipAtFrame(currentFrame, fps, data.clips));
	const problem = $derived(draftProblem({ tracks, moves }, frameCount));

	onMount(() => {
		try {
			mirrored = localStorage.getItem('key-moves:mirrored') === '1';
		} catch {
			/* storage unavailable */
		}
		const warn = (event: BeforeUnloadEvent) => {
			if (saveState !== 'saved') event.preventDefault();
		};
		window.addEventListener('beforeunload', warn);
		return () => {
			window.removeEventListener('beforeunload', warn);
			clearTimeout(saveTimer);
		};
	});

	function setMirrored(value: boolean) {
		mirrored = value;
		try {
			localStorage.setItem('key-moves:mirrored', value ? '1' : '0');
		} catch {
			/* storage unavailable */
		}
	}

	// ---- video ----
	function seek(frame: number) {
		const f = Math.min(Math.max(Math.round(frame), 0), frameCount - 1);
		currentFrame = f;
		if (videoElement) {
			if (!videoElement.paused) videoElement.pause();
			videoElement.currentTime = frameToSeekTime(f, fps);
		}
	}
	function syncFrame() {
		if (videoElement) currentFrame = timeToFrame(videoElement.currentTime, fps, frameCount);
	}
	let stopAtFrame: number | null = null;
	function tick() {
		if (!videoElement || videoElement.paused) return;
		syncFrame();
		if (stopAtFrame !== null && currentFrame >= stopAtFrame) {
			videoElement.pause();
			seek(stopAtFrame);
			stopAtFrame = null;
			return;
		}
		requestAnimationFrame(tick);
	}
	function togglePlay() {
		if (!videoElement) return;
		if (videoElement.paused) {
			stopAtFrame = null;
			if (currentFrame >= frameCount - 1) seek(0);
			void videoElement.play();
		} else videoElement.pause();
	}
	function playMove(move: KeyMove) {
		if (!videoElement) return;
		seek(move.startFrame);
		stopAtFrame = move.endFrame;
		void videoElement.play();
	}
	function setRate(value: string) {
		playbackRate = value;
		if (videoElement) videoElement.playbackRate = Number(value);
	}
	function onKey(event: KeyboardEvent) {
		const target = event.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [role="slider"]')) return;
		if (event.key === ' ') {
			event.preventDefault();
			togglePlay();
		} else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
			event.preventDefault();
			seek(currentFrame + (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1));
		}
	}

	// ---- editing ----
	function changed() {
		dirtyVersion++;
		if (saveState === 'conflict') return;
		saveState = 'pending';
		saveMessage = '';
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => void save(), 1200);
	}
	function limits(trackId: string, frame: number, ignoreId: string | undefined = undefined) {
		return freeRange(moves, trackId, frame, frameCount, ignoreId);
	}
	function createMove(trackId: string, startFrame: number, endFrame: number) {
		const id = crypto.randomUUID();
		moves.push({
			id,
			trackId,
			startFrame,
			endFrame,
			name: '',
			description: '',
			viewMirrored: mirrored
		});
		selectedId = id;
		return id;
	}
	function spanChange(id: string, startFrame: number, endFrame: number) {
		const move = moves.find((m) => m.id === id);
		if (!move) return;
		move.startFrame = startFrame;
		move.endFrame = endFrame;
	}
	function addMoveAtPlayhead() {
		for (const track of tracks) {
			const free = limits(track.id, currentFrame);
			if (!free) continue;
			const end = Math.min(currentFrame + Math.round(fps) - 1, free.hi);
			createMove(track.id, currentFrame, end);
			changed();
			return;
		}
		saveMessage = 'Every track already has a move at this frame. Add a track first.';
	}
	function setEdge(edge: 'start' | 'end') {
		if (!selected) return;
		const free = limits(selected.trackId, selected.startFrame, selected.id) ?? {
			lo: 0,
			hi: frameCount - 1
		};
		if (edge === 'start') {
			const start = Math.max(currentFrame, free.lo);
			if (start > selected.endFrame) selected.endFrame = Math.min(start, free.hi);
			selected.startFrame = Math.min(start, selected.endFrame);
		} else {
			const end = Math.min(currentFrame, free.hi);
			if (end < selected.startFrame) selected.startFrame = Math.max(end, free.lo);
			selected.endFrame = Math.max(end, selected.startFrame);
		}
		changed();
	}
	function moveToTrack(move: KeyMove, trackId: string) {
		const clash = moves.some(
			(other) =>
				other.id !== move.id &&
				other.trackId === trackId &&
				other.startFrame <= move.endFrame &&
				move.startFrame <= other.endFrame
		);
		if (clash) {
			saveMessage = 'That track already has a move at this time.';
			return;
		}
		move.trackId = trackId;
		changed();
	}
	function deleteMove(id: string) {
		moves = moves.filter((move) => move.id !== id);
		if (selectedId === id) selectedId = null;
		changed();
	}
	function addTrack() {
		const label = newTrackLabel.trim().slice(0, KEY_MOVE_LIMITS.trackLabel);
		if (!label || tracks.length >= KEY_MOVE_LIMITS.tracks) return;
		tracks.push({
			id: slugTrackId(
				label,
				tracks.map((t) => t.id)
			),
			label
		});
		newTrackLabel = '';
		changed();
	}
	function removeTrack(id: string) {
		if (tracks.length <= 1 || moves.some((move) => move.trackId === id)) return;
		tracks = tracks.filter((track) => track.id !== id);
		changed();
	}
	function describe(move: KeyMove) {
		move.viewMirrored = mirrored;
		changed();
	}

	// ---- saving ----
	async function save(): Promise<void> {
		clearTimeout(saveTimer);
		if (inFlight) {
			await inFlight;
			if (dirtyVersion !== savedVersion && saveState === 'pending') return save();
			return;
		}
		if (dirtyVersion === savedVersion || saveState === 'conflict') return;
		if (problem) {
			saveState = 'failed';
			saveMessage = problem;
			return;
		}
		const version = dirtyVersion;
		const mutationId = retryMutationId ?? crypto.randomUUID();
		retryMutationId = mutationId;
		saveState = 'saving';
		const body = JSON.stringify({
			mutationId,
			baseRevisionId,
			videoMaterialId: data.videoMaterialId,
			tracks: $state.snapshot(tracks),
			moves: $state.snapshot(moves)
		});
		inFlight = (async () => {
			try {
				const response = await fetch(`/api/research/key-moves/${encodeURIComponent(data.dance)}`, {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body
				});
				if (!response.ok) {
					const detail = await response.json().catch(() => null);
					retryMutationId = null;
					saveState = response.status === 409 ? 'conflict' : 'failed';
					saveMessage = detail?.message ?? `Saving failed (${response.status}).`;
					return;
				}
				const receipt = (await response.json()) as { id: number; createdAt: string };
				retryMutationId = null;
				baseRevisionId = receipt.id;
				savedAt = receipt.createdAt;
				savedVersion = version;
				saveState = dirtyVersion === version ? 'saved' : 'pending';
				saveMessage = '';
			} catch {
				// Keep the mutation id so a retry cannot create a duplicate revision.
				saveState = 'failed';
				saveMessage = 'Network error. Your changes are still here.';
			}
		})();
		await inFlight;
		inFlight = null;
		if ((saveState as SaveState) === 'pending') saveTimer = setTimeout(() => void save(), 300);
	}

	const seconds = (frame: number) => (frame / fps).toFixed(2);
	const savedLabel = $derived(
		savedAt
			? new Date(savedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
			: null
	);
</script>

<svelte:head>
	<title>Key moves · {data.label}</title>
	<meta name="robots" content="noindex, nofollow" />
</svelte:head>

<svelte:window onkeydown={onKey} />

<main class="mx-auto max-w-7xl space-y-3 px-3 py-3 sm:px-4">
	<header class="flex flex-wrap items-end justify-between gap-2">
		<div>
			<a class="daisy-link daisy-link-primary text-xs" href={resolve('/research/key-moves')}
				>← All reference dances</a
			>
			<h1 class="text-xl font-bold">Key moves · {data.label}</h1>
			<p class="text-xs opacity-70">
				{data.videoLabel} · {frameCount} frames at {fps} fps · {data.clips.length} clips
			</p>
		</div>
		<div class="text-right text-sm" role="status" aria-live="polite">
			{#if !data.canEdit}
				<span class="daisy-badge daisy-badge-ghost">Read-only: editor access needed</span>
			{:else if saveState === 'saved'}
				<span class="text-success"
					>{savedLabel ? `✓ Saved ${savedLabel}` : 'Nothing marked yet'}</span
				>
			{:else if saveState === 'pending' || saveState === 'saving'}
				<span class="opacity-70">Saving…</span>
			{:else}
				<span class="text-error"
					>{saveState === 'conflict' ? 'Not saved: conflict' : 'Not saved'}</span
				>
			{/if}
		</div>
	</header>

	{#if saveMessage}
		<div
			class={[
				'daisy-alert py-2 text-sm',
				saveState === 'failed' || saveState === 'conflict'
					? 'daisy-alert-error'
					: 'daisy-alert-warning'
			]}
		>
			<span>{saveMessage}</span>
			{#if saveState === 'failed'}
				<button type="button" class="daisy-btn daisy-btn-sm" onclick={() => void save()}
					>Retry</button
				>
			{:else if saveState === 'conflict'}
				<button type="button" class="daisy-btn daisy-btn-sm" onclick={() => location.reload()}
					>Reload</button
				>
			{/if}
		</div>
	{/if}

	<div class="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem]">
		<section class="min-w-0 space-y-2" aria-label="Reference video and timeline">
			<div class="rounded-box mx-auto w-fit max-w-full overflow-hidden bg-black">
				<!-- svelte-ignore a11y_media_has_caption -->
				<video
					bind:this={videoElement}
					class="block h-auto max-h-[42dvh] w-auto max-w-full sm:max-h-[52dvh]"
					style:transform={mirrored ? 'scaleX(-1)' : undefined}
					src={data.videoUrl}
					playsinline
					preload="auto"
					onplay={() => {
						playing = true;
						requestAnimationFrame(tick);
					}}
					onpause={() => {
						playing = false;
						syncFrame();
					}}
					onseeked={syncFrame}
					onloadedmetadata={() => {
						if (videoElement) videoElement.playbackRate = Number(playbackRate);
						seek(currentFrame);
					}}
					onerror={() => (videoError = 'The reference video could not load. Reload the page.')}
					aria-label={`${data.label} reference video`}
				></video>
			</div>
			{#if videoError}<p class="daisy-alert daisy-alert-error py-2 text-sm">{videoError}</p>{/if}

			<div class="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
				<div class="daisy-join">
					<button
						type="button"
						class="daisy-join-item daisy-btn daisy-btn-sm"
						aria-label="Back 10 frames"
						onclick={() => seek(currentFrame - 10)}>«</button
					>
					<button
						type="button"
						class="daisy-join-item daisy-btn daisy-btn-sm"
						aria-label="Previous frame"
						onclick={() => seek(currentFrame - 1)}>‹</button
					>
					<button
						type="button"
						class="daisy-join-item daisy-btn daisy-btn-sm daisy-btn-primary w-16"
						onclick={togglePlay}>{playing ? 'Pause' : 'Play'}</button
					>
					<button
						type="button"
						class="daisy-join-item daisy-btn daisy-btn-sm"
						aria-label="Next frame"
						onclick={() => seek(currentFrame + 1)}>›</button
					>
					<button
						type="button"
						class="daisy-join-item daisy-btn daisy-btn-sm"
						aria-label="Forward 10 frames"
						onclick={() => seek(currentFrame + 10)}>»</button
					>
				</div>
				<span class="font-mono text-xs tabular-nums">
					frame {currentFrame} · {seconds(currentFrame)} s{currentClip !== null
						? ` · clip ${currentClip}`
						: ''}
				</span>
				<label class="flex items-center gap-1.5 text-xs">
					Speed
					<select
						class="daisy-select daisy-select-xs w-20"
						value={playbackRate}
						onchange={(event) => setRate(event.currentTarget.value)}
					>
						<option value="0.25">0.25×</option>
						<option value="0.5">0.5×</option>
						<option value="1">1×</option>
					</select>
				</label>
				<label class="flex items-center gap-1.5 text-xs">
					<input
						type="checkbox"
						class="daisy-toggle daisy-toggle-xs"
						checked={mirrored}
						onchange={(event) => setMirrored(event.currentTarget.checked)}
					/>
					Mirror video
				</label>
			</div>

			<SpanTimeline
				{frameCount}
				{currentFrame}
				{tracks}
				spans={moves.map((move) => ({
					id: move.id,
					trackId: move.trackId,
					startFrame: move.startFrame,
					endFrame: move.endFrame,
					label: move.name,
					incomplete: !move.name.trim() && !move.description.trim()
				}))}
				{markers}
				{selectedId}
				editable={data.canEdit}
				defaultLength={Math.round(fps)}
				{limits}
				onseek={seek}
				oncreate={createMove}
				onspanchange={spanChange}
				oncommit={changed}
				onselect={(id) => {
					selectedId = id;
					if (id) panelTab = 'move';
				}}
			/>
			<p class="text-xs opacity-70">
				Drag on a track to insert a move; drag its edges to adjust, or its middle to shift it. Tap a
				move to describe it. Space plays or pauses; ← → step one frame (Shift: ten). Yellow moves
				have no description yet.
			</p>

			{#if data.canEdit}
				<div class="flex flex-wrap items-center gap-2">
					<button type="button" class="daisy-btn daisy-btn-sm" onclick={addMoveAtPlayhead}
						>+ Move at playhead</button
					>
				</div>
			{/if}
		</section>

		<aside
			class="daisy-card daisy-card-border border-base-300 bg-base-100 shadow-sm lg:sticky lg:top-3"
		>
			<div role="tablist" class="daisy-tabs daisy-tabs-border border-base-300 border-b px-2">
				{#each [{ id: 'move', label: 'Move' }, { id: 'moves', label: `All moves (${ordered.length})` }, { id: 'tracks', label: `Tracks (${tracks.length})` }] as const as tab (tab.id)}
					<button
						type="button"
						role="tab"
						class={['daisy-tab', panelTab === tab.id && 'daisy-tab-active']}
						aria-selected={panelTab === tab.id}
						onclick={() => (panelTab = tab.id)}>{tab.label}</button
					>
				{/each}
			</div>

			{#if panelTab === 'move'}
				<div class="daisy-card-body gap-3 p-4" role="tabpanel" aria-label="Selected move">
					{#if selected}
						{@const span = spanSeconds(selected, fps)}
						<div class="flex flex-wrap items-center gap-1.5">
							<span class="daisy-badge daisy-badge-primary daisy-badge-sm"
								>Clip {clipsForMove(selected, fps, data.clips).join(', ') || '–'}</span
							>
							<span
								class="daisy-badge daisy-badge-ghost daisy-badge-sm font-mono tabular-nums"
								title={`Frames ${selected.startFrame}–${selected.endFrame}`}
								>{span.start.toFixed(2)}–{span.end.toFixed(2)} s</span
							>
							<span class="daisy-badge daisy-badge-ghost daisy-badge-sm tabular-nums"
								>{(span.end - span.start).toFixed(1)} s long</span
							>
						</div>
						<fieldset class="daisy-fieldset py-0" disabled={!data.canEdit}>
							<legend class="daisy-fieldset-legend pt-0">Short name</legend>
							<input
								id="move-name"
								class="daisy-input w-full"
								maxlength={KEY_MOVE_LIMITS.name}
								placeholder="e.g. lasso arm"
								bind:value={selected.name}
								oninput={() => describe(selected!)}
							/>
						</fieldset>
						<fieldset class="daisy-fieldset py-0" disabled={!data.canEdit}>
							<legend class="daisy-fieldset-legend pt-0">What makes it recognizable</legend>
							<textarea
								id="move-description"
								class="daisy-textarea h-32 w-full"
								maxlength={KEY_MOVE_LIMITS.description}
								placeholder="Describe the move in your own words."
								bind:value={selected.description}
								oninput={() => describe(selected!)}
							></textarea>
							<p class="daisy-label text-wrap">
								Left and right as seen on screen ({selected.viewMirrored
									? 'mirrored'
									: 'not mirrored'}).
							</p>
						</fieldset>
						<fieldset class="daisy-fieldset py-0" disabled={!data.canEdit}>
							<legend class="daisy-fieldset-legend pt-0">Timing</legend>
							<div class="daisy-join w-full">
								<button
									type="button"
									class="daisy-join-item daisy-btn daisy-btn-sm flex-1"
									onclick={() => setEdge('start')}>Start here</button
								>
								<button
									type="button"
									class="daisy-join-item daisy-btn daisy-btn-sm daisy-btn-primary flex-1"
									onclick={() => playMove(selected!)}>▶ Play</button
								>
								<button
									type="button"
									class="daisy-join-item daisy-btn daisy-btn-sm flex-1"
									onclick={() => setEdge('end')}>End here</button
								>
							</div>
							{#if tracks.length > 1}
								<select
									class="daisy-select daisy-select-sm mt-1 w-full"
									aria-label="Track"
									value={selected.trackId}
									onchange={(event) => moveToTrack(selected!, event.currentTarget.value)}
								>
									{#each tracks as track (track.id)}
										<option value={track.id}>Track: {track.label}</option>
									{/each}
								</select>
							{/if}
						</fieldset>
						{#if data.canEdit}
							<div class="daisy-card-actions justify-end">
								<button
									type="button"
									class="daisy-btn daisy-btn-ghost daisy-btn-sm text-error"
									onclick={() => deleteMove(selected!.id)}>Delete move</button
								>
							</div>
						{/if}
					{:else}
						<div class="py-8 text-center text-sm opacity-70">
							<p class="font-semibold">No move selected</p>
							<p>Drag on a track to insert one, or pick one from All moves.</p>
						</div>
					{/if}
				</div>
			{:else if panelTab === 'moves'}
				<div role="tabpanel" aria-label="All moves">
					{#if ordered.length}
						<ul class="daisy-list max-h-[60dvh] overflow-y-auto">
							{#each ordered as move (move.id)}
								<li>
									<button
										type="button"
										class={[
											'daisy-list-row w-full items-start px-4 py-3 text-left',
											move.id === selectedId ? 'bg-primary/10' : 'hover:bg-base-200/60'
										]}
										aria-current={move.id === selectedId}
										onclick={() => {
											selectedId = move.id;
											panelTab = 'move';
											seek(move.startFrame);
										}}
									>
										<span
											class="daisy-badge daisy-badge-ghost daisy-badge-sm font-mono tabular-nums"
											>{seconds(move.startFrame)} s</span
										>
										<span class="daisy-list-col-grow min-w-0">
											<span class="block font-semibold">{move.name || 'Untitled move'}</span>
											{#if move.description}
												<span class="line-clamp-2 text-xs opacity-70">{move.description}</span>
											{:else}
												<span class="daisy-badge daisy-badge-warning daisy-badge-xs"
													>No description</span
												>
											{/if}
										</span>
										<span class="text-xs whitespace-nowrap opacity-60"
											>Clip {clipsForMove(move, fps, data.clips).join(', ')}</span
										>
									</button>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="p-8 text-center text-sm opacity-70">No moves yet.</p>
					{/if}
				</div>
			{:else}
				<div class="daisy-card-body gap-2 p-4" role="tabpanel" aria-label="Tracks">
					<p class="text-xs opacity-70">
						Moves on one track cannot overlap. Put moves that happen at the same time on separate
						tracks.
					</p>
					<ul class="daisy-list">
						{#each tracks as track (track.id)}
							<li class="daisy-list-row items-center px-0 py-2">
								<input
									class="daisy-input daisy-input-sm daisy-list-col-grow w-full"
									aria-label="Track name"
									maxlength={KEY_MOVE_LIMITS.trackLabel}
									disabled={!data.canEdit}
									bind:value={track.label}
									oninput={changed}
								/>
								<span class="text-xs opacity-60"
									>{moves.filter((move) => move.trackId === track.id).length}
									{moves.filter((move) => move.trackId === track.id).length === 1
										? 'move'
										: 'moves'}</span
								>
								{#if data.canEdit}
									<button
										type="button"
										class="daisy-btn daisy-btn-ghost daisy-btn-xs"
										disabled={tracks.length <= 1 || moves.some((move) => move.trackId === track.id)}
										title="Only empty tracks can be removed"
										onclick={() => removeTrack(track.id)}>Remove</button
									>
								{/if}
							</li>
						{/each}
					</ul>
					{#if data.canEdit}
						<form
							class="daisy-join w-full"
							onsubmit={(event) => {
								event.preventDefault();
								addTrack();
							}}
						>
							<input
								class="daisy-join-item daisy-input daisy-input-sm flex-1"
								placeholder="New track name"
								aria-label="New track name"
								maxlength={KEY_MOVE_LIMITS.trackLabel}
								bind:value={newTrackLabel}
							/>
							<button
								type="submit"
								class="daisy-join-item daisy-btn daisy-btn-sm daisy-btn-primary"
								disabled={!newTrackLabel.trim() || tracks.length >= KEY_MOVE_LIMITS.tracks}
								>Add track</button
							>
						</form>
					{/if}
				</div>
			{/if}
		</aside>
	</div>
</main>
