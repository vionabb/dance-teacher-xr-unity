<!--
@component
Track-and-span timeline for marking frame intervals on a video, ported from the
error-marking timeline of the participant annotation tool
(`motion-pipeline/motion_extraction/annotation_tool/static/app.js`): drag on an
empty part of a track to insert a span, drag a span's edges to resize it, tap a
span to select it. Spans can also be dragged by their body to move them.

Frames are inclusive native video frame indices. The parent owns all data; this
component only reports gestures. `limits` keeps spans in one track from overlapping.
-->
<script lang="ts" module>
	export type TimelineTrack = { id: string; label: string };
	export type TimelineSpan = {
		id: string;
		trackId: string;
		startFrame: number;
		endFrame: number;
		label: string;
		incomplete?: boolean;
	};
	export type TimelineMarker = { frame: number; label: string };
</script>

<script lang="ts">
	let {
		frameCount,
		currentFrame,
		tracks,
		spans,
		markers = [],
		selectedId = null,
		editable = true,
		defaultLength = 15,
		limits,
		onseek,
		oncreate,
		onspanchange,
		oncommit,
		onselect
	}: {
		frameCount: number;
		currentFrame: number;
		tracks: TimelineTrack[];
		spans: TimelineSpan[];
		markers?: TimelineMarker[];
		selectedId?: string | null;
		editable?: boolean;
		/** Length in frames of a span inserted by a tap without dragging. */
		defaultLength?: number;
		/** Free frame range around `frame` in a track, or null when `frame` is inside another span. */
		limits: (
			trackId: string,
			frame: number,
			ignoreId?: string
		) => { lo: number; hi: number } | null;
		onseek: (frame: number) => void;
		/** Returns the new span's id. */
		oncreate: (trackId: string, startFrame: number, endFrame: number) => string;
		onspanchange: (id: string, startFrame: number, endFrame: number) => void;
		oncommit: (id: string) => void;
		onselect: (id: string | null) => void;
	} = $props();

	const zoomLevels = [1, 2, 4, 8];
	let zoom = $state(1);
	let scroller: HTMLDivElement | undefined = $state();
	const last = $derived(Math.max(frameCount - 1, 0));
	const pct = (frame: number) => (frame / Math.max(frameCount, 1)) * 100;

	function frameAt(clientX: number, track: HTMLElement) {
		const rect = track.getBoundingClientRect();
		const fraction = rect.width ? (clientX - rect.left) / rect.width : 0;
		return Math.min(Math.max(Math.floor(fraction * frameCount), 0), last);
	}

	type Drag = {
		id: string;
		mode: 'create' | 'start' | 'end' | 'move';
		trackEl: HTMLElement;
		origin: number;
		startFrame: number;
		endFrame: number;
		lo: number;
		hi: number;
		moved: boolean;
	};
	let drag: Drag | null = null;

	function begin(event: PointerEvent, next: Drag) {
		event.preventDefault();
		event.stopPropagation();
		drag = next;
		window.addEventListener('pointermove', onMove);
		window.addEventListener('pointerup', onUp, { once: true });
		window.addEventListener('pointercancel', onUp, { once: true });
	}

	function onTrackDown(event: PointerEvent, trackId: string) {
		if (!editable || event.button !== 0) return;
		const trackEl = event.currentTarget as HTMLElement;
		const frame = frameAt(event.clientX, trackEl);
		const free = limits(trackId, frame);
		if (!free) return;
		const id = oncreate(trackId, frame, frame);
		onseek(frame);
		begin(event, {
			id,
			mode: 'create',
			trackEl,
			origin: frame,
			startFrame: frame,
			endFrame: frame,
			lo: free.lo,
			hi: free.hi,
			moved: false
		});
	}

	function onSpanDown(event: PointerEvent, span: TimelineSpan, mode: 'start' | 'end' | 'move') {
		if (event.button !== 0) return;
		const trackEl = (event.currentTarget as HTMLElement).closest<HTMLElement>('[data-track]');
		if (!trackEl) return;
		if (!editable) {
			event.stopPropagation();
			onselect(span.id);
			onseek(span.startFrame);
			return;
		}
		const free = limits(span.trackId, span.startFrame, span.id) ?? { lo: 0, hi: last };
		begin(event, {
			id: span.id,
			mode,
			trackEl,
			origin: frameAt(event.clientX, trackEl),
			startFrame: span.startFrame,
			endFrame: span.endFrame,
			lo: free.lo,
			hi: free.hi,
			moved: false
		});
	}

	function onMove(event: PointerEvent) {
		if (!drag) return;
		const frame = Math.min(Math.max(frameAt(event.clientX, drag.trackEl), drag.lo), drag.hi);
		let { startFrame, endFrame } = drag;
		if (drag.mode === 'create') {
			startFrame = Math.min(drag.origin, frame);
			endFrame = Math.max(drag.origin, frame);
		} else if (drag.mode === 'start') startFrame = Math.min(frame, drag.endFrame);
		else if (drag.mode === 'end') endFrame = Math.max(frame, drag.startFrame);
		else {
			const length = drag.endFrame - drag.startFrame;
			const delta = frameAt(event.clientX, drag.trackEl) - drag.origin;
			startFrame = Math.min(Math.max(drag.startFrame + delta, drag.lo), drag.hi - length);
			endFrame = startFrame + length;
		}
		if (frame !== drag.origin || drag.moved) drag.moved = true;
		onspanchange(drag.id, startFrame, endFrame);
		onseek(drag.mode === 'end' ? endFrame : drag.mode === 'move' ? startFrame : frame);
	}

	function onUp() {
		window.removeEventListener('pointermove', onMove);
		window.removeEventListener('pointerup', onUp);
		window.removeEventListener('pointercancel', onUp);
		const finished = drag;
		drag = null;
		if (!finished) return;
		if (finished.mode === 'create' && !finished.moved)
			onspanchange(
				finished.id,
				finished.origin,
				Math.min(finished.origin + defaultLength - 1, finished.hi)
			);
		onselect(finished.id);
		if (finished.mode === 'create' || finished.moved) oncommit(finished.id);
		else onseek(finished.startFrame);
	}

	function onHandleKey(event: KeyboardEvent, span: TimelineSpan, edge: 'start' | 'end') {
		if (!editable || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
		event.preventDefault();
		const step = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 10 : 1);
		const free = limits(span.trackId, span.startFrame, span.id) ?? { lo: 0, hi: last };
		if (edge === 'start') {
			const start = Math.min(Math.max(span.startFrame + step, free.lo), span.endFrame);
			onspanchange(span.id, start, span.endFrame);
			onseek(start);
		} else {
			const end = Math.max(Math.min(span.endFrame + step, free.hi), span.startFrame);
			onspanchange(span.id, span.startFrame, end);
			onseek(end);
		}
		oncommit(span.id);
	}

	function onRulerDown(event: PointerEvent) {
		const ruler = event.currentTarget as HTMLElement;
		onseek(frameAt(event.clientX, ruler));
		const move = (e: PointerEvent) => onseek(frameAt(e.clientX, ruler));
		window.addEventListener('pointermove', move);
		window.addEventListener('pointerup', () => window.removeEventListener('pointermove', move), {
			once: true
		});
	}

	// Keep the playhead in view when zoomed in.
	$effect(() => {
		const frame = currentFrame;
		if (!scroller || zoom === 1 || drag) return;
		const inner = scroller.scrollWidth;
		const x = (frame / Math.max(frameCount, 1)) * inner;
		if (x < scroller.scrollLeft + 40 || x > scroller.scrollLeft + scroller.clientWidth - 40)
			scroller.scrollLeft = x - scroller.clientWidth / 2;
	});
</script>

<div class="space-y-1">
	<div class="flex items-center justify-end gap-2 text-xs">
		<span class="text-base-content/60">Zoom</span>
		<div class="daisy-join">
			{#each zoomLevels as level (level)}
				<button
					type="button"
					class={[
						'daisy-join-item daisy-btn daisy-btn-xs tabular-nums',
						zoom === level ? 'daisy-btn-primary daisy-btn-soft' : 'daisy-btn-ghost'
					]}
					aria-pressed={zoom === level}
					onclick={() => (zoom = level)}>{level}×</button
				>
			{/each}
		</div>
	</div>
	<div
		class="grid grid-cols-[3.75rem_minmax(0,1fr)] gap-x-2 sm:grid-cols-[minmax(4.5rem,8rem)_minmax(0,1fr)]"
	>
		<div class="grid auto-rows-[2rem] gap-y-1.5 pt-[1.75rem] text-xs font-semibold">
			{#each tracks as track (track.id)}
				<div class="text-base-content/80 flex items-center truncate" title={track.label}>
					{track.label}
				</div>
			{/each}
		</div>
		<div bind:this={scroller} class="overflow-x-auto overflow-y-hidden pb-1">
			<div class="relative" style:width={`${zoom * 100}%`}>
				<!-- Ruler: clip boundaries; press or drag to seek. -->
				<div
					class="bg-base-200 hover:bg-base-300/70 relative mb-1.5 h-[1.25rem] cursor-pointer touch-none rounded transition-colors"
					role="slider"
					tabindex="-1"
					aria-label="Seek"
					aria-valuemin={0}
					aria-valuemax={last}
					aria-valuenow={currentFrame}
					onpointerdown={onRulerDown}
				>
					{#each markers as marker (marker.frame)}
						<span
							class="border-base-content/30 text-base-content/60 absolute top-0 bottom-0 border-l pl-1 text-[0.65rem] leading-[1.25rem] font-medium whitespace-nowrap"
							style:left={`${pct(marker.frame)}%`}>{marker.label}</span
						>
					{/each}
				</div>
				<div class="grid auto-rows-[2rem] gap-y-1.5">
					{#each tracks as track (track.id)}
						<div
							data-track={track.id}
							class={[
								'bg-base-200 border-base-300 relative touch-none rounded-md border',
								editable ? 'cursor-crosshair' : 'cursor-default'
							]}
							role="group"
							aria-label={`${track.label} track`}
							onpointerdown={(event) => onTrackDown(event, track.id)}
						>
							{#each markers as marker (marker.frame)}
								<span
									class="border-base-content/10 pointer-events-none absolute top-0 bottom-0 border-l"
									style:left={`${pct(marker.frame)}%`}
								></span>
							{/each}
							{#each spans.filter((span) => span.trackId === track.id) as span (span.id)}
								<div
									class={[
										'group absolute -top-px -bottom-px flex min-w-2 items-center overflow-hidden rounded-md border px-2.5 text-[0.7rem] leading-tight font-semibold select-none',
										span.id === selectedId
											? 'bg-primary border-primary text-primary-content z-[1] shadow-md'
											: span.incomplete
												? 'bg-warning/25 border-warning text-base-content border-dashed'
												: 'bg-primary/15 border-primary/45 text-primary hover:bg-primary/25',
										editable ? 'cursor-grab' : 'cursor-pointer'
									]}
									style:left={`${pct(span.startFrame)}%`}
									style:width={`${pct(span.endFrame - span.startFrame + 1)}%`}
									title={`${span.label || 'Untitled move'} · frames ${span.startFrame}–${span.endFrame}`}
									role="button"
									tabindex="0"
									aria-pressed={span.id === selectedId}
									aria-label={`${span.label || 'Untitled move'}, frames ${span.startFrame} to ${span.endFrame}`}
									onpointerdown={(event) => onSpanDown(event, span, 'move')}
									onkeydown={(event) => {
										if (event.key === 'Enter' || event.key === ' ') {
											event.preventDefault();
											onselect(span.id);
											onseek(span.startFrame);
										}
									}}
								>
									<span class="truncate">{span.label || 'Untitled'}</span>
									{#if editable}
										<span
											class="absolute top-0 bottom-0 left-0 w-2 cursor-ew-resize touch-none after:absolute after:inset-y-1.5 after:left-0.5 after:w-0.5 after:rounded-full after:bg-current after:opacity-40 group-hover:after:opacity-80"
											role="slider"
											tabindex="0"
											aria-label="Start frame"
											aria-valuemin={0}
											aria-valuemax={span.endFrame}
											aria-valuenow={span.startFrame}
											onpointerdown={(event) => onSpanDown(event, span, 'start')}
											onkeydown={(event) => onHandleKey(event, span, 'start')}
										></span>
										<span
											class="absolute top-0 right-0 bottom-0 w-2 cursor-ew-resize touch-none after:absolute after:inset-y-1.5 after:right-0.5 after:w-0.5 after:rounded-full after:bg-current after:opacity-40 group-hover:after:opacity-80"
											role="slider"
											tabindex="0"
											aria-label="End frame"
											aria-valuemin={span.startFrame}
											aria-valuemax={last}
											aria-valuenow={span.endFrame}
											onpointerdown={(event) => onSpanDown(event, span, 'end')}
											onkeydown={(event) => onHandleKey(event, span, 'end')}
										></span>
									{/if}
								</div>
							{/each}
						</div>
					{/each}
				</div>
				<div
					class="bg-error pointer-events-none absolute top-0 bottom-0 z-10 w-0.5 -translate-x-1/2"
					style:left={`${pct(currentFrame + 0.5)}%`}
				>
					<span
						class="border-t-error absolute -top-px left-1/2 -translate-x-1/2 border-x-[5px] border-t-[7px] border-x-transparent"
					></span>
				</div>
			</div>
		</div>
	</div>
</div>
