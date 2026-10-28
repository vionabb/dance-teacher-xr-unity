<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { observationTags, discrepancyDirections } from '$lib/research/discrepancy';
	import {
		discrepancyDraftKey,
		prepareObservationMutation,
		readPendingObservation,
		researchApiPrefix,
		type DiscrepancyReviewData,
		type ResearchBackend,
		type PendingObservation
	} from '$lib/research/discrepancy-client';
	type Destination = DiscrepancyReviewData['navigation']['next'];
	let {
		segmentId,
		researchBackend = 'local',
		metric,
		localTime,
		duration,
		context,
		samples,
		onseek,
		onpreview,
		onpause,
		onrate,
		onrangechange,
		playing,
		playbackRate
	}: {
		segmentId: string;
		researchBackend?: ResearchBackend;
		metric: 'qijia2d' | 'viona2d';
		localTime: number;
		duration: number;
		context: Record<string, unknown>;
		samples: Array<{ time: number; value: number | null }>;
		onseek: (time: number) => void;
		onpreview: (start: number, end: number, loop: boolean) => void;
		onpause: () => void;
		onrate: (rate: number) => void;
		onrangechange: (start: number, end: number) => void;
		playing: boolean;
		playbackRate: number;
	} = $props();
	let review = $state<DiscrepancyReviewData | null>(null);
	let loadError = $state('');
	let message = $state('');
	let messageKind = $state<'success' | 'error' | 'warning'>('success');
	let saving = $state(false);
	let start = $state(0);
	let end = $state(0);
	let note = $state('');
	let direction = $state('Uncertain');
	let tags = $state<string[]>([]);
	let loop = $state(false);
	let draftMessage = $state('');
	let savedOpen = $state(false);
	let noteElement: HTMLTextAreaElement | undefined;
	function captureNote(node: HTMLTextAreaElement) {
		noteElement = node;
		return () => {
			noteElement = undefined;
		};
	}
	let shortcuts = $state(true);
	const labels: Record<string, string> = {
		'Metric seems too harsh': 'Metric too harsh',
		'Metric seems too generous': 'Metric too generous',
		'Agreement / comparison': 'Seems aligned',
		Uncertain: 'Not sure yet'
	};
	let pendingMutation: PendingObservation | null = null;
	const endpoint = $derived(`${researchApiPrefix(researchBackend)}/discrepancy/${segmentId}`);
	const draftKey = $derived(
		review ? discrepancyDraftKey(researchBackend, segmentId, review) : null
	);
	const mayAnnotate = $derived(
		!!review &&
			(researchBackend === 'hosted'
				? review.backend === 'hosted' && review.canAnnotate === true && !!draftKey
				: !!review.annotator)
	);
	const selectedSamples = $derived(
		samples.filter((point) => point.time >= start && point.time <= end)
	);
	const validSamples = $derived(
		selectedSamples.filter(
			(point): point is { time: number; value: number } =>
				point.value !== null && Number.isFinite(point.value)
		)
	);
	const mean = $derived(
		validSamples.length
			? validSamples.reduce((sum, point) => sum + point.value, 0) / validSamples.length
			: null
	);
	const invalid = $derived(
		!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end > duration
	);
	const canSave = $derived(mayAnnotate && !invalid && !!note.trim() && !saving);
	const wholeSegment = $derived(start === 0 && Math.abs(end - duration) < 0.002);
	const selectedLength = $derived(Math.max(0, end - start));
	function formatTime(time: number) {
		return Number.isFinite(time) ? `${time.toFixed(2)}s` : '—';
	}
	onMount(() => {
		const controller = new AbortController();
		end = duration;
		onrangechange(start, end);
		void fetch(endpoint, { signal: controller.signal, cache: 'no-store' })
			.then(async (response) => {
				if (!response.ok) throw new Error((await response.json()).message ?? 'Review unavailable.');
				const result = await response.json();
				if (controller.signal.aborted) return;
				review = result;
				// Only restore after the authenticated response identifies the account and inputs.
				if (researchBackend === 'local' || mayAnnotate) restoreDraft();
			})
			.catch((caught: unknown) => {
				if (!controller.signal.aborted)
					loadError = caught instanceof Error ? caught.message : 'Review unavailable.';
			});
		return () => controller.abort();
	});
	function restoreDraft() {
		if (!draftKey) return;
		try {
			const raw = localStorage.getItem(draftKey);
			if (raw) {
				const draft = JSON.parse(raw);
				if (
					typeof draft.note === 'string' &&
					Number.isFinite(draft.start) &&
					Number.isFinite(draft.end) &&
					Array.isArray(draft.tags) &&
					discrepancyDirections.includes(draft.direction)
				) {
					start = draft.start;
					end = draft.end;
					note = draft.note;
					direction = draft.direction;
					tags = draft.tags.filter((tag: unknown) => observationTags.includes(tag as never));
					pendingMutation = readPendingObservation(draft.pendingMutation);
					draftMessage = 'Draft restored from this browser';
				}
			}
		} catch {
			draftMessage = 'Browser draft storage unavailable';
		}
		onrangechange(start, end);
	}
	function persistDraft() {
		if (!draftKey || (researchBackend === 'hosted' && !mayAnnotate)) return;
		try {
			localStorage.setItem(
				draftKey,
				JSON.stringify({ start, end, note, direction, tags, pendingMutation })
			);
			draftMessage = 'Draft saved in this browser';
		} catch {
			draftMessage = 'Browser draft storage unavailable';
		}
	}
	function keepDraft() {
		message = '';
		onrangechange(start, end);
		persistDraft();
	}
	function mark(which: 'start' | 'end') {
		if (saving) return;
		if (which === 'start') {
			start = Number(localTime.toFixed(3));
			end = Math.max(start, end);
		} else {
			end = Number(localTime.toFixed(3));
			onpause();
		}
		keepDraft();
	}
	function whole() {
		start = 0;
		end = duration;
		keepDraft();
	}
	function preview() {
		if (invalid || selectedLength <= 0) return;
		onpreview(start, end, loop);
	}
	function step(delta: number) {
		onpause();
		onseek(Math.max(0, Math.min(duration, localTime + delta / 30)));
	}
	function keyboard(event: KeyboardEvent) {
		if (!shortcuts || !review || event.repeat || event.isComposing) return;
		const target = event.target as HTMLElement;
		const typing =
			target.isContentEditable ||
			['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY'].includes(target.tagName);
		if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && canSave) {
			event.preventDefault();
			void save();
			return;
		}
		if (typing || !event.altKey || event.ctrlKey || event.metaKey) return;
		if (event.code === 'KeyI') {
			event.preventDefault();
			mark('start');
		}
		if (event.code === 'KeyO') {
			event.preventDefault();
			mark('end');
		}
		if (event.code === 'Space') {
			event.preventDefault();
			if (playing) onpause();
			else preview();
		}
	}
	function navigate(destination: Destination | null) {
		if (!destination || saving) return;
		onpause();
		void goto(
			resolve(
				`/metrics/${metric}?performance=${destination.performanceId}&segment=${destination.segmentId}&review=discrepancy`
			)
		);
	}
	async function save(event: SubmitEvent | undefined = undefined) {
		event?.preventDefault();
		if (!canSave) return;
		saving = true;
		message = '';
		onpause();
		try {
			const payload = JSON.stringify({
				start,
				end,
				note,
				direction,
				tags,
				metric,
				context: {
					...context,
					intervalMean: mean,
					validSamples: validSamples.length,
					totalSamples: selectedSamples.length
				},
				...(researchBackend === 'hosted' ? { inputVersion: review?.inputVersion } : {})
			});
			if (researchBackend === 'hosted') {
				pendingMutation = prepareObservationMutation(payload, pendingMutation, () =>
					crypto.randomUUID()
				);
				// Retain the retry identity before sending: a lost response may already have saved.
				persistDraft();
			}
			const response = await fetch(endpoint, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body:
					researchBackend === 'hosted'
						? JSON.stringify({ ...JSON.parse(payload), mutationId: pendingMutation!.mutationId })
						: payload
			});
			const result = await response.json();
			if (!response.ok) throw new Error(result.message ?? 'Could not save observation.');
			if (review) review.task.observations = result.observations;
			pendingMutation = null;
			note = '';
			tags = [];
			direction = 'Uncertain';
			try {
				if (draftKey) localStorage.removeItem(draftKey);
			} catch {
				/* The database receipt still confirms the save. */
			}
			draftMessage = '';
			messageKind = researchBackend === 'local' && result.backupError ? 'warning' : 'success';
			message =
				researchBackend === 'hosted'
					? 'Observation saved to your research account.'
					: result.backupError
						? 'Observation saved. Database backup failed; check the local server before continuing.'
						: 'Observation saved with a verified database backup.';
		} catch (caught) {
			persistDraft();
			messageKind = 'error';
			message = caught instanceof Error ? caught.message : 'Save failed. Your draft is retained.';
		} finally {
			saving = false;
			if (messageKind !== 'error') {
				await tick();
				noteElement?.focus({ preventScroll: true });
			}
		}
	}
</script>

<svelte:window onkeydown={keyboard} />
<section class="review-card" aria-label="Discrepancy annotation">
	<header class="review-heading">
		<div>
			<p class="eyebrow">
				Discrepancy review{#if review}
					· Segment {review.task.clipNumber}{/if}
			</p>
			<h2>
				{researchBackend === 'hosted' && !mayAnnotate
					? 'Review observations'
					: 'Add an observation'}
			</h2>
		</div>
		<a class="link text-sm" href={resolve('/research/discrepancy')}>Queue</a>
	</header>
	{#if review}
		<nav class="segment-navigation" aria-label="Review segments in dataset order">
			<button
				type="button"
				class="daisy-btn daisy-btn-sm daisy-btn-outline"
				disabled={!review.navigation.previous || saving}
				title={review.navigation.previous?.label}
				onclick={() => navigate(review!.navigation.previous)}>← Previous</button
			><span>{review.navigation.position} / {review.navigation.total}</span><button
				type="button"
				class="daisy-btn daisy-btn-sm daisy-btn-outline"
				disabled={!review.navigation.next || saving}
				title={review.navigation.next?.label}
				onclick={() => navigate(review!.navigation.next)}>Next segment →</button
			>
		</nav>
		<div class="rating-context">
			<div>
				<span class="context-label">Human similarity mean</span><strong
					>{review.task.human.human_rating?.toFixed(2) ?? 'missing'}<small> / 5</small></strong
				>
			</div>
			<div>
				<span class="context-label">Original raters · 1–3</span><span class="rater-values"
					>{[review.task.human.rating_1, review.task.human.rating_2, review.task.human.rating_3]
						.map((value) => value ?? '—')
						.join(' / ')}</span
				>
			</div>
		</div>
		<details class="scale-guide">
			<summary>How to compare these values</summary>
			<p>
				Human ratings describe the whole segment. {metric === 'qijia2d'
					? 'The first configured Qijia2D curve'
					: 'Viona2D'} is shown below; lower error means closer motion. Its scale differs from the human
				rating. Use the videos and curve to judge possible causes. Notes record hypotheses.
			</p>
		</details>
		<form onsubmit={save} class="review-form">
			<fieldset disabled={saving} class="interval-controls">
				<legend>Choose a moment <span>{formatTime(localTime)}</span></legend>
				<div class="interval-strip" aria-hidden="true">
					<span
						style:left={`${duration ? (start / duration) * 100 : 0}%`}
						style:width={`${duration ? (Math.max(0, end - start) / duration) * 100 : 0}%`}
					></span><i style:left={`${duration ? (localTime / duration) * 100 : 0}%`}></i>
				</div>
				<input
					class="daisy-range daisy-range-xs segment-seek"
					aria-label="Seek reviewed segment"
					type="range"
					min="0"
					max={duration}
					step="0.01"
					value={localTime}
					oninput={(event) => {
						onpause();
						onseek(Number(event.currentTarget.value));
					}}
				/>
				<div class="time-fields">
					<label
						>Start (clip seconds)<input
							class="daisy-input daisy-input-sm"
							type="number"
							min="0"
							max={duration}
							step="0.001"
							bind:value={start}
							oninput={() => queueMicrotask(keepDraft)}
							required
						/><button
							class="daisy-btn daisy-btn-sm"
							type="button"
							onclick={() => mark('start')}
							title="Alt+I when not typing">Mark start here</button
						></label
					>
					<label
						>End (clip seconds)<input
							class="daisy-input daisy-input-sm"
							type="number"
							min="0"
							max={duration}
							step="0.001"
							bind:value={end}
							oninput={() => queueMicrotask(keepDraft)}
							required
						/><button
							class="daisy-btn daisy-btn-sm"
							type="button"
							onclick={() => mark('end')}
							title="Alt+O when not typing">Mark end here</button
						></label
					>
				</div>
				<div class="interval-caption">
					<span
						>{wholeSegment
							? `${formatTime(start)}–${formatTime(end)}`
							: selectedLength === 0
								? 'Single moment'
								: `${formatTime(selectedLength)} interval`}</span
					><button type="button" class="link" onclick={whole}>Whole segment</button>
				</div>
				{#if invalid}<p class="text-error text-sm" role="alert">
						Choose an interval within this segment; end must follow start.
					</p>{/if}
				<div class="playback-controls">
					<button
						class="daisy-btn daisy-btn-sm daisy-btn-outline"
						type="button"
						disabled={invalid || selectedLength === 0}
						onclick={() => (playing ? onpause() : preview())}
						>{playing ? 'Pause preview' : 'Replay interval'}</button
					>
					<label class="loop-control"
						><input
							class="daisy-checkbox daisy-checkbox-sm"
							type="checkbox"
							bind:checked={loop}
							onchange={() => {
								if (playing) preview();
							}}
						/>Loop</label
					>
					<label class="sr-only" for="review-speed">Review playback speed</label><select
						id="review-speed"
						aria-label="Review playback speed"
						class="daisy-select daisy-select-sm speed-select"
						value={String(playbackRate)}
						onchange={(event) => onrate(Number(event.currentTarget.value))}
						><option value="0.25">0.25×</option><option value="0.5">0.5×</option><option value="1"
							>1×</option
						></select
					>
				</div>
				<div class="frame-controls">
					<button
						type="button"
						class="daisy-btn daisy-btn-ghost daisy-btn-xs"
						onclick={() => step(-1)}>← Frame</button
					><button
						type="button"
						class="daisy-btn daisy-btn-ghost daisy-btn-xs"
						onclick={() => step(1)}>Frame →</button
					><button
						type="button"
						class="daisy-btn daisy-btn-ghost daisy-btn-xs"
						disabled={invalid}
						onclick={() => {
							onpause();
							onseek(start);
						}}>Seek to start</button
					>
				</div>
				<p class="sample-context">
					Interval error <strong>{mean?.toFixed(3) ?? 'no valid samples'}</strong> · {validSamples.length}/{selectedSamples.length}
					valid sampled rows
				</p>
			</fieldset>
			<fieldset
				disabled={saving || (researchBackend === 'hosted' && !mayAnnotate)}
				class="observation-controls"
			>
				<label for="discrepancy-note" class="note-label">What did you notice?</label><textarea
					id="discrepancy-note"
					aria-label="Observation"
					class="daisy-textarea"
					rows="4"
					maxlength="4000"
					{@attach captureNote}
					bind:value={note}
					oninput={() => queueMicrotask(keepDraft)}
					placeholder="Describe what you see and why the score may differ. Include uncertainty."
					required
				></textarea>
				<fieldset class="direction-options">
					<legend>How does the metric seem?</legend
					>{#each discrepancyDirections as option (option)}<label
							class={{ selected: direction === option }}
							><input
								type="radio"
								class="daisy-radio daisy-radio-xs"
								name="discrepancy-direction"
								value={option}
								bind:group={direction}
								onchange={() => queueMicrotask(keepDraft)}
							/>{labels[option]}</label
						>{/each}
				</fieldset>
				<details class="optional-tags">
					<summary
						>Possible causes <span>{tags.length ? `${tags.length} selected` : 'optional'}</span
						></summary
					>
					<div>
						{#each observationTags as tag (tag)}<label
								><input
									class="daisy-checkbox daisy-checkbox-sm"
									type="checkbox"
									value={tag}
									bind:group={tags}
									onchange={() => queueMicrotask(keepDraft)}
								/>{tag}</label
							>{/each}
					</div>
				</details>
			</fieldset>
			<footer class="save-footer">
				<button type="submit" class="daisy-btn daisy-btn-primary save-button" disabled={!canSave}
					>{saving ? 'Saving…' : 'Save observation'}</button
				>
				<div class="save-state" aria-live="polite">
					{#if message}<p
							class={{
								'text-error': messageKind === 'error',
								'text-warning': messageKind === 'warning',
								'text-success': messageKind === 'success'
							}}
						>
							{message}
						</p>{:else}<p>
							{!mayAnnotate && researchBackend === 'hosted'
								? 'Viewing with your research account'
								: draftMessage || `Saving as ${review.annotator || '—'}`}
						</p>{/if}
				</div>
				{#if researchBackend === 'hosted' && !mayAnnotate}<p class="text-sm opacity-70">
						Your current access allows viewing. Editor access is required to save observations.
					</p>{:else if !review.annotator}<p class="text-warning text-sm">
						Set RESEARCH_ANNOTATOR to enable saving.
					</p>{/if}
			</footer>
		</form>
		<details class="saved-notes" bind:open={savedOpen}>
			<summary>Saved observations ({review.task.observations.length})</summary>
			{#if !review.task.observations.length}<p class="empty-notes">
					Saved notes will appear here with a link to their interval.
				</p>{/if}
			{#each review.task.observations as observation (observation.id)}<article>
					<button
						class="link"
						onclick={() => {
							onpause();
							onseek(observation.start_seconds);
						}}>{formatTime(observation.start_seconds)}–{formatTime(observation.end_seconds)}</button
					><span class="saved-metric">{observation.metric}</span>
					<p class="saved-direction">{labels[observation.direction] ?? observation.direction}</p>
					<p class="saved-text">{observation.note}</p>
					<p class="saved-meta">
						{observation.tags.join(' · ')}{observation.tags.length
							? ' · '
							: ''}{observation.annotator}
					</p>
				</article>{/each}
		</details>
		<details class="shortcut-guide">
			<summary>Keyboard shortcuts</summary><label
				><input
					type="checkbox"
					class="daisy-checkbox daisy-checkbox-xs"
					bind:checked={shortcuts}
				/>Enable shortcuts</label
			>
			<p>
				Alt+I mark start · Alt+O mark end · Alt+Space replay/pause · Ctrl/⌘+Enter save. Marking
				shortcuts stay inactive while typing or using a control.
			</p>
		</details>
	{:else if loadError}<p class="daisy-alert daisy-alert-error" role="alert">{loadError}</p>{:else}<p
			role="status"
			class="loading-context"
		>
			Loading rating context…
		</p>{/if}
</section>

<style>
	.review-card {
		background: var(--color-base-100);
		border: 1px solid var(--color-base-300);
		border-radius: 1rem;
		overflow: clip;
		color: var(--color-base-content);
		font-size: 0.875rem;
	}
	.review-heading {
		padding: 1rem 1rem 0.75rem;
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 1rem;
	}
	.eyebrow {
		font-size: 0.7rem;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		opacity: 0.65;
		margin-bottom: 0.25rem;
	}
	h2 {
		font-size: 1.125rem;
		font-weight: 650;
	}
	.rating-context {
		margin: 0 1rem;
		padding: 0.75rem;
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.75rem;
		background: var(--color-base-200);
		border-radius: 0.6rem;
	}
	.context-label {
		display: block;
		font-size: 0.7rem;
		opacity: 0.7;
		margin-bottom: 0.2rem;
	}
	.rating-context strong {
		font-size: 1.25rem;
		font-variant-numeric: tabular-nums;
	}
	.rating-context small {
		font-size: 0.75rem;
		font-weight: 400;
		opacity: 0.65;
	}
	.rater-values {
		font-size: 1rem;
		font-variant-numeric: tabular-nums;
	}
	.scale-guide,
	.shortcut-guide {
		margin: 0.5rem 1rem;
		font-size: 0.75rem;
		opacity: 0.8;
	}
	summary {
		cursor: pointer;
		min-height: 1.75rem;
		padding-block: 0.3rem;
	}
	.scale-guide p,
	.shortcut-guide p {
		margin: 0.4rem 0;
		line-height: 1.5;
	}
	.review-form {
		padding: 0 1rem;
	}
	.interval-controls {
		padding-block: 0.75rem;
		border-bottom: 1px solid var(--color-base-300);
	}
	.interval-controls legend {
		padding-top: 0.5rem;
		font-weight: 600;
		width: 100%;
		display: flex;
		justify-content: space-between;
		gap: 1rem;
	}
	.interval-controls legend span {
		font-weight: 400;
		font-variant-numeric: tabular-nums;
	}
	.interval-strip {
		height: 0.5rem;
		background: var(--color-base-200);
		position: relative;
		border-radius: 1rem;
		margin-top: 0.7rem;
		overflow: hidden;
	}
	.interval-strip span {
		position: absolute;
		height: 100%;
		background: color-mix(in srgb, var(--color-primary) 30%, transparent);
	}
	.interval-strip i {
		position: absolute;
		top: 0;
		bottom: 0;
		width: 2px;
		background: var(--color-primary);
	}
	.segment-seek {
		display: block;
		margin: 0.4rem 0 0.7rem;
	}
	.time-fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem;
	}
	.time-fields label {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
		font-size: 0.75rem;
	}
	.time-fields input {
		width: 100%;
		font-variant-numeric: tabular-nums;
	}
	.time-fields button {
		width: 100%;
		font-size: 0.75rem;
	}
	.interval-caption {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		margin: 0.5rem 0;
		font-size: 0.75rem;
		opacity: 0.75;
	}
	.playback-controls {
		display: flex;
		align-items: center;
		gap: 0.6rem;
		flex-wrap: wrap;
	}
	.loop-control {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.75rem;
	}
	.speed-select {
		width: 4.8rem;
		margin-left: auto;
		padding-inline: 0.5rem;
	}
	.frame-controls {
		display: flex;
		justify-content: space-between;
		gap: 0.25rem;
		margin: 0.35rem 0;
	}
	.sample-context {
		font-size: 0.7rem;
		opacity: 0.7;
		line-height: 1.5;
	}
	.observation-controls {
		padding-block: 0.85rem;
	}
	.note-label {
		display: block;
		font-weight: 600;
		margin-bottom: 0.4rem;
	}
	.observation-controls textarea {
		width: 100%;
		resize: vertical;
		min-height: 6rem;
		font-size: 0.875rem;
		line-height: 1.5;
	}
	.direction-options {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
		margin: 0.75rem 0;
	}
	.direction-options legend {
		font-size: 0.75rem;
		margin-bottom: 0.4rem;
		opacity: 0.75;
	}
	.direction-options label {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.5rem;
		border: 1px solid var(--color-base-300);
		border-radius: 0.5rem;
		font-size: 0.7rem;
		cursor: pointer;
	}
	.direction-options .selected {
		background: color-mix(in srgb, var(--color-primary) 8%, var(--color-base-100));
		border-color: var(--color-primary);
	}
	.optional-tags summary {
		display: flex;
		justify-content: space-between;
		gap: 0.5rem;
		font-size: 0.75rem;
	}
	.optional-tags summary span {
		opacity: 0.6;
	}
	.optional-tags > div {
		display: grid;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	.optional-tags label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.75rem;
	}
	.save-footer {
		position: sticky;
		bottom: 0;
		background: var(--color-base-100);
		padding: 0.75rem 0 0.5rem;
		border-top: 1px solid var(--color-base-300);
		z-index: 1;
	}
	.save-button {
		width: 100%;
		min-height: 2.75rem;
	}
	.save-state {
		min-height: 2rem;
		padding-top: 0.4rem;
		font-size: 0.7rem;
		line-height: 1.45;
	}
	.saved-notes {
		border-top: 1px solid var(--color-base-300);
		padding: 0.5rem 1rem;
	}
	.saved-notes summary {
		font-weight: 600;
	}
	.saved-notes article {
		padding: 0.75rem 0;
		border-top: 1px solid var(--color-base-300);
	}
	.saved-metric {
		float: right;
		font-size: 0.7rem;
		opacity: 0.65;
	}
	.saved-direction {
		font-size: 0.75rem;
		margin: 0.4rem 0;
		opacity: 0.75;
	}
	.saved-text {
		white-space: pre-wrap;
		overflow-wrap: anywhere;
	}
	.saved-meta,
	.empty-notes {
		font-size: 0.75rem;
		opacity: 0.65;
		margin: 0.4rem 0;
	}
	.segment-navigation {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-top: 1px solid var(--color-base-300);
	}
	.segment-navigation span {
		font-size: 0.7rem;
		font-variant-numeric: tabular-nums;
		opacity: 0.6;
	}
	.segment-navigation button {
		font-size: 0.75rem;
	}
	.shortcut-guide label {
		display: flex;
		align-items: center;
		gap: 0.4rem;
	}
	.loading-context {
		padding: 1rem;
	}
	@media (max-width: 600px) {
		.time-fields button {
			min-height: 2.75rem;
		}
		.direction-options label {
			min-height: 2.75rem;
		}
		.save-footer {
			bottom: 14rem;
		}
		.frame-controls button {
			min-height: 2.25rem;
		}
	}
	@media (max-height: 600px) {
		.save-footer {
			bottom: 0;
		}
	}
</style>
