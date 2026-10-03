<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import type { PageData } from './$types';
	import type { FrameMark } from '$lib/server/research-frame-review';

	let { data }: { data: PageData } = $props();
	type Point = [number | null, number | null] | null;
	type Pose = {
		landmarks: string[];
		pose_edges: Array<[string, string]>;
		frames: Array<Record<string, Point>>;
	};
	type Label = 'good' | 'flawed' | 'unusable';
	const parts = [
		'LEFT_SHOULDER',
		'RIGHT_SHOULDER',
		'LEFT_ELBOW',
		'RIGHT_ELBOW',
		'LEFT_WRIST',
		'RIGHT_WRIST',
		'LEFT_HIP',
		'RIGHT_HIP'
	];
	const causes = ['occlusion', 'motion_blur', 'background_confusion', 'suboptimal_clothing'];
	const source = $derived(`/api/dev/research-frame/${data.taskId}`);
	const resumeKey = $derived(`research-frame:${data.taskId}:${data.annotator}`);
	const shortTitle = $derived(data.displayLabel.replace(/^Frame review · /, ''));
	const initialRevision = untrack(() => data.revision);
	let video: HTMLVideoElement;
	let canvas: HTMLCanvasElement;
	let stage: HTMLDivElement;
	let detailDialog: HTMLDialogElement;
	let confirmDialog: HTMLDialogElement;
	let pose = $state<Pose | null>(null);
	let poseError = $state('');
	let frame = $state(initialRevision?.frame_usability_response?.last_viewed_frame ?? 0);
	let labels = $state<Record<string, Label>>({
		...(initialRevision?.frame_usability_response?.labels ?? {})
	});
	let marks = $state<FrameMark[]>(
		structuredClone(initialRevision?.frame_usability_response?.marks ?? [])
	);
	let note = $state(initialRevision?.frame_usability_response?.note ?? '');
	let override = $state<'unusable' | null>(
		initialRevision?.frame_usability_response?.video_usability_rating_override ?? null
	);
	let status = $state(initialRevision?.status ?? 'started');
	let revisionId = initialRevision?.revision_id ?? 0;
	let autoMissing = $state<number[]>([]);
	let selectedMark = $state<number | null>(null);
	let showPose = $state(true);
	let playing = $state(false);
	let speed = $state(0.5);
	let zoom = $state(1);
	let panX = $state(0);
	let panY = $state(0);
	let overflowOpen = $state(false);
	let saveState = $state('Ready');
	let saveError = $state('');
	let pendingStatus: 'started' | 'completed' | 'skipped' | 'unclear' = 'started';
	let dirty = 0;
	let saved = 0;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	let saveChain = Promise.resolve();
	let pointers = new Map<number, { x: number; y: number }>();
	let dragPoint: string | null = null;
	let dragMoved = false;
	let initialPinch = 0;
	let initialZoom = 1;
	let panOrigin = { x: 0, y: 0, panX: 0, panY: 0 };
	let animationFrame = 0;

	const maxFrame = $derived(data.frameCount - 1);
	let currentLabel = $derived(
		labels[String(frame)] ?? (autoMissing.includes(frame) ? 'unusable' : 'good')
	);
	let corrected = $derived(
		marks.some((mark) => Object.hasOwn(mark.positions ?? {}, String(frame)))
	);
	let countFlawed = $derived(Object.values(labels).filter((label) => label === 'flawed').length);
	let countUnusable = $derived(
		Array.from(
			{ length: data.frameCount },
			(_, index) => labels[String(index)] ?? (autoMissing.includes(index) ? 'unusable' : 'good')
		).filter((label) => label === 'unusable').length
	);
	let currentMarks = $derived(
		marks
			.map((mark, index) => ({ mark, index }))
			.filter(({ mark }) => frame >= mark.start_frame && frame <= mark.end_frame)
	);
	let frameBands = $derived.by(() => {
		const bands: Array<{ label: Label; count: number }> = [];
		for (let index = 0; index < data.frameCount; index++) {
			const label = labels[String(index)] ?? (autoMissing.includes(index) ? 'unusable' : 'good');
			const last = bands.at(-1);
			if (last?.label === label) last.count++;
			else bands.push({ label, count: 1 });
		}
		return bands;
	});

	onMount(() => {
		let cancelled = false;
		try {
			const savedFrame = Number(localStorage.getItem(resumeKey));
			if (
				Number.isInteger(savedFrame) &&
				savedFrame >= 0 &&
				savedFrame <= maxFrame &&
				savedFrame > frame
			)
				frame = savedFrame;
		} catch {
			/* Local storage may be unavailable. */
		}
		void fetch(`${source}/landmarks`, { cache: 'no-store' })
			.then(async (response) => {
				if (!response.ok) throw new Error(`Pose data unavailable (${response.status}).`);
				return (await response.json()) as Pose;
			})
			.then((loaded) => {
				if (cancelled) return;
				if (!Array.isArray(loaded.frames) || loaded.frames.length !== data.frameCount)
					throw new Error('Pose frames do not match this clip.');
				pose = loaded;
				autoMissing = loaded.frames.flatMap((entry, index) => {
					const names = loaded.landmarks?.length ? loaded.landmarks : Object.keys(entry ?? {});
					return names.some((name) => validPoint(entry?.[name])) ? [] : [index];
				});
				seek(frame);
				draw();
			})
			.catch((caught: unknown) => {
				if (!cancelled)
					poseError = caught instanceof Error ? caught.message : 'Pose data unavailable.';
			});
		const resize = new ResizeObserver(draw);
		if (stage) resize.observe(stage);
		window.addEventListener('keydown', keydown);
		return () => {
			cancelled = true;
			resize.disconnect();
			window.removeEventListener('keydown', keydown);
			cancelAnimationFrame(animationFrame);
			clearTimeout(saveTimer);
		};
	});

	function validPoint(point: Point | undefined): point is [number, number] {
		return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);
	}
	function positionFor(name: string): [number, number] | null {
		const correction = marks.find(
			(mark) => mark.body_part === name && mark.positions?.[String(frame)]
		)?.positions[String(frame)];
		if (correction) return correction;
		const point = pose?.frames[frame]?.[name];
		return validPoint(point) ? point : null;
	}
	function videoBox() {
		const width = stage?.clientWidth ?? 0,
			height = stage?.clientHeight ?? 0;
		const scale = Math.min(width / data.width, height / data.height);
		return {
			x: (width - data.width * scale) / 2,
			y: (height - data.height * scale) / 2,
			width: data.width * scale,
			height: data.height * scale,
			scale
		};
	}
	function draw() {
		if (!canvas || !stage) return;
		const dpr = window.devicePixelRatio || 1;
		const width = stage.clientWidth,
			height = stage.clientHeight;
		if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
			canvas.width = Math.round(width * dpr);
			canvas.height = Math.round(height * dpr);
		}
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
		ctx.clearRect(0, 0, width, height);
		if (!pose || !showPose) return;
		const box = videoBox();
		const locate = (name: string) => {
			const point = positionFor(name);
			return point ? ([box.x + point[0] * box.scale, box.y + point[1] * box.scale] as const) : null;
		};
		ctx.lineCap = 'round';
		for (const [a, b] of pose.pose_edges ?? []) {
			const first = locate(a),
				second = locate(b);
			if (!first || !second) continue;
			ctx.beginPath();
			ctx.moveTo(...first);
			ctx.lineTo(...second);
			ctx.strokeStyle = 'rgba(0,0,0,.85)';
			ctx.lineWidth = 5;
			ctx.stroke();
			ctx.strokeStyle = '#5eead4';
			ctx.lineWidth = 2.5;
			ctx.stroke();
		}
		for (const name of pose.landmarks ?? []) {
			const point = locate(name);
			if (!point) continue;
			const marked = marks.some(
				(mark) => mark.body_part === name && frame >= mark.start_frame && frame <= mark.end_frame
			);
			ctx.beginPath();
			ctx.arc(point[0], point[1], marked ? 5.5 : 4.5, 0, 2 * Math.PI);
			ctx.fillStyle = marked ? '#fbbf24' : '#5eead4';
			ctx.fill();
			ctx.strokeStyle = '#111827';
			ctx.lineWidth = 2;
			ctx.stroke();
		}
	}
	function seek(next: number) {
		frame = Math.max(0, Math.min(maxFrame, Math.round(next)));
		if (video) {
			video.pause();
			video.currentTime = (frame + 0.5) / data.fps;
		}
		playing = false;
		try {
			localStorage.setItem(resumeKey, String(frame));
		} catch {
			/* optional */
		}
		draw();
	}
	function step(amount: number) {
		if (frame + amount > maxFrame) {
			confirmDialog?.showModal();
			return;
		}
		seek(frame + amount);
		if (status === 'started') scheduleSave('started', 1000);
	}
	function syncTime() {
		if (!video || video.paused) return;
		frame = Math.max(0, Math.min(maxFrame, Math.floor(video.currentTime * data.fps)));
		draw();
		animationFrame = requestAnimationFrame(syncTime);
	}
	function togglePlay() {
		if (!video) return;
		if (!video.paused) {
			video.pause();
			playing = false;
			cancelAnimationFrame(animationFrame);
			if (status === 'started') scheduleSave('started', 1000);
			return;
		}
		video.playbackRate = speed;
		void video.play().then(() => {
			playing = true;
			cancelAnimationFrame(animationFrame);
			animationFrame = requestAnimationFrame(syncTime);
		});
	}
	function keydown(event: KeyboardEvent) {
		if (
			event.metaKey ||
			event.ctrlKey ||
			event.altKey ||
			event.shiftKey ||
			event.target instanceof HTMLInputElement ||
			event.target instanceof HTMLTextAreaElement ||
			event.target instanceof HTMLSelectElement ||
			detailDialog?.open ||
			confirmDialog?.open
		)
			return;
		if (event.key === 'ArrowLeft') {
			event.preventDefault();
			step(-1);
		} else if (event.key === 'ArrowRight') {
			event.preventDefault();
			step(1);
		} else if (event.key === ' ') {
			event.preventDefault();
			togglePlay();
		}
	}
	function setLabel(label: Label) {
		if (override) override = null;
		labels = { ...labels, [String(frame)]: label };
		scheduleSave();
	}
	function markAt(part: string, at: number): FrameMark {
		let mark = marks.find(
			(item) => item.body_part === part && item.start_frame <= at && item.end_frame >= at
		);
		if (mark) return mark;
		const before = marks.find((item) => item.body_part === part && item.end_frame === at - 1);
		const after = marks.find((item) => item.body_part === part && item.start_frame === at + 1);
		if (before && after) {
			before.end_frame = after.end_frame;
			before.causes = [...new Set([...before.causes, ...after.causes])];
			before.positions = { ...after.positions, ...before.positions };
			before.note ||= after.note;
			marks = marks.filter((item) => item !== after);
			return before;
		}
		if (before) {
			before.end_frame = at;
			marks = [...marks];
			return before;
		}
		if (after) {
			after.start_frame = at;
			marks = [...marks];
			return after;
		}
		mark = { body_part: part, start_frame: at, end_frame: at, causes: [], note: '', positions: {} };
		marks = [...marks, mark];
		return mark;
	}
	function correct(part: string, x: number, y: number) {
		const mark = markAt(part, frame);
		mark.positions = {
			...mark.positions,
			[String(frame)]: [Math.round(x * 10) / 10, Math.round(y * 10) / 10]
		};
		marks = [...marks];
		if (currentLabel === 'good') labels = { ...labels, [String(frame)]: 'flawed' };
		scheduleSave();
		draw();
	}
	function stagePoint(event: PointerEvent) {
		const rect = stage.getBoundingClientRect();
		const x = (event.clientX - rect.left - panX - rect.width / 2) / zoom + rect.width / 2;
		const y = (event.clientY - rect.top - panY - rect.height / 2) / zoom + rect.height / 2;
		return { x, y };
	}
	function imagePoint(event: PointerEvent) {
		const point = stagePoint(event),
			box = videoBox();
		return { x: (point.x - box.x) / box.scale, y: (point.y - box.y) / box.scale };
	}
	function pointerDown(event: PointerEvent) {
		if (!pose) return;
		stage.setPointerCapture(event.pointerId);
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			initialPinch = Math.hypot(a.x - b.x, a.y - b.y);
			initialZoom = zoom;
			dragPoint = null;
			return;
		}
		const image = imagePoint(event);
		const radius = 20 / videoBox().scale / zoom;
		let closest = radius;
		for (const name of pose.landmarks ?? []) {
			const point = positionFor(name);
			if (!point) continue;
			const distance = Math.hypot(point[0] - image.x, point[1] - image.y);
			if (distance < closest) {
				closest = distance;
				dragPoint = name;
			}
		}
		dragMoved = false;
		panOrigin = { x: event.clientX, y: event.clientY, panX, panY };
		if (dragPoint) video?.pause();
	}
	function pointerMove(event: PointerEvent) {
		if (!pointers.has(event.pointerId)) return;
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			zoom = Math.max(
				1,
				Math.min(5, (initialZoom * Math.hypot(a.x - b.x, a.y - b.y)) / Math.max(initialPinch, 1))
			);
			return;
		}
		if (dragPoint) {
			const image = imagePoint(event);
			correct(dragPoint, image.x, image.y);
			dragMoved = true;
		} else if (zoom > 1) {
			panX = event.clientX - panOrigin.x + panOrigin.panX;
			panY = event.clientY - panOrigin.y + panOrigin.panY;
		}
	}
	function pointerUp(event: PointerEvent) {
		if (dragPoint && !dragMoved && pointers.size === 1) {
			markAt(dragPoint, frame);
			marks = [...marks];
			if (currentLabel === 'good') labels = { ...labels, [String(frame)]: 'flawed' };
			scheduleSave();
			draw();
		}
		pointers.delete(event.pointerId);
		dragPoint = null;
	}
	function addRange(part: string, from: number, to: number) {
		if (override) override = null;
		marks = [
			...marks,
			{
				body_part: part,
				start_frame: Math.min(from, to),
				end_frame: Math.max(from, to),
				causes: [],
				note: '',
				positions: {}
			}
		];
		for (let i = Math.min(from, to); i <= Math.max(from, to); i++)
			if (!labels[String(i)] || labels[String(i)] === 'good') labels[String(i)] = 'flawed';
		labels = { ...labels };
		scheduleSave();
		draw();
	}
	function toggleCause(index: number, cause: string) {
		const mark = marks[index];
		mark.causes = mark.causes.includes(cause)
			? mark.causes.filter((item) => item !== cause)
			: [...mark.causes, cause];
		marks = [...marks];
		scheduleSave();
	}
	function changeMarkRange(index: number, edge: 'start_frame' | 'end_frame', value: number) {
		const mark = marks[index];
		const bounded = Math.max(0, Math.min(maxFrame, Math.round(value)));
		mark[edge] =
			edge === 'start_frame'
				? Math.min(bounded, mark.end_frame)
				: Math.max(bounded, mark.start_frame);
		mark.positions = Object.fromEntries(
			Object.entries(mark.positions).filter(
				([at]) => Number(at) >= mark.start_frame && Number(at) <= mark.end_frame
			)
		);
		marks = [...marks];
		scheduleSave();
	}
	function scheduleSave(
		nextStatus: 'started' | 'completed' | 'skipped' | 'unclear' = 'started',
		delay = 120
	) {
		pendingStatus = nextStatus;
		dirty++;
		saveState = 'Unsaved';
		saveError = '';
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			void flushSave();
		}, delay);
	}
	async function flushSave(): Promise<boolean> {
		clearTimeout(saveTimer);
		if (dirty === saved) return true;
		const target = dirty;
		const payload = {
			expected_revision_id: revisionId,
			status: pendingStatus,
			frame_usability_response: {
				labels: structuredClone(labels),
				marks: structuredClone(marks),
				note,
				video_usability_rating_override: override,
				last_viewed_frame: frame
			}
		};
		saveChain = saveChain
			.then(async () => {
				// A queued request may have been captured before the prior revision finished.
				payload.expected_revision_id = revisionId;
				saveState = 'Saving…';
				const response = await fetch(`${source}/save`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(payload)
				});
				if (!response.ok)
					throw new Error(
						response.status === 409
							? 'A newer revision exists. Reload before editing further.'
							: `Save failed (${response.status}).`
					);
				const receipt = (await response.json()) as { revision_id: number };
				revisionId = receipt.revision_id;
				saved = Math.max(saved, target);
				status = payload.status;
				saveState = dirty === saved ? 'Saved' : 'Unsaved';
				if (dirty > saved) {
					clearTimeout(saveTimer);
					saveTimer = setTimeout(() => {
						void flushSave();
					}, 120);
				}
			})
			.catch((caught: unknown) => {
				saveError = caught instanceof Error ? caught.message : 'Save failed.';
				saveState = 'Save failed';
			});
		await saveChain;
		return saved >= target;
	}
	async function finish(kind: 'completed' | 'skipped' | 'unusable') {
		confirmDialog.close();
		if (kind === 'unusable') override = 'unusable';
		else if (override) override = null;
		scheduleSave(kind === 'skipped' ? 'skipped' : 'completed');
		if (await flushSave())
			window.location.assign(
				data.nextTaskId ? `/research/frames/${data.nextTaskId}` : '/research/frames'
			);
	}
</script>

<svelte:head><title>{data.displayLabel} · Research</title></svelte:head>

<main class="bg-base-200 text-base-content flex h-dvh min-h-0 flex-col overflow-hidden">
	<header
		class="border-base-300 bg-base-100 flex h-11 shrink-0 items-center justify-between gap-2 border-b px-3"
	>
		<div class="flex min-w-0 items-center gap-2">
			<a
				class="daisy-btn daisy-btn-ghost daisy-btn-xs"
				href="/research/frames"
				aria-label="Back to frame queue">←</a
			>
			<div class="min-w-0">
				<div role="heading" aria-level="1" class="truncate text-sm font-semibold">
					{shortTitle}
				</div>
				<p class="hidden text-[11px] opacity-60 sm:block">{data.taskId} · {data.sourceCorpus}</p>
			</div>
		</div>
		<div class="flex items-center gap-2 text-xs">
			<span class="hidden sm:inline">{status}</span><span
				aria-live="polite"
				class:!text-error={!!saveError}>{saveState}</span
			><button
				class="daisy-btn daisy-btn-ghost daisy-btn-xs"
				onclick={() => {
					overflowOpen = true;
				}}>More</button
			>
		</div>
	</header>
	{#if poseError}<div role="alert" class="daisy-alert daisy-alert-error m-2">{poseError}</div>{/if}
	{#if saveError}<div role="alert" class="daisy-alert daisy-alert-error m-2 text-sm">
			{saveError}<button
				class="daisy-btn daisy-btn-sm"
				onclick={() => {
					saveChain = Promise.resolve();
					void flushSave();
				}}>Retry</button
			>
		</div>{/if}
	<div class="flex min-h-0 flex-1 flex-col lg:flex-row">
		<section class="bg-neutral text-neutral-content flex min-h-0 flex-1 flex-col items-center">
			<div class="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden">
				<div
					bind:this={stage}
					class="relative h-full w-full touch-none overflow-hidden"
					onpointerdown={pointerDown}
					onpointermove={pointerMove}
					onpointerup={pointerUp}
					onpointercancel={pointerUp}
					role="img"
					aria-label="Video pose overlay. Drag a landmark to correct it; pinch to zoom."
				>
					<div
						class="absolute inset-0"
						style:transform={`translate(${panX}px, ${panY}px) scale(${zoom})`}
					>
						<!-- The local annotation manifest has no caption track for these source clips. -->
						<!-- svelte-ignore a11y_media_has_caption -->
						<video
							bind:this={video}
							src={`${source}/video`}
							preload="metadata"
							playsinline
							class="absolute inset-0 h-full w-full object-contain"
							onloadedmetadata={() => seek(frame)}
							ontimeupdate={() => {
								if (video && !video.paused) {
									frame = Math.min(maxFrame, Math.floor(video.currentTime * data.fps));
									draw();
								}
							}}
							onended={() => {
								playing = false;
								seek(maxFrame);
							}}
							aria-label="Source video for frame correction"
						></video>
						<canvas
							bind:this={canvas}
							class="pointer-events-none absolute inset-0 h-full w-full"
							aria-hidden="true"
						></canvas>
					</div>
				</div>
				{#if zoom > 1}<button
						class="daisy-btn daisy-btn-xs absolute top-2 right-2"
						onclick={() => {
							zoom = 1;
							panX = 0;
							panY = 0;
						}}>Reset zoom</button
					>{/if}
			</div>
			<div
				class="border-neutral-content/20 bg-neutral w-full shrink-0 border-t px-2 py-2 pb-[max(.5rem,env(safe-area-inset-bottom))]"
			>
				<div class="mb-1 flex h-1.5 overflow-hidden rounded-full" aria-hidden="true">
					{#each frameBands as band}<span
							class={band.label === 'flawed'
								? 'bg-warning'
								: band.label === 'unusable'
									? 'bg-error'
									: 'bg-neutral-content/30'}
							style:width={`${(band.count / data.frameCount) * 100}%`}
						></span>{/each}
				</div>
				<div class="flex items-center gap-2 text-xs">
					<span class="min-w-19 tabular-nums">{frame} / {maxFrame}</span><input
						class="daisy-range daisy-range-xs grow"
						type="range"
						min="0"
						max={maxFrame}
						value={frame}
						aria-label="Current frame"
						oninput={(event) => {
							seek(Number(event.currentTarget.value));
							if (status === 'started') scheduleSave('started', 1000);
						}}
					/><span class="hidden tabular-nums sm:inline">{(frame / data.fps).toFixed(1)} s</span>
				</div>
				<div class="mt-2 flex items-center justify-between gap-1">
					<button
						class="daisy-btn daisy-btn-sm min-w-10"
						onclick={() => step(-1)}
						aria-label="Previous frame">‹</button
					>
					<button
						class="daisy-btn daisy-btn-sm min-w-10"
						onclick={togglePlay}
						aria-label={playing ? 'Pause' : 'Play slowly'}>{playing ? 'Ⅱ' : '▶'}</button
					>
					<button
						class="daisy-btn daisy-btn-sm min-w-10"
						onclick={() => step(1)}
						aria-label={frame === maxFrame ? 'Complete case' : 'Next frame'}
						>{frame === maxFrame ? 'Done' : '›'}</button
					>
					<span class="border-neutral-content/30 mx-1 hidden h-6 border-l md:block"></span>
					<button
						class="daisy-btn daisy-btn-sm"
						class:daisy-btn-warning={currentLabel === 'unusable'}
						onclick={() => setLabel('unusable')}
						aria-pressed={currentLabel === 'unusable'}>Unusable</button
					>
					<button
						class="daisy-btn daisy-btn-sm"
						class:daisy-btn-warning={currentLabel === 'flawed'}
						onclick={() => setLabel('flawed')}
						aria-pressed={currentLabel === 'flawed'}>Flawed</button
					>
					<button
						class="daisy-btn daisy-btn-sm"
						class:daisy-btn-success={currentLabel === 'good'}
						onclick={() => setLabel('good')}
						aria-pressed={currentLabel === 'good'}>Good</button
					>
				</div>
			</div>
		</section>
		<aside
			class="border-base-300 bg-base-100 hidden min-h-0 w-86 shrink-0 flex-col gap-3 overflow-y-auto border-l p-3 lg:flex"
		>
			<div class="flex items-center justify-between">
				<h2 class="font-semibold">Frame {frame}</h2>
				<span class="daisy-badge daisy-badge-sm"
					>{currentLabel}{corrected ? ' · corrected' : ''}</span
				>
			</div>
			<p class="text-xs opacity-70">
				Mark only errors. Unmarked frames are Good unless the pose is missing.
			</p>
			<div class="flex gap-1">
				<button class="daisy-btn daisy-btn-xs" onclick={() => step(-5)}>−5</button><button
					class="daisy-btn daisy-btn-xs"
					onclick={() => step(5)}>+5</button
				><button
					class="daisy-btn daisy-btn-xs"
					onclick={() => {
						showPose = !showPose;
						draw();
					}}>{showPose ? 'Hide' : 'Show'} pose</button
				><select class="daisy-select daisy-select-xs" aria-label="Playback speed" bind:value={speed}
					><option value={0.25}>0.25×</option><option value={0.5}>0.5×</option><option value={1}
						>1×</option
					></select
				>
			</div>
			<div class="text-xs">
				{countFlawed} flawed · {countUnusable} unusable · {marks.length} marks
			</div>
			<h3 class="text-sm font-semibold">Landmark timeline</h3>
			<div class="space-y-1">
				{#each parts as part}
					<div class="grid grid-cols-[6rem_1fr] items-center gap-2 text-xs">
						<span class="truncate">{part.replaceAll('_', ' ').toLowerCase()}</span>
						<div
							class="bg-base-200 relative h-6 touch-none rounded"
							role="button"
							tabindex="0"
							aria-label={`Add ${part} mark at frame ${frame}`}
							onkeydown={(event) => {
								if (event.key === 'Enter') addRange(part, frame, frame);
							}}
							onpointerdown={(event) => {
								const rect = event.currentTarget.getBoundingClientRect();
								const start = Math.round(((event.clientX - rect.left) / rect.width) * maxFrame);
								const element = event.currentTarget;
								element.setPointerCapture(event.pointerId);
								const end = (up: PointerEvent) => {
									const finish = Math.round(((up.clientX - rect.left) / rect.width) * maxFrame);
									addRange(
										part,
										Math.max(0, Math.min(maxFrame, start)),
										Math.max(0, Math.min(maxFrame, finish))
									);
									element.removeEventListener('pointerup', end);
								};
								element.addEventListener('pointerup', end);
							}}
						>
							{#each marks
								.map((mark, index) => ({ mark, index }))
								.filter(({ mark }) => mark.body_part === part) as entry}<button
									class="bg-warning absolute top-1 h-4 min-w-2 rounded"
									style:left={`${(entry.mark.start_frame / Math.max(maxFrame, 1)) * 100}%`}
									style:width={`${Math.max(2, ((entry.mark.end_frame - entry.mark.start_frame + 1) / data.frameCount) * 100)}%`}
									title={`${part} frames ${entry.mark.start_frame}–${entry.mark.end_frame}`}
									onpointerdown={(event) => event.stopPropagation()}
									onclick={(event) => {
										event.stopPropagation();
										selectedMark = entry.index;
										detailDialog.showModal();
									}}
									aria-label={`Edit ${part} mark frames ${entry.mark.start_frame} to ${entry.mark.end_frame}`}
								></button>{/each}
							<span
								class="bg-base-content pointer-events-none absolute top-0 bottom-0 w-px"
								style:left={`${(frame / Math.max(maxFrame, 1)) * 100}%`}
							></span>
						</div>
					</div>
				{/each}
			</div>
			{#if currentMarks.length}<div class="space-y-1">
					<h3 class="text-sm font-semibold">At this frame</h3>
					{#each currentMarks as entry}<button
							class="daisy-btn daisy-btn-sm w-full justify-start"
							onclick={() => {
								selectedMark = entry.index;
								detailDialog.showModal();
							}}
							>{entry.mark.body_part.replaceAll('_', ' ').toLowerCase()} · {entry.mark
								.start_frame}–{entry.mark.end_frame}</button
						>{/each}
				</div>{/if}
			<label class="daisy-label text-sm" for="frame-note">Case note</label><textarea
				id="frame-note"
				class="daisy-textarea daisy-textarea-sm w-full"
				rows="3"
				maxlength="500"
				bind:value={note}
				oninput={() => scheduleSave()}
			></textarea>
			<div class="mt-auto flex gap-2">
				<button
					class="daisy-btn daisy-btn-primary daisy-btn-sm"
					onclick={() => confirmDialog.showModal()}>Complete case</button
				><button
					class="daisy-btn daisy-btn-sm"
					onclick={() => {
						overflowOpen = true;
					}}>More</button
				>
			</div>
		</aside>
	</div>
</main>

{#if overflowOpen}
	<div
		class="fixed inset-0 z-40 flex items-end justify-center bg-black/50 lg:items-center"
		role="presentation"
		onclick={(event) => {
			if (event.target === event.currentTarget) overflowOpen = false;
		}}
	>
		<div
			class="bg-base-100 max-h-[85dvh] w-full max-w-lg space-y-3 overflow-y-auto rounded-t-xl p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:rounded-xl"
			role="dialog"
			aria-modal="true"
			aria-label="Frame review tools"
		>
			<div class="flex items-center justify-between">
				<h2 class="font-semibold">Review tools</h2>
				<button
					class="daisy-btn daisy-btn-sm"
					onclick={() => {
						overflowOpen = false;
					}}>Close</button
				>
			</div>
			<div class="flex flex-wrap gap-2">
				<button class="daisy-btn daisy-btn-sm" onclick={() => step(-5)}>−5 frames</button><button
					class="daisy-btn daisy-btn-sm"
					onclick={() => step(5)}>+5 frames</button
				><button
					class="daisy-btn daisy-btn-sm"
					onclick={() => {
						showPose = !showPose;
						draw();
					}}>{showPose ? 'Hide' : 'Show'} pose</button
				><select class="daisy-select daisy-select-sm" aria-label="Playback speed" bind:value={speed}
					><option value={0.25}>0.25×</option><option value={0.5}>0.5×</option><option value={1}
						>1×</option
					></select
				>
			</div>
			<p class="text-xs opacity-70">
				{countFlawed} flawed · {countUnusable} unusable · {marks.length} landmark marks. Tap a landmark
				in the video to mark it; drag to correct its position.
			</p>
			<div>
				<h3 class="mb-1 text-sm font-semibold">Marks at this frame</h3>
				{#if currentMarks.length}{#each currentMarks as entry}<button
							class="daisy-btn daisy-btn-sm mr-1 mb-1"
							onclick={() => {
								selectedMark = entry.index;
								detailDialog.showModal();
							}}>{entry.mark.body_part.replaceAll('_', ' ').toLowerCase()}</button
						>{/each}{:else}<p class="text-xs opacity-60">No landmark marks here.</p>{/if}
			</div>
			<details class="daisy-collapse rounded-box border-base-300 border">
				<summary class="daisy-collapse-title text-sm font-semibold">Landmark timeline</summary>
				<div class="daisy-collapse-content space-y-1">
					{#each parts as part}<div class="grid grid-cols-[6rem_1fr] items-center gap-2 text-xs">
							<span class="truncate">{part.replaceAll('_', ' ').toLowerCase()}</span><button
								class="bg-base-200 relative h-6 rounded text-left"
								aria-label={`Mark ${part} at frame ${frame}`}
								onclick={() => addRange(part, frame, frame)}
								>{#each marks
									.map((mark, index) => ({ mark, index }))
									.filter(({ mark }) => mark.body_part === part) as entry}<span
										class="bg-warning pointer-events-none absolute top-1 h-4 min-w-2 rounded"
										style:left={`${(entry.mark.start_frame / Math.max(maxFrame, 1)) * 100}%`}
										style:width={`${Math.max(2, ((entry.mark.end_frame - entry.mark.start_frame + 1) / data.frameCount) * 100)}%`}
									></span>{/each}<span
									class="bg-base-content pointer-events-none absolute top-0 bottom-0 w-px"
									style:left={`${(frame / Math.max(maxFrame, 1)) * 100}%`}
								></span></button
							>
						</div>{/each}
				</div>
			</details>
			<label class="daisy-label" for="mobile-note">Case note</label><textarea
				id="mobile-note"
				class="daisy-textarea w-full"
				rows="2"
				maxlength="500"
				bind:value={note}
				oninput={() => scheduleSave()}
			></textarea>
			<div class="flex flex-wrap gap-2">
				<button
					class="daisy-btn daisy-btn-primary daisy-btn-sm"
					onclick={() => {
						overflowOpen = false;
						confirmDialog.showModal();
					}}>Complete case</button
				><button
					class="daisy-btn daisy-btn-sm"
					onclick={() => {
						void flushSave();
					}}>Save now</button
				><a class="daisy-btn daisy-btn-sm" href="/research/frames">Queue</a>
			</div>
		</div>
	</div>
{/if}

<dialog bind:this={detailDialog} class="daisy-modal daisy-modal-bottom sm:daisy-modal-middle">
	{#if selectedMark !== null && marks[selectedMark]}
		<div class="daisy-modal-box space-y-3">
			<h2 class="font-semibold">
				{marks[selectedMark].body_part.replaceAll('_', ' ').toLowerCase()} · frames {marks[
					selectedMark
				].start_frame}–{marks[selectedMark].end_frame}
			</h2>
			<div class="flex gap-3">
				<fieldset class="daisy-fieldset">
					<label class="daisy-label" for="mark-start">Start frame</label><input
						id="mark-start"
						class="daisy-input daisy-input-sm w-25"
						type="number"
						min="0"
						max={marks[selectedMark].end_frame}
						value={marks[selectedMark].start_frame}
						onchange={(event) =>
							changeMarkRange(selectedMark!, 'start_frame', Number(event.currentTarget.value))}
					/>
				</fieldset>
				<fieldset class="daisy-fieldset">
					<label class="daisy-label" for="mark-end">End frame</label><input
						id="mark-end"
						class="daisy-input daisy-input-sm w-25"
						type="number"
						min={marks[selectedMark].start_frame}
						max={maxFrame}
						value={marks[selectedMark].end_frame}
						onchange={(event) =>
							changeMarkRange(selectedMark!, 'end_frame', Number(event.currentTarget.value))}
					/>
				</fieldset>
			</div>
			<fieldset class="daisy-fieldset">
				<legend class="daisy-fieldset-legend">Likely cause</legend>
				<div class="flex flex-wrap gap-1">
					{#each causes as cause}<button
							class="daisy-btn daisy-btn-sm"
							class:daisy-btn-primary={marks[selectedMark].causes.includes(cause)}
							onclick={() => toggleCause(selectedMark!, cause)}
							aria-pressed={marks[selectedMark].causes.includes(cause)}
							>{cause.replaceAll('_', ' ')}</button
						>{/each}
				</div>
			</fieldset>
			<label class="daisy-label" for="mark-note">Mark note</label><textarea
				id="mark-note"
				class="daisy-textarea w-full"
				rows="2"
				maxlength="500"
				value={marks[selectedMark].note}
				oninput={(event) => {
					marks[selectedMark!].note = event.currentTarget.value;
					marks = [...marks];
					scheduleSave();
				}}
			></textarea>
			<div class="daisy-modal-action">
				<button
					class="daisy-btn daisy-btn-error daisy-btn-sm"
					onclick={() => {
						marks = marks.filter((_, index) => index !== selectedMark);
						selectedMark = null;
						detailDialog.close();
						scheduleSave();
						draw();
					}}>Remove mark</button
				><button class="daisy-btn daisy-btn-sm" onclick={() => detailDialog.close()}>Done</button>
			</div>
		</div>
	{/if}
</dialog>

<dialog bind:this={confirmDialog} class="daisy-modal daisy-modal-bottom sm:daisy-modal-middle">
	<div class="daisy-modal-box">
		<h2 class="text-lg font-semibold">Finish this case?</h2>
		<p class="py-2 text-sm">
			Sparse marks and corrected landmarks are saved in the original annotation history. Unmarked
			frames remain Good unless the pose is missing.
		</p>
		<div class="daisy-modal-action flex-wrap">
			<button class="daisy-btn daisy-btn-sm" onclick={() => confirmDialog.close()}
				>Keep reviewing</button
			><button class="daisy-btn daisy-btn-sm" onclick={() => void finish('skipped')}>Skip</button
			><button
				class="daisy-btn daisy-btn-sm daisy-btn-warning"
				onclick={() => void finish('unusable')}>Give up · video unusable</button
			><button
				class="daisy-btn daisy-btn-sm daisy-btn-primary"
				onclick={() => void finish('completed')}>Complete</button
			>
		</div>
	</div>
</dialog>
