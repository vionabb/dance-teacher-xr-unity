<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { page } from '$app/state';
	import { get } from 'svelte/store';
	import { navbarProps } from '$lib/elements/NavBar.svelte';
	import {
		compareQijiaFrame,
		parseLegacyReferencePoseCsv,
		parseRawPoseCsv,
		pairFramesByRowIndex,
		participantVideoTimeForRow,
		QIJIA_COLORS,
		getQijiaPoseCrop,
		resolvePoseFrameAtTime,
		UPPER_SKELETON_EDGES,
		type InspectorFrame
	} from '$lib/ai/motionmetrics/qijia2d-inspector';
	import { PoseLandmarkKeysUpperSnakeCase } from '$lib/webcam/mediapipe-utils';

	type Clip = {
		url: string;
		name: string;
		frames: Map<number, InspectorFrame>;
		fps: number;
		video: HTMLVideoElement | undefined;
	};
	let participant = $state<Clip>({
		url: '',
		name: '',
		frames: new Map(),
		fps: 30,
		video: undefined
	});
	let reference = $state<Clip>({ url: '', name: '', frames: new Map(), fps: 30, video: undefined });
	let frameIndex = $state(0);
	let offsetSeconds = $state(0);
	let selectedVector = $state(-1);
	let error = $state('');
	let demo = $state(false);
	type DatasetSegment = { id: string; clipNumber: number; referencePoseAvailable: boolean };
	type DatasetPerformance = {
		id: string;
		participantLabel: string;
		study: string;
		danceName: string;
		condition: string;
		phase: string | null;
		segments: DatasetSegment[];
	};
	let view = $state<'dataset' | 'performance' | 'segment' | 'review'>(
		page.url.searchParams.get('source') === 'local' ? 'review' : 'dataset'
	);
	let datasetPerformances = $state<DatasetPerformance[]>([]);
	let selectedPerformance = $state<DatasetPerformance | null>(null);
	let candidateSegment = $state<DatasetSegment | null>(null);
	let selectedSegment = $state<DatasetSegment | null>(null);
	let datasetLoading = $state(true);
	let datasetError = $state('');
	let datasetUnavailable = $state(false);
	let datasetFrameCount = $state(0);
	let studyFilter = $state('all');
	let danceFilter = $state('all');
	let participantSearch = $state('');
	let segmentLoadToken = 0;
	let segmentLoadController: AbortController | null = null;
	const datasetMode = $derived(Boolean(selectedSegment));
	const danceOptions = $derived(
		[...new Set(datasetPerformances.map((performance) => performance.danceName))].sort()
	);
	const filteredPerformances = $derived.by(() => {
		const query = participantSearch.trim().toLowerCase();
		return datasetPerformances.filter(
			(performance) =>
				(studyFilter === 'all' || performance.study === studyFilter) &&
				(danceFilter === 'all' || performance.danceName === danceFilter) &&
				(!query || performance.participantLabel.toLowerCase().includes(query))
		);
	});

	const frameNumbers = $derived([...participant.frames.keys()].sort((a, b) => a - b));
	const referenceFrameNumbers = $derived([...reference.frames.keys()].sort((a, b) => a - b));
	const participantFrame = $derived(participant.frames.get(frameIndex));
	const referenceSample = $derived(
		datasetMode
			? {
					targetFrame: frameIndex,
					frame: reference.frames.get(frameIndex) ?? null,
					carried: false
				}
			: resolvePoseFrameAtTime(
					reference.frames,
					frameIndex / participant.fps + offsetSeconds,
					reference.fps,
					referenceFrameNumbers
				)
	);
	const referenceFrameIndex = $derived(referenceSample.targetFrame);
	const referenceFrame = $derived(referenceSample.frame ?? undefined);
	const comparison = $derived(
		participantFrame && referenceFrame ? compareQijiaFrame(referenceFrame, participantFrame) : null
	);
	const maxFrame = $derived(
		datasetMode ? Math.max(0, datasetFrameCount - 1) : (frameNumbers.at(-1) ?? 0)
	);
	const duration = $derived(maxFrame / participant.fps);
	const series = $derived(
		(datasetMode
			? Array.from({ length: datasetFrameCount }, (_, frame) => frame)
			: frameNumbers
		).map((f) => {
			if (datasetMode) {
				const p = participant.frames.get(f);
				const r = reference.frames.get(f);
				return p && r ? { frame: f, sum: compareQijiaFrame(r, p).sum } : { frame: f, sum: null };
			}
			const resolved = resolvePoseFrameAtTime(
				reference.frames,
				f / participant.fps + offsetSeconds,
				reference.fps,
				referenceFrameNumbers
			);
			const p = participant.frames.get(f);
			return p && resolved.frame
				? { frame: f, sum: compareQijiaFrame(resolved.frame, p).sum }
				: { frame: f, sum: null };
		})
	);
	const chartMax = $derived.by(() => {
		const peak = Math.max(0, ...series.map((point) => point.sum ?? 0));
		return Math.max(1, Math.min(16, Math.ceil(peak * 2) / 2));
	});
	const participantCrop = $derived(
		getQijiaPoseCrop(
			participantFrame,
			participant.video?.videoWidth,
			participant.video?.videoHeight
		)
	);
	const referenceCrop = $derived(
		getQijiaPoseCrop(referenceFrame, reference.video?.videoWidth, reference.video?.videoHeight)
	);
	const plot = $derived.by(() => {
		const valid = series.filter((point) => point.sum !== null);
		if (valid.length < 2) return '';
		return valid
			.map(
				(point) =>
					`${maxFrame ? (point.frame / maxFrame) * 100 : 0},${100 - (point.sum! / chartMax) * 100}`
			)
			.join(' ');
	});

	function displayDance(name: string) {
		return name
			.split('-')
			.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
			.join(' ');
	}
	function phaseLabel(phase: string | null) {
		return phase ? phase.charAt(0).toUpperCase() + phase.slice(1) : 'Segmented';
	}
	async function loadDataset() {
		datasetLoading = true;
		datasetError = '';
		datasetUnavailable = false;
		try {
			const response = await fetch('/api/dev/participant-catalog', { cache: 'no-store' });
			if (!response.ok) throw new Error(`Dataset catalog request failed (${response.status}).`);
			const result = (await response.json()) as { performances: DatasetPerformance[] };
			datasetPerformances = result.performances;
			datasetUnavailable = datasetPerformances.length === 0;
		} catch (caught) {
			datasetError =
				caught instanceof Error ? caught.message : 'Could not load the local dataset catalog.';
		} finally {
			datasetLoading = false;
		}
	}
	async function openDatasetSegment(segment: DatasetSegment) {
		if (!segment.referencePoseAvailable) return;
		segmentLoadController?.abort();
		const controller = new AbortController();
		segmentLoadController = controller;
		const requestToken = ++segmentLoadToken;
		selectedSegment = segment;
		datasetLoading = true;
		error = '';
		try {
			const base = `/api/dev/participant-catalog/${segment.id}`;
			const [videoResponse, participantResponse, referenceResponse] = await Promise.all([
				fetch(`${base}/video`, { method: 'HEAD', cache: 'no-store', signal: controller.signal }),
				fetch(`${base}/pose`, { cache: 'no-store', signal: controller.signal }),
				fetch(`${base}/reference-pose`, { cache: 'no-store', signal: controller.signal })
			]);
			if (requestToken !== segmentLoadToken) return;
			if (!videoResponse.ok || !participantResponse.ok || !referenceResponse.ok) {
				throw new Error(
					'This segment could not be loaded from the local dataset. Refresh the catalog and try again.'
				);
			}
			const [participantCsv, referenceCsv] = await Promise.all([
				participantResponse.text(),
				referenceResponse.text()
			]);
			const paired = pairFramesByRowIndex(
				parseRawPoseCsv(participantCsv),
				parseLegacyReferencePoseCsv(referenceCsv)
			);
			if (requestToken !== segmentLoadToken) return;
			if (!paired.frameCount)
				throw new Error('The participant and reference pose files contain no alignable rows.');
			participant = {
				url: `${base}/video`,
				name: 'Participant video',
				frames: paired.participantFrames,
				fps: 30,
				video: undefined
			};
			reference = {
				url: '',
				name: 'Reference pose only',
				frames: paired.referenceFrames,
				fps: 30,
				video: undefined
			};
			datasetFrameCount = paired.frameCount;
			frameIndex = 0;
			offsetSeconds = 0;
			selectedVector = -1;
			demo = false;
			view = 'review';
		} catch (caught) {
			if (requestToken !== segmentLoadToken) return;
			if (caught instanceof DOMException && caught.name === 'AbortError') return;
			selectedSegment = null;
			error = caught instanceof Error ? caught.message : 'Could not load this segment.';
		} finally {
			if (requestToken === segmentLoadToken) {
				datasetLoading = false;
				segmentLoadController = null;
			}
		}
	}
	function cancelSegmentLoad() {
		segmentLoadToken++;
		segmentLoadController?.abort();
		segmentLoadController = null;
		datasetLoading = false;
	}
	function returnToDataset() {
		cancelSegmentLoad();
		selectedPerformance = null;
		candidateSegment = null;
		selectedSegment = null;
		datasetFrameCount = 0;
		view = 'dataset';
	}
	function showPerformance(performance: DatasetPerformance) {
		cancelSegmentLoad();
		selectedPerformance = performance;
		candidateSegment = null;
		view = 'performance';
	}
	function showSegment(segment: DatasetSegment) {
		cancelSegmentLoad();
		candidateSegment = segment;
		view = 'segment';
	}
	function returnToPerformance() {
		cancelSegmentLoad();
		view = 'performance';
	}

	onMount(() => {
		const previousNav = get(navbarProps);
		navbarProps.set({
			collapsed: false,
			pageTitle: 'Qijia2D inspector',
			back: { url: '/research', title: 'Metrics' },
			hideSettings: true
		});
		if (view === 'dataset') void loadDataset();
		return () => navbarProps.set(previousNav);
	});

	function setClip(side: 'participant' | 'reference', file?: File) {
		if (!file) return;
		const clip = side === 'participant' ? participant : reference;
		if (file.type.startsWith('video/')) {
			if (clip.url) URL.revokeObjectURL(clip.url);
			const next = { ...clip, url: URL.createObjectURL(file), name: 'Video loaded' };
			if (side === 'participant') participant = next;
			else reference = next;
		} else {
			void file.text().then((text) => {
				try {
					const next = { ...clip, name: 'Pose CSV loaded', frames: parseRawPoseCsv(text) };
					if (side === 'participant') {
						participant = next;
						frameIndex = [...next.frames.keys()].sort((a, b) => a - b)[0] ?? 0;
					} else reference = next;
					error = '';
				} catch (e) {
					error = e instanceof Error ? e.message : 'Could not read pose CSV.';
				}
			});
		}
	}
	function seek(frame: number) {
		frameIndex = Math.max(0, Math.min(maxFrame, frame));
		const participantTime = participantVideoTimeForRow(
			participant.frames,
			frameIndex,
			participant.fps
		);
		const refTime = participantTime + offsetSeconds;
		if (participant.video && participant.video.readyState >= 1)
			participant.video.currentTime = participantTime;
		if (!datasetMode && reference.video && reference.video.readyState >= 1)
			reference.video.currentTime = Math.max(0, refTime);
	}
	function loaded(side: 'participant' | 'reference', event: Event) {
		const video = event.currentTarget as HTMLVideoElement;
		const target = side === 'participant' ? participant : reference;
		if (side === 'participant') participant = { ...target, video };
		else reference = { ...target, video };
		if (side === 'participant') seek(frameIndex);
	}
	function landmarkLabel(index: number) {
		return (
			PoseLandmarkKeysUpperSnakeCase[index]?.replaceAll('_', ' ').toLowerCase() ?? `point ${index}`
		);
	}
	function hasOutOfBoundsLandmarks(frame: InspectorFrame | undefined, clip: Clip) {
		if (!frame || !clip.video?.videoWidth || !clip.video?.videoHeight) return false;
		return frame.landmarks.some(
			(point) =>
				(Number.isFinite(point.x) && (point.x < -2 || point.x > clip.video!.videoWidth + 2)) ||
				(Number.isFinite(point.y) && (point.y < -2 || point.y > clip.video!.videoHeight + 2))
		);
	}
	function demoFrames() {
		const make = (elbow: number, wrist: number) => {
			const values = Array.from({ length: 33 }, (_, i) => ({
				x: 320 + (i % 2 ? 1 : -1) * 2,
				y: 100 + i * 5,
				dist_from_camera: 0,
				visibility: 1
			}));
			values[11] = { x: 260, y: 180, dist_from_camera: 0, visibility: 1 };
			values[12] = { x: 380, y: 180, dist_from_camera: 0, visibility: 1 };
			values[13] = { x: 220, y: elbow, dist_from_camera: 0, visibility: 1 };
			values[15] = { x: 200, y: wrist, dist_from_camera: 0, visibility: 1 };
			values[14] = { x: 420, y: elbow, dist_from_camera: 0, visibility: 1 };
			values[16] = { x: 440, y: wrist, dist_from_camera: 0, visibility: 1 };
			values[23] = { x: 280, y: 350, dist_from_camera: 0, visibility: 1 };
			values[24] = { x: 360, y: 350, dist_from_camera: 0, visibility: 1 };
			return values;
		};
		const ref = make(250, 330),
			user = make(270, 300);
		// Ensure elbows/wrists point to the matching side while giving a visible angular difference.
		const frames = (landmarks: typeof ref, phase: number, amplitude: number) =>
			new Map(
				Array.from({ length: 90 }, (_, frame) => {
					const l = landmarks.map((p) => ({ ...p }));
					const wave = Math.sin(frame / 8 + phase) * amplitude;
					for (const [shoulder, elbow, wrist, side] of [
						[11, 13, 15, -1],
						[12, 14, 16, 1]
					] as const) {
						const origin = l[shoulder];
						const upperAngle = Math.PI / 2 + side * wave * 0.55;
						const forearmAngle = Math.PI / 2 + side * (wave * 0.55 + 0.35);
						l[elbow] = {
							...l[elbow],
							x: origin.x + Math.cos(upperAngle) * 92,
							y: origin.y + Math.sin(upperAngle) * 92
						};
						l[wrist] = {
							...l[wrist],
							x: l[elbow].x + Math.cos(forearmAngle) * 96,
							y: l[elbow].y + Math.sin(forearmAngle) * 96
						};
					}
					return [frame, { frame, landmarks: l }];
				})
			);
		participant = {
			...participant,
			name: 'Synthetic participant',
			frames: frames(user, 0.6, 0.55),
			fps: 30
		};
		reference = {
			...reference,
			name: 'Synthetic reference',
			frames: frames(ref, 0, 0.22),
			fps: 30
		};
		frameIndex = 0;
		demo = true;
	}
	function setFps(side: 'participant' | 'reference', fps: number) {
		if (!Number.isFinite(fps) || fps <= 0) return;
		if (side === 'participant') participant = { ...participant, fps };
		else reference = { ...reference, fps };
		seek(frameIndex);
	}
	onDestroy(() => {
		segmentLoadController?.abort();
		if (participant.url) URL.revokeObjectURL(participant.url);
		if (reference.url) URL.revokeObjectURL(reference.url);
	});
</script>

<svelte:head>
	<title>Qijia2D frame inspector</title>
	<meta
		name="description"
		content="Inspect the frame-by-frame Qijia2D pose similarity calculation locally."
	/>
</svelte:head>

<main class="mx-auto max-w-[1500px] space-y-5 px-4 py-6 lg:px-8">
	<header class="flex flex-wrap items-end justify-between gap-4">
		<div>
			<p class="text-primary text-xs font-bold tracking-[.18em] uppercase">Metric workbench</p>
			<h1 class="mt-1 text-3xl font-bold">Qijia2D frame inspector</h1>
			<p class="mt-1 max-w-2xl text-sm opacity-70">
				Compare eight upper body unit vectors frame by frame. Dataset media stays on this machine.
			</p>
		</div>
		<div class="daisy-badge daisy-badge-outline daisy-badge-lg">Local only · no upload</div>
	</header>

	{#if view !== 'review'}
		<nav class="flex flex-wrap items-center gap-2 text-sm" aria-label="Explorer steps">
			<button
				class="daisy-btn daisy-btn-sm"
				class:daisy-btn-primary={view === 'dataset'}
				onclick={returnToDataset}>Dataset explorer</button
			>
			<span aria-hidden="true" class="opacity-40">›</span>
			<button
				class="daisy-btn daisy-btn-sm"
				disabled={!selectedPerformance}
				class:daisy-btn-primary={view === 'performance'}
				onclick={() => selectedPerformance && showPerformance(selectedPerformance)}
				>Performance</button
			>
			<span aria-hidden="true" class="opacity-40">›</span>
			<button
				class="daisy-btn daisy-btn-sm"
				disabled={!candidateSegment}
				class:daisy-btn-primary={view === 'segment'}
				onclick={() => candidateSegment && showSegment(candidateSegment)}>Segment</button
			>
			<span aria-hidden="true" class="opacity-40">›</span>
			<span class="daisy-badge daisy-badge-ghost">Frame review</span>
		</nav>

		{#if view === 'dataset'}
			<section class="daisy-card border-base-300 bg-base-100 border shadow-sm">
				<div class="daisy-card-body gap-4">
					<div class="flex flex-wrap items-end justify-between gap-3">
						<div>
							<h2 class="daisy-card-title">Dataset explorer</h2>
							<p class="text-sm opacity-70">
								Choose a performance, then inspect one of its pose segments.
							</p>
						</div>
						<a class="daisy-btn daisy-btn-outline daisy-btn-sm" href="/research">Metric selector</a>
					</div>
					{#if datasetLoading}
						<div class="flex items-center gap-3 py-6" role="status">
							<span class="daisy-loading daisy-loading-spinner daisy-loading-md"></span>Reading
							local catalog…
						</div>
					{:else if datasetError}
						<div class="daisy-alert daisy-alert-error" role="alert">
							<span>{datasetError}</span><button
								class="daisy-btn daisy-btn-sm"
								onclick={loadDataset}>Retry</button
							>
						</div>
					{:else if datasetUnavailable}
						<div class="rounded-box bg-base-200/70 border-base-300 space-y-2 border p-5">
							<h3 class="font-semibold">No paired participant data found</h3>
							<p class="max-w-2xl text-sm opacity-75">
								The local cache may be missing, or no video currently has a matching canonical
								pose2d CSV. Set <code>MOTION_PIPELINE_USER_STUDY_DATA_DIR</code> to the participant cache
								root and restart the dev server.
							</p>
							<p class="text-xs opacity-60">
								Only files in the known study video and segmented pose folders are listed.
							</p>
							<a
								class="daisy-btn daisy-btn-outline daisy-btn-sm mt-2"
								href="/metrics/qijia2d?source=local">Use local files instead</a
							>
						</div>
					{:else}
						<div class="rounded-box bg-base-200/50 grid gap-3 p-3 sm:grid-cols-3">
							<label class="daisy-form-control">
								<span class="daisy-label-text text-xs">Search participant label</span>
								<input
									class="daisy-input daisy-input-bordered daisy-input-sm"
									type="search"
									placeholder="Participant 001"
									bind:value={participantSearch}
								/>
							</label>
							<label class="daisy-form-control">
								<span class="daisy-label-text text-xs">Study</span>
								<select
									class="daisy-select daisy-select-bordered daisy-select-sm"
									bind:value={studyFilter}
								>
									<option value="all">All studies</option><option value="study1">Study 1</option
									><option value="study2">Study 2</option>
								</select>
							</label>
							<label class="daisy-form-control">
								<span class="daisy-label-text text-xs">Dance</span>
								<select
									class="daisy-select daisy-select-bordered daisy-select-sm"
									bind:value={danceFilter}
								>
									<option value="all">All dances</option>
									{#each danceOptions as dance (dance)}<option value={dance}
											>{displayDance(dance)}</option
										>{/each}
								</select>
							</label>
						</div>
						<p class="text-xs opacity-65">
							Showing {filteredPerformances.length} of {datasetPerformances.length} performances.
						</p>
						<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
							{#each filteredPerformances as performance (performance.id)}
								<button
									class="daisy-card border-base-300 bg-base-100 hover:border-primary border text-left transition-colors"
									onclick={() => showPerformance(performance)}
								>
									<div class="daisy-card-body gap-2 p-4">
										<div class="flex items-center justify-between gap-2">
											<span class="daisy-badge daisy-badge-ghost"
												>{performance.study === 'study1' ? 'Study 1' : 'Study 2'}</span
											><span class="text-xs opacity-60">{performance.segments.length} segments</span
											>
										</div>
										<h3 class="font-semibold">
											{performance.participantLabel} · {displayDance(performance.danceName)}
										</h3>
										<p class="text-sm opacity-70">
											{performance.condition} · {phaseLabel(performance.phase)}
										</p>
									</div>
								</button>
							{/each}
							{#if filteredPerformances.length === 0}<p
									class="rounded-box bg-base-200 p-4 text-sm opacity-70"
								>
									No performances match these filters.
								</p>{/if}
						</div>
					{/if}
				</div>
			</section>
		{:else if view === 'performance' && selectedPerformance}
			<section class="daisy-card border-base-300 bg-base-100 border shadow-sm">
				<div class="daisy-card-body gap-4">
					<button
						class="daisy-btn daisy-btn-ghost daisy-btn-sm self-start"
						onclick={returnToDataset}>← All performances</button
					>
					<div>
						<p class="text-primary text-xs font-semibold uppercase">
							{selectedPerformance.study === 'study1' ? 'Study 1' : 'Study 2'} · {selectedPerformance.participantLabel}
						</p>
						<h2 class="daisy-card-title mt-1">{displayDance(selectedPerformance.danceName)}</h2>
						<p class="text-sm opacity-70">
							{selectedPerformance.condition} · {phaseLabel(selectedPerformance.phase)}
						</p>
					</div>
					<h3 class="font-semibold">Choose a segment</h3>
					<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						{#each selectedPerformance.segments as segment (segment.id)}
							<button
								class="daisy-card border-base-300 bg-base-100 hover:border-primary border text-left"
								onclick={() => showSegment(segment)}
							>
								<div class="daisy-card-body p-4">
									<h4 class="font-semibold">Segment {segment.clipNumber}</h4>
									<p class="text-xs opacity-70">Participant video and pose available</p>
									<span
										class="daisy-badge daisy-badge-sm"
										class:daisy-badge-success={segment.referencePoseAvailable}
										class:daisy-badge-warning={!segment.referencePoseAvailable}
										>{segment.referencePoseAvailable
											? 'Reference pose available'
											: 'Reference pose missing'}</span
									>
								</div>
							</button>
						{/each}
					</div>
				</div>
			</section>
		{:else if view === 'segment' && selectedPerformance && candidateSegment}
			<section class="daisy-card border-base-300 bg-base-100 border shadow-sm">
				<div class="daisy-card-body gap-4">
					<button
						class="daisy-btn daisy-btn-ghost daisy-btn-sm self-start"
						onclick={returnToPerformance}>← Segments</button
					>
					<div>
						<p class="text-primary text-xs font-semibold uppercase">
							{selectedPerformance.participantLabel} · {displayDance(selectedPerformance.danceName)}
						</p>
						<h2 class="daisy-card-title mt-1">Segment {candidateSegment.clipNumber}</h2>
					</div>
					<div class="grid gap-3 sm:grid-cols-2">
						<div class="rounded-box bg-base-200/60 p-4">
							<h3 class="font-semibold">Participant</h3>
							<p class="mt-1 text-sm opacity-70">
								Video and raw pose rows are paired by exact segment stem.
							</p>
						</div>
						<div class="rounded-box bg-base-200/60 p-4">
							<h3 class="font-semibold">Reference</h3>
							<p class="mt-1 text-sm opacity-70">
								{candidateSegment.referencePoseAvailable
									? 'A pose-only reference segment is available.'
									: 'No matching reference pose segment is available.'} No synchronized reference video
								is mapped for this clip.
							</p>
						</div>
					</div>
					<div class="daisy-alert daisy-alert-info text-sm">
						<span
							>Review pairs CSV rows by index, matching the current offline metric fixture, and
							truncates to the shorter pose sequence. Participant playback and reference pose timing
							are shown as separate contexts.</span
						>
					</div>
					<div class="daisy-card-actions">
						<button
							class="daisy-btn daisy-btn-primary"
							disabled={!candidateSegment.referencePoseAvailable || datasetLoading}
							onclick={() => candidateSegment && openDatasetSegment(candidateSegment)}
							>{datasetLoading ? 'Loading segment…' : 'Open frame review'}</button
						><button class="daisy-btn daisy-btn-ghost" onclick={returnToPerformance}>Back</button>
					</div>
					{#if error}<div class="daisy-alert daisy-alert-error" role="alert">{error}</div>{/if}
				</div>
			</section>
		{/if}
	{:else}
		{#if datasetMode}
			<section class="daisy-card border-info/40 bg-info/5 border shadow-sm">
				<div class="daisy-card-body gap-2 py-3">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<div>
							<h2 class="font-semibold">
								Dataset segment review · Segment {selectedSegment?.clipNumber}
							</h2>
							<p class="text-xs opacity-70">
								Offline fixture pairing: participant CSV row i ↔ reference pose CSV row i; truncated
								to {datasetFrameCount} shared rows.
							</p>
						</div>
						<button class="daisy-btn daisy-btn-outline daisy-btn-sm" onclick={returnToDataset}
							>Back to dataset</button
						>
					</div>
					<p class="text-xs opacity-70">
						Participant video seeks to the raw CSV source-frame column / 30 FPS. Reference is
						pose-only; its CSV row / 30 FPS and timestamp are separate display contexts and do not
						drive alignment. No reference video timing is inferred.
					</p>
				</div>
			</section>
		{/if}
		<section
			class="rounded-box border-base-300 bg-base-100 flex flex-wrap items-center justify-between gap-3 border px-4 py-3"
			aria-label="Metric selection"
		>
			<div>
				<h2 class="text-sm font-semibold">Metric visualization</h2>
				<p class="text-xs opacity-65">
					Qijia2D active · {datasetMode
						? `${selectedPerformance?.participantLabel ?? 'Participant'} · ${displayDance(selectedPerformance?.danceName ?? '')} · Segment ${selectedSegment?.clipNumber}`
						: 'Local file review'}
				</p>
			</div>
			<div
				class="daisy-tabs daisy-tabs-box"
				role="tablist"
				aria-label="Available metric visualizations"
			>
				<button class="daisy-tab daisy-tab-active" role="tab" aria-selected="true">Qijia2D</button>
				<button class="daisy-tab" role="tab" aria-disabled="true" disabled>Viona2D · planned</button
				>
				<button class="daisy-tab" role="tab" aria-disabled="true" disabled>3D · planned</button>
			</div>
		</section>

		<section
			class="daisy-card border-base-300 bg-base-100 border shadow-sm"
			aria-labelledby="math-title"
		>
			<div class="daisy-card-body gap-3 py-4 md:flex-row md:items-center md:justify-between">
				<div>
					<h2 id="math-title" class="daisy-card-title text-base">
						How the frame score is calculated
					</h2>
					<p class="text-sm opacity-75">
						For each landmark pair: <span class="font-mono">eᵢ = ‖uᵢ(ref) − uᵢ(person)‖₂</span>. Sum
						eight errors (0–16), average (0–2), then score
						<span class="font-mono">5 × (1 − mean / 2)</span> (0–5).
					</p>
				</div>
				{#if !datasetMode}<div class="flex flex-wrap gap-2">
						<button class="daisy-btn daisy-btn-primary daisy-btn-sm" onclick={demoFrames}
							>Load synthetic demo</button
						><span class="self-center text-xs opacity-60">Pose only · no video required</span>
					</div>{/if}
			</div>
		</section>

		{#if error}<div class="daisy-alert daisy-alert-error" role="alert">{error}</div>{/if}
		{#if !datasetMode}<section
				class="rounded-box border-base-300 bg-base-200/50 grid gap-3 border p-4 md:grid-cols-2"
				aria-label="Load local clips and pose data"
			>
				{#each [{ label: 'Participant', side: 'participant' as const, clip: participant }, { label: 'Reference', side: 'reference' as const, clip: reference }] as item (item.side)}
					<div class="rounded-box bg-base-100 p-3">
						<h2 class="mb-2 font-semibold">
							{item.label} files
							<span class="font-normal opacity-60">{item.clip.name && `· ${item.clip.name}`}</span>
						</h2>
						<div class="grid gap-2 sm:grid-cols-2">
							<label class="daisy-form-control"
								><span class="daisy-label-text mb-1">Video (optional)</span><input
									class="daisy-file-input daisy-file-input-bordered daisy-file-input-sm w-full"
									type="file"
									accept="video/*"
									aria-label={`${item.label} video`}
									onchange={(event) => setClip(item.side, event.currentTarget.files?.[0])}
								/></label
							>
							<label class="daisy-form-control"
								><span class="daisy-label-text mb-1">Raw pose2d CSV</span><input
									class="daisy-file-input daisy-file-input-bordered daisy-file-input-sm w-full"
									type="file"
									accept=".csv,text/csv"
									aria-label={`${item.label} raw pose2d CSV`}
									onchange={(event) => setClip(item.side, event.currentTarget.files?.[0])}
								/></label
							>
						</div>
						<label class="daisy-label mt-1 flex justify-start gap-2"
							><span class="daisy-label-text">FPS</span><input
								class="daisy-input daisy-input-bordered daisy-input-xs w-20"
								type="number"
								min="0.1"
								max="240"
								step="0.1"
								value={item.clip.fps}
								oninput={(event) => setFps(item.side, event.currentTarget.valueAsNumber)}
								aria-label={`${item.label} frames per second`}
							/></label
						>
						{#if item.side === 'reference'}<p class="text-[11px] opacity-60">
								Reference samples floor(time × FPS) and carries the latest earlier CSV row.
							</p>{/if}
					</div>
				{/each}
				<label class="daisy-form-control max-w-xs"
					><span class="daisy-label-text">Reference time offset (seconds)</span><input
						class="daisy-input daisy-input-bordered daisy-input-sm"
						type="number"
						step="0.01"
						bind:value={offsetSeconds}
						oninput={() => seek(frameIndex)}
						aria-describedby="offset-help"
					/></label
				>
				<p id="offset-help" class="max-w-2xl self-center text-xs opacity-65">
					Positive offset advances the reference time. Both clips are sampled by FPS; this assumes
					constant frame rate and does not correct variable-frame-rate timing.
				</p>
				{#if demo}<button
						class="daisy-btn daisy-btn-ghost daisy-btn-sm self-end justify-self-start"
						onclick={() => (demo = false)}>Synthetic pose demo loaded</button
					>{/if}
			</section>{/if}

		<section class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
			<div class="grid min-w-0 gap-4 md:grid-cols-2">
				{#each [{ side: 'participant' as const, label: 'Participant', clip: participant, pose: participantFrame, vectors: comparison?.vectors, crop: participantCrop }, { side: 'reference' as const, label: 'Reference', clip: reference, pose: referenceFrame, vectors: comparison?.vectors, crop: referenceCrop }] as panel (panel.side)}
					<article class="daisy-card border-base-300 bg-base-100 overflow-hidden border shadow-sm">
						<div class="flex items-center justify-between px-4 pt-3">
							<h2 class="font-semibold">{panel.label}</h2>
							{#if panel.side === 'participant' && datasetMode}
								<span class="daisy-badge daisy-badge-ghost"
									>row {panel.pose?.frame ?? '—'} · source frame {panel.pose?.csvFrame ?? '—'}</span
								>
							{:else if panel.side === 'reference' && datasetMode}
								<span class="daisy-badge daisy-badge-ghost"
									>row {panel.pose?.frame ?? '—'} · source {panel.pose?.csvFrame ?? '—'} · {panel.pose?.timestampMs?.toFixed(
										0
									) ?? '—'} ms</span
								>
							{:else if panel.side === 'reference'}
								<span class="daisy-badge daisy-badge-ghost"
									>target {referenceSample.targetFrame} · row {panel.pose?.frame ?? '—'}</span
								>
							{:else}<span class="daisy-badge daisy-badge-ghost"
									>frame {panel.pose?.frame ?? '—'}</span
								>{/if}
						</div>
						<div
							class="pose-window mx-3 my-3"
							style={`aspect-ratio:${panel.crop.w}/${panel.crop.h}`}
						>
							{#if panel.clip.url}
								<video
									class="cropped-video"
									style={`width:${panel.clip.video?.videoWidth ? (panel.clip.video.videoWidth / panel.crop.w) * 100 : 100}%;height:${panel.clip.video?.videoHeight ? (panel.clip.video.videoHeight / panel.crop.h) * 100 : 100}%;left:${panel.clip.video?.videoWidth ? (-panel.crop.x / panel.crop.w) * 100 : 0}%;top:${panel.clip.video?.videoHeight ? (-panel.crop.y / panel.crop.h) * 100 : 0}%`}
									src={panel.clip.url}
									muted
									playsinline
									preload="metadata"
									onloadedmetadata={(event) => loaded(panel.side, event)}
								></video>
							{:else if !panel.pose}<div class="empty-image">
									Choose a video and pose CSV, or load the synthetic demo
								</div>{/if}
							{#if panel.pose}
								<svg
									class="pose-overlay"
									viewBox={`${panel.crop.x} ${panel.crop.y} ${panel.crop.w} ${panel.crop.h}`}
									role="img"
									aria-label={`${panel.label} pose and Qijia vectors`}
								>
									<defs
										>{#each QIJIA_COLORS as color, i}<marker
												id={`${panel.side}-arrow-${i}`}
												viewBox="0 0 10 10"
												refX="8"
												refY="5"
												markerWidth="5"
												markerHeight="5"
												orient="auto-start-reverse"
												><path d="M 0 0 L 10 5 L 0 10 z" fill={color} /></marker
											>{/each}</defs
									>
									{#each UPPER_SKELETON_EDGES as [a, b] (`${a}-${b}`)}
										{@const pa = panel.pose.landmarks[a]}
										{@const pb = panel.pose.landmarks[b]}
										{#if Number.isFinite(pa.x) && Number.isFinite(pa.y) && Number.isFinite(pb.x) && Number.isFinite(pb.y)}<line
												x1={pa.x}
												y1={pa.y}
												x2={pb.x}
												y2={pb.y}
												class="skeleton-edge"
											/>{/if}
									{/each}
									{#each panel.pose.landmarks as point, i (i)}
										{#if [11, 12, 13, 14, 15, 16, 23, 24].includes(i) && Number.isFinite(point.x) && Number.isFinite(point.y)}<circle
												cx={point.x}
												cy={point.y}
												r={point.visibility !== undefined && point.visibility < 0.35 ? 2 : 4}
												fill={point.visibility !== undefined && point.visibility < 0.35
													? '#f87171'
													: '#f8fafc'}
												stroke="#0f172a"
												stroke-width="1.4"
												><title
													>{landmarkLabel(i)} · visibility {point.visibility?.toFixed(2) ??
														'n/a'}</title
												></circle
											>{/if}
									{/each}
									{#each panel.vectors ?? [] as vector, i (vector.name)}
										{@const origin = panel.pose.landmarks[vector.src]}
										{@const actual = panel.side === 'reference' ? vector.ref : vector.participant}
										{@const other = panel.side === 'participant' ? vector.ref : null}
										{@const length = Math.max(panel.crop.w, panel.crop.h) * 0.075}
										{#if actual}
											{#if panel.side === 'participant' && other}<line
													x1={origin.x}
													y1={origin.y}
													x2={origin.x + other[0] * length}
													y2={origin.y + other[1] * length}
													stroke={QIJIA_COLORS[i]}
													stroke-width={selectedVector === i || selectedVector === -1 ? 2 : 1}
													stroke-dasharray="4 4"
													opacity={selectedVector === -1 || selectedVector === i ? 0.65 : 0.13}
												/>
												{#if vector.participant}<line
														x1={origin.x + other[0] * length}
														y1={origin.y + other[1] * length}
														x2={origin.x + vector.participant[0] * length}
														y2={origin.y + vector.participant[1] * length}
														stroke={QIJIA_COLORS[i]}
														stroke-width="2.5"
														opacity={selectedVector === -1 || selectedVector === i ? 0.95 : 0.12}
													/>{/if}
											{/if}
											<line
												x1={origin.x}
												y1={origin.y}
												x2={origin.x + actual[0] * length}
												y2={origin.y + actual[1] * length}
												stroke={QIJIA_COLORS[i]}
												stroke-width={selectedVector === -1 || selectedVector === i ? 3 : 1.2}
												opacity={selectedVector === -1 || selectedVector === i ? 1 : 0.18}
												marker-end={`url(#${panel.side}-arrow-${i})`}
											/>
										{/if}
									{/each}
								</svg>
							{:else if panel.clip.frames.size}<div class="empty-image">
									No matching pose row for this frame
								</div>{/if}
						</div>
						<div class="px-4 pb-3 text-xs opacity-60">
							{#if panel.pose && !panel.clip.url}{datasetMode && panel.side === 'reference'
									? 'Reference pose only · reference video timing unavailable · '
									: 'Pose overlay · no video selected · '}{/if}Image coordinates retained · crop
							follows pose bounds · faint arrow = relocated reference direction
						</div>
						{#if panel.side === 'reference' && referenceSample.carried}<p
								class="text-info mx-4 mb-3 text-xs"
							>
								Carried forward row {panel.pose?.frame} for target frame {referenceSample.targetFrame}.
							</p>{/if}
						{#if panel.clip.video && hasOutOfBoundsLandmarks(panel.pose, panel.clip)}<p
								class="daisy-alert daisy-alert-warning mx-3 mb-3 py-2 text-xs"
							>
								Some pose coordinates fall outside this video ({panel.clip.video.videoWidth}×{panel
									.clip.video.videoHeight}). Check for a CSV/video dimension mismatch.
							</p>{/if}
					</article>
				{/each}
			</div>
			<aside
				class="daisy-card border-base-300 bg-base-100 border shadow-sm"
				aria-label="Frame score"
			>
				<div class="daisy-card-body gap-3 p-4">
					<div>
						<h2 class="daisy-card-title text-base">Frame error</h2>
						<p class="text-xs opacity-65">Stacked vector distances · maximum 16</p>
					</div>
					{#if comparison}
						<div class="text-4xl font-bold tabular-nums">
							{comparison.score.toFixed(2)}<span class="text-base font-normal opacity-60">
								/ 5</span
							>
						</div>
						<div
							class="border-base-300 flex h-7 overflow-hidden rounded-md border"
							role="img"
							aria-label={`Dissimilarity sum ${comparison.sum.toFixed(2)} on a 0 to 16 scale`}
						>
							{#each comparison.vectors as vector, i (vector.name)}<div
									style={`width:${((vector.error ?? 0) / 16) * 100}%;background:${QIJIA_COLORS[i]};min-width:${vector.error === null ? '3px' : '0'}`}
									title={`${vector.name}: ${vector.error === null ? 'invalid' : vector.error.toFixed(3)}`}
								></div>{/each}
							<div class="bg-base-200 flex-1"></div>
						</div>
						<div class="flex justify-between text-xs tabular-nums">
							<span>0 · match</span><span>sum {comparison.sum.toFixed(3)} / 16</span><span>16</span>
						</div>
						<p class="text-sm">
							Mean pair distance <strong>{comparison.mean.toFixed(3)}</strong> / 2
						</p>
						{#if comparison.invalidCount}<div class="daisy-alert daisy-alert-warning py-2 text-xs">
								{comparison.invalidCount} invalid pair{comparison.invalidCount === 1 ? '' : 's'};
								displayed score follows metric zero fallback. See diagnostics below.
							</div>{/if}
						{@const lowVisibility = comparison.vectors.filter((v) =>
							[
								participantFrame?.landmarks[v.src],
								participantFrame?.landmarks[v.dest],
								referenceFrame?.landmarks[v.src],
								referenceFrame?.landmarks[v.dest]
							].some((point) => point?.visibility !== undefined && point.visibility < 0.35)
						).length}
						{#if lowVisibility}<p class="text-warning text-xs">
								{lowVisibility} pair{lowVisibility === 1 ? ' includes' : 's include'} a landmark below
								0.35 visibility. The metric does not weight visibility.
							</p>{/if}
					{:else}<div class="rounded-box bg-base-200 p-4 text-sm opacity-70">
							Load both pose CSV files to calculate a frame score.
						</div>{/if}
					<div class="daisy-divider my-0"></div>
					<h3 class="text-sm font-semibold">Vector pairs</h3>
					<ul class="space-y-1">
						{#each comparison?.vectors ?? [] as vector, i (vector.name)}<li>
								<button
									class="hover:bg-base-200 flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs"
									aria-pressed={selectedVector === i}
									onclick={() => (selectedVector = selectedVector === i ? -1 : i)}
									><span
										class="h-3 w-3 shrink-0 rounded-full"
										style={`background:${QIJIA_COLORS[i]}`}
									></span><span class="min-w-0 flex-1 truncate">{vector.name}</span><span
										class="font-mono"
										>{vector.error === null ? 'invalid' : vector.error.toFixed(3)}</span
									></button
								>{#if vector.invalidReason && (selectedVector === i || selectedVector === -1)}<p
										class="text-warning ml-7 text-[11px]"
									>
										{vector.invalidReason}
									</p>{/if}
							</li>{/each}
					</ul>
				</div>
			</aside>
		</section>

		<section class="daisy-card border-base-300 bg-base-100 border shadow-sm">
			<div class="daisy-card-body gap-2 p-4">
				<div class="flex flex-wrap items-center justify-between gap-2">
					<h2 class="daisy-card-title text-base">Frame error across time</h2>
					<span class="text-xs opacity-65"
						>Sum of eight pair distances · chart 0–{chartMax} adaptive; stacked bar 0–16</span
					>
				</div>
				<div
					class="bg-base-200/60 relative h-28 overflow-hidden rounded-md"
					aria-label={`Frame error time series from zero to ${chartMax}`}
				>
					<div
						class="border-base-content/25 absolute inset-x-0 top-1/2 border-t border-dashed"
					></div>
					<svg
						class="absolute inset-0 h-full w-full"
						viewBox="0 0 100 100"
						preserveAspectRatio="none"
						aria-hidden="true"
						><polyline
							points={plot}
							fill="none"
							stroke="currentColor"
							stroke-width="1.3"
							vector-effect="non-scaling-stroke"
							class="text-primary"
						/></svg
					>{#if comparison && maxFrame > 0}<div
							class="border-primary absolute top-0 h-full border-l-2"
							style={`left:${(frameIndex / maxFrame) * 100}%`}
						></div>{/if}<span class="absolute top-1 left-2 text-[10px] opacity-60">{chartMax}</span
					><span class="absolute bottom-1 left-2 text-[10px] opacity-60">0</span>
				</div>
				<div class="flex items-center gap-2">
					<button
						class="daisy-btn daisy-btn-square daisy-btn-sm"
						aria-label="Previous participant frame"
						onclick={() => seek(frameIndex - 1)}>‹</button
					><input
						class="daisy-range daisy-range-primary daisy-range-sm flex-1"
						type="range"
						min="0"
						max={maxFrame}
						step="1"
						value={frameIndex}
						oninput={(event) => seek(Number(event.currentTarget.value))}
						aria-label="Seek participant frame"
					/><button
						class="daisy-btn daisy-btn-square daisy-btn-sm"
						aria-label="Next participant frame"
						onclick={() => seek(frameIndex + 1)}>›</button
					><span class="w-52 text-right font-mono text-[10px] leading-tight"
						>{#if datasetMode}row {frameIndex} · video frame {participantFrame?.csvFrame ??
								frameIndex} @ {(
								(participantFrame?.csvFrame ?? frameIndex) / participant.fps
							).toFixed(2)}s · ref row {frameIndex} @ {(frameIndex / reference.fps).toFixed(
								2
							)}s{:else}{(frameIndex / participant.fps).toFixed(2)}s / {duration.toFixed(
								2
							)}s{/if}</span
					>
				</div>
				{#if participant.frames.size && reference.frames.size && !referenceFrame}<p
						class="text-warning text-xs"
					>
						No reference pose exists at or before target frame {referenceFrameIndex}; check the FPS
						values and time offset.
					</p>{/if}
			</div>
		</section>
		<p class="text-xs opacity-60">
			Low visibility landmarks are shown in red. Zero length or non-finite vector pairs are labeled
			invalid. Current metric implementation contributes zero for invalid pair distances, so the
			visualization calls that out while retaining the metric’s score. The CSV does not record
			source image dimensions, so an in-bounds coordinate scale mismatch cannot always be detected
			automatically.
		</p>
	{/if}
</main>

<style>
	.pose-window {
		position: relative;
		overflow: hidden;
		background: #0f172a;
		border-radius: 0.65rem;
	}
	.cropped-video {
		position: absolute;
		max-width: none;
		object-fit: fill;
	}
	.pose-overlay {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		overflow: visible;
	}
	.skeleton-edge {
		stroke: #e2e8f0;
		stroke-width: 2.2;
		opacity: 0.72;
	}
	.empty-image {
		display: grid;
		position: absolute;
		inset: 0;
		place-items: center;
		padding: 2rem;
		color: #94a3b8;
		text-align: center;
		font-size: 0.85rem;
	}
	@media (prefers-reduced-motion: no-preference) {
		button,
		input {
			transition:
				background-color 0.15s ease,
				opacity 0.15s ease;
		}
	}
</style>
