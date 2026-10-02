<script lang="ts">
	import { onDestroy, onMount, tick } from 'svelte';
	import { afterNavigate, goto, replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { get } from 'svelte/store';
	import { navbarProps } from '$lib/elements/NavBar.svelte';
	import MetricSwitcher from '$lib/elements/MetricSwitcher.svelte';
	import {
		parseLegacyReferencePoseCsv,
		parseRawPoseCsv,
		pairFramesByRowIndex,
		participantVideoTimeForRow,
		buildContinuousTimeline,
		locateTimelineSegment,
		matchesTimelineSeekTarget,
		sourcePoseRowAtTime,
		reindexFramesByRowIndex,
		QIJIA_COLORS,
		QIJIA_LANDMARK_INDICES,
		getQijiaPoseCropForFrames,
		getQijiaNormalizedPoseCropForSegments,
		mapQijiaNormalizedCropToVideo,
		resolvePoseFrameAtTime,
		UPPER_SKELETON_EDGES,
		type NormalizedQijiaPoseCrop,
		type InspectorFrame
	} from '$lib/ai/motionmetrics/qijia2d-inspector';
	import { compareVionaFrame } from '$lib/ai/motionmetrics/viona2d-inspector';
	import { PoseLandmarkKeysUpperSnakeCase } from '$lib/webcam/mediapipe-utils';
	import { setLastMetric } from '$lib/utils/last-inspected-metric';

	type Clip = {
		url: string;
		name: string;
		frames: Map<number, InspectorFrame>;
		fps: number;
		video: HTMLVideoElement | undefined;
		mirrored?: boolean;
		clipStartSeconds?: number;
	};
	let participant = $state<Clip>({
		url: '',
		name: '',
		frames: new Map(),
		fps: 30,
		video: undefined
	});
	let reference = $state<Clip>({
		url: '',
		name: '',
		frames: new Map(),
		fps: 30,
		video: undefined,
		mirrored: false,
		clipStartSeconds: 0
	});
	let frameIndex = $state(0);
	let offsetSeconds = $state(0);
	let selectedVector = $state(0);
	let visualization = $state<'lens' | 'audit' | 'scatter'>('lens');
	let error = $state('');
	let demo = $state(false);
	type DatasetSegment = {
		id: string;
		clipNumber: number;
		referencePoseAvailable: boolean;
		videoUrl?: string;
		poseUrl?: string;
		referencePoseUrl?: string | null;
		durationSeconds?: number | null;
		referenceVideoUrl?: string | null;
		referenceClipStartSeconds?: number | null;
		referenceVideoMirrored?: boolean;
	};
	type DatasetPerformance = {
		id: string;
		participantLabel: string;
		study: string;
		danceName: string;
		condition: string;
		phase: string | null;
		thumbnailUrl?: string;
		segments: DatasetSegment[];
	};
	type LoadedSegment = {
		segment: DatasetSegment;
		participantFrames: Map<number, InspectorFrame>;
		referenceFrames: Map<number, InspectorFrame>;
		frameCount: number;
		scoreFrameCount: number;
		fallbackDurationSeconds: number;
		participantVideoWidth: number;
		participantVideoHeight: number;
		referenceVideoWidth: number;
		referenceVideoHeight: number;
	};
	type VideoDimensions = { width: number; height: number };
	let view = $state<'dataset' | 'review'>(
		page.url.searchParams.get('source') === 'local' ? 'review' : 'dataset'
	);
	let datasetPerformances = $state<DatasetPerformance[]>([]);
	let selectedPerformance = $state<DatasetPerformance | null>(null);
	let loadedSegments = $state<LoadedSegment[]>([]);
	let activeSegmentIndex = $state(0);
	let globalTime = $state(0);
	let datasetLoading = $state(true);
	let datasetCatalogReady = false;
	let lastRestoreKey = '';
	let datasetError = $state('');
	let datasetUnavailable = $state(false);
	let studyFilter = $state('all');
	let danceFilter = $state('all');
	let participantSearch = $state('');
	let loadToken = 0;
	let loadController: AbortController | null = null;
	let autoAdvance = false;
	let pendingMediaSeek: { segmentIndex: number; localTimeSeconds: number } | null = null;
	let visiblePerformanceLimit = $state(24);
	let participantManualCrop = $state({ x: 0, y: 0, w: 640, h: 480 });
	let referenceManualCrop = $state({ x: 0, y: 0, w: 640, h: 480 });
	let participantNormalizedCrop = $state<NormalizedQijiaPoseCrop>({ x: 0, y: 0, w: 1, h: 1 });
	let referenceNormalizedCrop = $state<NormalizedQijiaPoseCrop>({ x: 0, y: 0, w: 1, h: 1 });
	let cropDimensions = { participant: { width: 0, height: 0 }, reference: { width: 0, height: 0 } };
	const videoDimensionCache = new Map<string, Promise<VideoDimensions | null>>();
	const datasetMode = $derived(Boolean(selectedPerformance) && view === 'review');
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
	const vectorShortLabels = [
		'Shoulders',
		'Left torso',
		'Hips',
		'Right torso',
		'L upper arm',
		'L forearm',
		'R upper arm',
		'R forearm'
	] as const;
	const referenceFrameNumbers = $derived([...reference.frames.keys()].sort((a, b) => a - b));
	const visiblePerformances = $derived(filteredPerformances.slice(0, visiblePerformanceLimit));
	const timeline = $derived(
		datasetMode
			? buildContinuousTimeline(
					loadedSegments.map((loaded) => ({
						id: loaded.segment.id,
						durationSeconds: loaded.segment.durationSeconds ?? null,
						fallbackDurationSeconds: loaded.fallbackDurationSeconds
					}))
				)
			: []
	);
	const timelineDuration = $derived(timeline.at(-1)?.endSeconds ?? 0);
	const activeLoadedSegment = $derived(loadedSegments[activeSegmentIndex]);
	const participantCrop = $derived.by(() =>
		datasetMode && activeLoadedSegment
			? mapQijiaNormalizedCropToVideo(
					participantNormalizedCrop,
					activeLoadedSegment.participantVideoWidth,
					activeLoadedSegment.participantVideoHeight
				)
			: participantManualCrop
	);
	const referenceCrop = $derived.by(() =>
		datasetMode && activeLoadedSegment
			? mapQijiaNormalizedCropToVideo(
					referenceNormalizedCrop,
					activeLoadedSegment.referenceVideoWidth,
					activeLoadedSegment.referenceVideoHeight
				)
			: referenceManualCrop
	);
	const activeFrameCount = $derived(activeLoadedSegment?.frameCount ?? 0);
	const participantFrame = $derived(
		datasetMode
			? activeLoadedSegment?.participantFrames.get(frameIndex)
			: participant.frames.get(frameIndex)
	);
	const referenceSample = $derived(
		datasetMode
			? {
					targetFrame: frameIndex,
					frame: activeLoadedSegment?.referenceFrames.get(frameIndex) ?? null,
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
		participantFrame && referenceFrame
			? compareVionaFrame(referenceFrame.landmarks, participantFrame.landmarks)
			: null
	);
	const selectedPair = $derived(
		comparison?.vectors[selectedVector] ?? comparison?.vectors[0] ?? null
	);
	const maxFrame = $derived(
		datasetMode ? Math.max(0, activeFrameCount - 1) : (frameNumbers.at(-1) ?? 0)
	);
	const duration = $derived(maxFrame / participant.fps);
	const series = $derived(
		datasetMode
			? loadedSegments.flatMap((loaded, segmentIndex) =>
					Array.from({ length: loaded.scoreFrameCount }, (_, row) => {
						const participantPose = loaded.participantFrames.get(row);
						const referencePose = loaded.referenceFrames.get(row);
						const startSeconds = timeline[segmentIndex]?.startSeconds ?? 0;
						const localTime = participantPose
							? participantVideoTimeForRow(loaded.participantFrames, row, 30)
							: 0;
						return {
							frame: row,
							timeSeconds: startSeconds + localTime,
							segmentIndex,
							participantPose:
								participantPose && localTime < (timeline[segmentIndex]?.durationSeconds ?? 0)
									? participantPose
									: null,
							referencePose:
								participantPose && localTime < (timeline[segmentIndex]?.durationSeconds ?? 0)
									? referencePose
									: null
						};
					})
				)
			: frameNumbers.map((f) => {
					const resolved = resolvePoseFrameAtTime(
						reference.frames,
						f / participant.fps + offsetSeconds,
						reference.fps,
						referenceFrameNumbers
					);
					const p = participant.frames.get(f);
					return p && resolved.frame
						? {
								frame: f,
								timeSeconds: f / participant.fps,
								segmentIndex: 0,
								participantPose: p,
								referencePose: resolved.frame
							}
						: {
								frame: f,
								timeSeconds: f / participant.fps,
								segmentIndex: 0,
								participantPose: null,
								referencePose: null
							};
				})
	);
	const chartPoints = $derived(
		series.map((point) => ({
			...point,
			dissimilarity:
				point.participantPose && point.referencePose
					? compareVionaFrame(point.referencePose.landmarks, point.participantPose.landmarks)
							.overallDissimilarity
					: null
		}))
	);
	const chartBounds = $derived.by(() => {
		const values = chartPoints.flatMap((point) =>
			point.dissimilarity === null ? [] : [point.dissimilarity]
		);
		if (!values.length) return { min: 0, max: 1 };
		const valueMin = Math.min(...values);
		const valueMax = Math.max(...values);
		if (valueMin >= 0 && valueMax <= 1) return { min: 0, max: 1 };
		const padding = Math.max((valueMax - valueMin) * 0.05, 0.02);
		return { min: valueMin - padding, max: valueMax + padding };
	});
	const scatterBounds = $derived.by(() => {
		const vectors = comparison?.vectors ?? [];
		const maxLength = Math.max(
			0,
			...vectors.flatMap((vector) =>
				vector.lengthError !== null && Number.isFinite(vector.lengthError)
					? [vector.lengthError]
					: []
			)
		);
		const maxAngle = Math.max(
			0,
			...vectors.flatMap((vector) =>
				vector.angleError !== null && Number.isFinite(vector.angleError) ? [vector.angleError] : []
			)
		);
		return { xMax: Math.max(0.25, maxLength * 1.15), yMax: Math.max(0.25, maxAngle * 1.15) };
	});
	const vionaPlotPath = $derived.by(() => {
		const plotDuration = datasetMode ? timelineDuration : duration;
		if (plotDuration <= 0) return '';
		let previousSegment = -1;
		return chartPoints
			.map((point) => {
				if (point.dissimilarity === null) {
					previousSegment = -1;
					return '';
				}
				const command = previousSegment === point.segmentIndex ? 'L' : 'M';
				previousSegment = point.segmentIndex;
				const y =
					100 -
					((point.dissimilarity - chartBounds.min) / (chartBounds.max - chartBounds.min)) * 100;
				return `${command}${(point.timeSeconds / plotDuration) * 100},${y}`;
			})
			.filter(Boolean)
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
			visiblePerformanceLimit = 24;
			datasetUnavailable = datasetPerformances.length === 0;
			datasetCatalogReady = true;
			await restorePerformanceFromUrl(page.url);
		} catch (caught) {
			datasetError =
				caught instanceof Error ? caught.message : 'Could not load the local dataset catalog.';
		} finally {
			datasetLoading = false;
		}
	}
	async function restorePerformanceFromUrl(url: URL) {
		const performanceId = url.searchParams.get('performance');
		if (!performanceId) {
			lastRestoreKey = '';
			return;
		}
		const timeText = url.searchParams.get('time');
		const timeSeconds = timeText === null ? 0 : Number(timeText);
		if (!Number.isFinite(timeSeconds) || timeSeconds < 0) return;
		const target = datasetPerformances.find((performance) => performance.id === performanceId);
		if (!target) return;
		const key = `${performanceId}\u0000${timeSeconds}`;
		if (key === lastRestoreKey) return;
		lastRestoreKey = key;
		if (selectedPerformance?.id === performanceId && datasetMode) {
			seekGlobalTime(timeSeconds);
			return;
		}
		await openPerformance(target, timeSeconds);
	}
	function probeVideoDimensions(url?: string): Promise<VideoDimensions | null> {
		if (!url) return Promise.resolve(null);
		const cached = videoDimensionCache.get(url);
		if (cached) return cached;
		const dimensions = new Promise<VideoDimensions | null>((resolve) => {
			const video = document.createElement('video');
			video.preload = 'metadata';
			let settled = false;
			const timeout = window.setTimeout(() => finish(null), 10_000);
			const finish = (value: VideoDimensions | null) => {
				if (settled) return;
				settled = true;
				window.clearTimeout(timeout);
				video.removeEventListener('loadedmetadata', onMetadata);
				video.removeEventListener('error', onError);
				video.removeAttribute('src');
				video.load();
				resolve(value);
			};
			const onMetadata = () =>
				finish(
					video.videoWidth > 0 && video.videoHeight > 0
						? { width: video.videoWidth, height: video.videoHeight }
						: null
				);
			const onError = () => finish(null);
			video.addEventListener('loadedmetadata', onMetadata);
			video.addEventListener('error', onError);
			video.src = url;
			video.load();
		});
		videoDimensionCache.set(url, dimensions);
		return dimensions;
	}
	async function openPerformance(summary: DatasetPerformance, restoreTimeSeconds = 0) {
		cancelLoad();
		const controller = new AbortController();
		loadController = controller;
		const requestToken = ++loadToken;
		datasetLoading = true;
		cropDimensions = { participant: { width: 0, height: 0 }, reference: { width: 0, height: 0 } };
		participantNormalizedCrop = { x: 0, y: 0, w: 1, h: 1 };
		referenceNormalizedCrop = { x: 0, y: 0, w: 1, h: 1 };
		datasetError = '';
		error = '';
		try {
			const response = await fetch(`/api/dev/participant-catalog/performance/${summary.id}`, {
				cache: 'no-store',
				signal: controller.signal
			});
			if (!response.ok) throw new Error(`Performance request failed (${response.status}).`);
			const performance = (await response.json()) as DatasetPerformance;
			if (requestToken !== loadToken) return;
			const loaded = await Promise.all(
				performance.segments.map(async (segment) => {
					const participantDimensionsPromise = probeVideoDimensions(segment.videoUrl);
					const referenceDimensionsPromise = probeVideoDimensions(
						segment.referenceVideoUrl ?? undefined
					);
					if (!segment.poseUrl)
						throw new Error(`Segment ${segment.clipNumber} has no participant pose.`);
					const poseResponse = await fetch(segment.poseUrl, {
						cache: 'no-store',
						signal: controller.signal
					});
					if (!poseResponse.ok)
						throw new Error(`Could not load segment ${segment.clipNumber} pose.`);
					const poseText = await poseResponse.text();
					const participantFrames = reindexFramesByRowIndex(parseRawPoseCsv(poseText));
					let referenceFrames = new Map<number, InspectorFrame>();
					let scoreFrameCount = 0;
					if (segment.referencePoseUrl) {
						const referenceResponse = await fetch(segment.referencePoseUrl, {
							cache: 'no-store',
							signal: controller.signal
						});
						if (!referenceResponse.ok)
							throw new Error(`Could not load reference pose for segment ${segment.clipNumber}.`);
						const pair = pairFramesByRowIndex(
							participantFrames,
							parseLegacyReferencePoseCsv(await referenceResponse.text())
						);
						referenceFrames = pair.referenceFrames;
						scoreFrameCount = pair.frameCount;
					}
					const frameCount = participantFrames.size;
					const fallbackDurationSeconds = Math.max(
						0,
						...Array.from(
							{ length: frameCount },
							(_, row) => participantVideoTimeForRow(participantFrames, row, 30) + 1 / 30
						)
					);
					const [participantDimensions, referenceDimensions] = await Promise.all([
						participantDimensionsPromise,
						referenceDimensionsPromise
					]);
					return {
						segment,
						participantFrames,
						referenceFrames,
						frameCount,
						scoreFrameCount,
						fallbackDurationSeconds,
						participantVideoWidth: participantDimensions?.width ?? 640,
						participantVideoHeight: participantDimensions?.height ?? 480,
						referenceVideoWidth: referenceDimensions?.width ?? 640,
						referenceVideoHeight: referenceDimensions?.height ?? 480
					};
				})
			);
			if (requestToken !== loadToken) return;
			if (!loaded.length || loaded.every((segment) => !segment.frameCount))
				throw new Error('No participant pose rows were found in this performance.');
			selectedPerformance = performance;
			loadedSegments = loaded;
			activeSegmentIndex = 0;
			globalTime = 0;
			frameIndex = 0;
			offsetSeconds = 0;
			selectedVector = -1;
			demo = false;
			view = 'review';
			updatePoseCrops();
			activateDatasetSegment(0);
			await tick();
			if (requestToken === loadToken) seekGlobalTime(restoreTimeSeconds);
		} catch (caught) {
			if (requestToken !== loadToken) return;
			if (caught instanceof DOMException && caught.name === 'AbortError') return;
			error = caught instanceof Error ? caught.message : 'Could not load this segment.';
			datasetError = error;
		} finally {
			if (requestToken === loadToken) {
				datasetLoading = false;
				loadController = null;
			}
		}
	}
	function cancelLoad() {
		loadToken++;
		loadController?.abort();
		loadController = null;
		datasetLoading = false;
	}
	function returnToDataset() {
		const dance = selectedPerformance?.danceName;
		cancelLoad();
		lastRestoreKey = '';
		selectedPerformance = null;
		loadedSegments = [];
		globalTime = 0;
		view = 'dataset';
		void goto(dance ? `/research?dance=${encodeURIComponent(dance)}` : '/research');
	}
	function updatePoseCrops() {
		if (datasetMode) {
			participantNormalizedCrop = getQijiaNormalizedPoseCropForSegments(
				loadedSegments.map((segment) => ({
					frames: segment.participantFrames.values(),
					videoWidth: segment.participantVideoWidth,
					videoHeight: segment.participantVideoHeight
				}))
			);
			referenceNormalizedCrop = getQijiaNormalizedPoseCropForSegments(
				loadedSegments.map((segment) => ({
					frames: segment.referenceFrames.values(),
					videoWidth: segment.referenceVideoWidth,
					videoHeight: segment.referenceVideoHeight
				}))
			);
			return;
		}
		const p = cropDimensions.participant;
		const r = cropDimensions.reference;
		participantManualCrop = getQijiaPoseCropForFrames(
			participant.frames.values(),
			p.width || undefined,
			p.height || undefined
		);
		referenceManualCrop = getQijiaPoseCropForFrames(
			reference.frames.values(),
			r.width || undefined,
			r.height || undefined
		);
	}
	function activateDatasetSegment(index: number) {
		const loaded = loadedSegments[index];
		if (!loaded) return;
		const previousReferenceVideo = reference.video;
		activeSegmentIndex = index;
		participant = {
			...participant,
			url: loaded.segment.videoUrl ?? '',
			name: 'Participant video',
			frames: loaded.participantFrames,
			fps: 30,
			video: participant.video
		};
		reference = {
			...reference,
			url: loaded.segment.referenceVideoUrl ?? '',
			name: loaded.segment.referenceVideoUrl ? 'Reference tutorial video' : 'Reference pose only',
			frames: loaded.referenceFrames,
			fps: 30,
			video: previousReferenceVideo,
			mirrored: loaded.segment.referenceVideoMirrored ?? false,
			clipStartSeconds: loaded.segment.referenceClipStartSeconds ?? 0
		};
		const localTime = Math.max(0, globalTime - (timeline[index]?.startSeconds ?? 0));
		frameIndex = sourcePoseRowAtTime(loaded.participantFrames, localTime, participant.fps) ?? -1;
		queueMicrotask(syncReferenceVideo);
	}
	function syncReferenceVideo() {
		if (!datasetMode || !reference.video || reference.video.readyState < 1 || !reference.url)
			return;
		const time =
			(reference.clipStartSeconds ?? 0) +
			(referenceFrame?.timestampMs ?? ((referenceFrame?.csvFrame ?? frameIndex) * 1000) / 30) /
				1000;
		if (Number.isFinite(time) && Math.abs(reference.video.currentTime - time) > 0.07)
			reference.video.currentTime = Math.max(0, time);
	}
	function seekGlobalTime(time: number) {
		if (!timeline.length) return;
		globalTime = Math.max(0, Math.min(timelineDuration, time));
		const position = locateTimelineSegment(timeline, globalTime);
		if (!position) return;
		pendingMediaSeek = {
			segmentIndex: position.segmentIndex,
			localTimeSeconds: position.localTimeSeconds
		};
		if (position.segmentIndex !== activeSegmentIndex) activateDatasetSegment(position.segmentIndex);
		frameIndex =
			sourcePoseRowAtTime(
				loadedSegments[position.segmentIndex].participantFrames,
				position.localTimeSeconds,
				30
			) ?? -1;
		if (participant.video?.readyState && position.segmentIndex === activeSegmentIndex)
			participant.video.currentTime = position.localTimeSeconds;
		syncReferenceVideo();
	}
	function onParticipantTimeUpdate(event: Event) {
		if (!datasetMode) return;
		const video = event.currentTarget as HTMLVideoElement;
		const active = timeline[activeSegmentIndex];
		if (!active) return;
		if (pendingMediaSeek) {
			if (
				!matchesTimelineSeekTarget(
					activeSegmentIndex,
					video.currentTime,
					pendingMediaSeek.segmentIndex,
					pendingMediaSeek.localTimeSeconds
				)
			)
				return;
			pendingMediaSeek = null;
		}
		globalTime = Math.min(timelineDuration, active.startSeconds + video.currentTime);
		frameIndex =
			sourcePoseRowAtTime(activeLoadedSegment.participantFrames, video.currentTime, 30) ?? -1;
		syncReferenceVideo();
	}
	function onParticipantEnded() {
		if (!datasetMode || activeSegmentIndex >= timeline.length - 1) return;
		const next = timeline[activeSegmentIndex + 1];
		autoAdvance = true;
		seekGlobalTime(next.startSeconds);
	}
	function onParticipantSeeked(event: Event) {
		const video = event.currentTarget as HTMLVideoElement;
		if (
			pendingMediaSeek &&
			matchesTimelineSeekTarget(
				activeSegmentIndex,
				video.currentTime,
				pendingMediaSeek.segmentIndex,
				pendingMediaSeek.localTimeSeconds
			)
		)
			pendingMediaSeek = null;
	}
	function stepTimeline(direction: -1 | 1) {
		if (datasetMode) seekGlobalTime(globalTime + direction / 30);
		else seek(frameIndex + direction);
	}

	onMount(() => {
		const previousNav = get(navbarProps);
		navbarProps.set({
			collapsed: false,
			pageTitle: 'Viona2D inspector',
			back: { url: '/research', title: 'Metrics' },
			hideSettings: true
		});
		setLastMetric('viona2d');
		if (view === 'dataset' && !page.url.searchParams.has('performance')) {
			const dance = page.url.searchParams.get('dance');
			void goto(dance ? `/research?dance=${encodeURIComponent(dance)}` : '/research', {
				replaceState: true
			});
		} else if (view === 'dataset') void loadDataset();
		return () => navbarProps.set(previousNav);
	});
	afterNavigate(({ to }) => {
		if (to?.url.pathname === '/metrics/viona2d' && datasetCatalogReady)
			void restorePerformanceFromUrl(to.url);
	});

	function setClip(side: 'participant' | 'reference', file?: File) {
		if (!file) return;
		const clip = side === 'participant' ? participant : reference;
		if (file.type.startsWith('video/')) {
			cropDimensions[side] = { width: 0, height: 0 };
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
					updatePoseCrops();
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
		if (video.videoWidth > 0 && video.videoHeight > 0) {
			if (datasetMode) {
				const active = loadedSegments[activeSegmentIndex];
				const sourceUrl =
					side === 'participant' ? active?.segment.videoUrl : active?.segment.referenceVideoUrl;
				const dimensionWidth =
					side === 'participant' ? active?.participantVideoWidth : active?.referenceVideoWidth;
				const dimensionHeight =
					side === 'participant' ? active?.participantVideoHeight : active?.referenceVideoHeight;
				if (
					active &&
					sourceUrl === (side === 'participant' ? participant.url : reference.url) &&
					(dimensionWidth !== video.videoWidth || dimensionHeight !== video.videoHeight)
				) {
					loadedSegments = loadedSegments.map((segment, index) =>
						index !== activeSegmentIndex
							? segment
							: side === 'participant'
								? {
										...segment,
										participantVideoWidth: video.videoWidth,
										participantVideoHeight: video.videoHeight
									}
								: {
										...segment,
										referenceVideoWidth: video.videoWidth,
										referenceVideoHeight: video.videoHeight
									}
					);
					updatePoseCrops();
				}
			} else if (cropDimensions[side].width === 0) {
				cropDimensions[side] = { width: video.videoWidth, height: video.videoHeight };
				updatePoseCrops();
			}
		}
		const target = side === 'participant' ? participant : reference;
		if (side === 'participant') participant = { ...target, video };
		else reference = { ...target, video };
		if (side === 'participant') {
			if (datasetMode) {
				const localTime =
					pendingMediaSeek?.segmentIndex === activeSegmentIndex
						? pendingMediaSeek.localTimeSeconds
						: Math.max(0, globalTime - (timeline[activeSegmentIndex]?.startSeconds ?? 0));
				video.currentTime = localTime;
				if (autoAdvance) {
					autoAdvance = false;
					void video.play().catch(() => {});
				}
			} else seek(frameIndex);
		} else if (datasetMode) syncReferenceVideo();
	}
	function landmarkLabel(index: number) {
		return (
			PoseLandmarkKeysUpperSnakeCase[index]?.replaceAll('_', ' ').toLowerCase() ?? `point ${index}`
		);
	}
	function hasOutOfBoundsLandmarks(frame: InspectorFrame | undefined, clip: Clip) {
		if (!frame || !clip.video?.videoWidth || !clip.video?.videoHeight) return false;
		return QIJIA_LANDMARK_INDICES.some((index) => {
			const point = frame.landmarks[index];
			if (!point || (point.visibility !== undefined && point.visibility < 0.35)) return false;
			return (
				(Number.isFinite(point.x) && (point.x < -2 || point.x > clip.video!.videoWidth + 2)) ||
				(Number.isFinite(point.y) && (point.y < -2 || point.y > clip.video!.videoHeight + 2))
			);
		});
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
		loadController?.abort();
		if (participant.url) URL.revokeObjectURL(participant.url);
		if (reference.url) URL.revokeObjectURL(reference.url);
	});
</script>

<svelte:head>
	<title>Viona2D frame inspector</title>
	<meta
		name="description"
		content="Inspect the frame-by-frame Viona2D pose dissimilarity calculation locally."
	/>
</svelte:head>

<main
	class="mx-auto max-w-[1500px] space-y-4 px-4 py-4 pb-48 lg:px-8"
	class:pb-56={view === 'review'}
>
	{#if view === 'dataset'}
		<header class="flex items-center gap-3">
			<h1 class="text-lg font-semibold">Choose a performance</h1>
			<span class="daisy-badge daisy-badge-outline daisy-badge-sm">Viona2D · local</span>
		</header>
	{/if}

	{#if view === 'dataset'}
		<section class="daisy-card border-base-300 bg-base-100 border shadow-sm">
			<div class="daisy-card-body gap-4">
				{#if datasetLoading}
					<div class="flex items-center gap-3 py-6" role="status">
						<span class="daisy-loading daisy-loading-spinner daisy-loading-md"></span>Reading local
						catalog…
					</div>
				{:else if datasetError}
					<div class="daisy-alert daisy-alert-error" role="alert">
						<span>{datasetError}</span><button class="daisy-btn daisy-btn-sm" onclick={loadDataset}
							>Retry</button
						>
					</div>
				{:else if datasetUnavailable}
					<div class="rounded-box bg-base-200/70 border-base-300 space-y-2 border p-5">
						<h3 class="font-semibold">No paired participant data found</h3>
						<p class="max-w-2xl text-sm opacity-75">
							The local cache may be missing, or no video currently has a matching canonical pose2d
							CSV. Set <code>MOTION_PIPELINE_USER_STUDY_DATA_DIR</code> to the participant cache root
							and restart the dev server.
						</p>
						<p class="text-xs opacity-60">
							Only files in the known study video and segmented pose folders are listed.
						</p>
						<a
							class="daisy-btn daisy-btn-outline daisy-btn-sm mt-2"
							href="/metrics/viona2d?source=local">Use local files instead</a
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
						Showing {visiblePerformances.length} of {filteredPerformances.length} matching performances
						({datasetPerformances.length} total).
					</p>
					<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
						{#each visiblePerformances as performance (performance.id)}
							<button
								class="daisy-card border-base-300 bg-base-100 hover:border-primary border text-left transition-colors"
								disabled={datasetLoading}
								onclick={() => void openPerformance(performance)}
							>
								<img
									class="h-36 w-full object-cover"
									src={`/api/dev/participant-catalog/performance/${performance.id}/thumbnail`}
									alt=""
									loading="lazy"
									decoding="async"
								/>
								<div class="daisy-card-body gap-2 p-4">
									<div class="flex items-center justify-between gap-2">
										<span class="daisy-badge daisy-badge-ghost"
											>{performance.study === 'study1' ? 'Study 1' : 'Study 2'}</span
										><span class="text-xs opacity-60">{performance.segments.length} segments</span>
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
					{#if visiblePerformanceLimit < filteredPerformances.length}<button
							class="daisy-btn daisy-btn-outline daisy-btn-sm mx-auto"
							onclick={() => (visiblePerformanceLimit += 24)}
							>Show {Math.min(24, filteredPerformances.length - visiblePerformanceLimit)} more</button
						>{/if}
				{/if}
			</div>
		</section>
	{:else}
		{#if datasetMode}
			<div class="flex flex-wrap items-center justify-between gap-2">
				<div>
					<h2 class="font-semibold">
						{selectedPerformance?.participantLabel} · {displayDance(
							selectedPerformance?.danceName ?? ''
						)}
					</h2>
					<p class="text-xs opacity-70">
						Segment {activeSegmentIndex + 1} of {loadedSegments.length} · row-index pose pairing; tutorial
						video is a timing guide
					</p>
				</div>
				<div class="flex items-center gap-2">
					<MetricSwitcher
						performanceId={selectedPerformance?.id ?? ''}
						timeSeconds={globalTime}
						currentMetric="viona2d"
					/>
					<button class="daisy-btn daisy-btn-outline daisy-btn-sm" onclick={returnToDataset}
						>← Performances</button
					>
				</div>
			</div>
		{/if}
		<div class="flex justify-end">
			{#if !datasetMode}<button
					class="daisy-btn daisy-btn-primary daisy-btn-sm"
					onclick={demoFrames}>Load synthetic demo</button
				>{/if}
		</div>

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

		<section
			class={`relative grid gap-4 md:grid-cols-12 ${visualization === 'lens' ? 'pb-2' : ''}`}
		>
			<div class="grid min-w-0 gap-4 md:contents">
				{#each [{ side: 'participant' as const, label: 'Participant', clip: participant, pose: participantFrame, vectors: comparison?.vectors, crop: participantCrop }, { side: 'reference' as const, label: 'Reference', clip: reference, pose: referenceFrame, vectors: comparison?.vectors, crop: referenceCrop }] as panel (panel.side)}
					<article
						class={`daisy-card border-base-300 bg-base-100 overflow-hidden border shadow-sm ${panel.side === 'participant' ? (visualization === 'lens' ? 'md:col-span-8 md:row-span-2 md:self-start' : 'md:col-span-8') : 'md:col-span-4 md:col-start-9 md:row-start-1 md:self-start'}`}
					>
						<div class="flex items-center justify-between px-4 pt-3">
							<h2 class="font-semibold">{panel.label}</h2>
							{#if panel.side === 'participant' && datasetMode}
								<span class="daisy-badge daisy-badge-ghost"
									>row {panel.pose?.frame ?? '—'} · source frame {panel.pose?.csvFrame ?? '—'}</span
								>
							{:else if panel.side === 'reference' && datasetMode}
								<span class="daisy-badge daisy-badge-ghost whitespace-nowrap"
									>row {panel.pose?.frame ?? '—'} · {panel.pose?.timestampMs?.toFixed(0) ?? '—'} ms</span
								>
							{:else if panel.side === 'reference'}
								<span class="daisy-badge daisy-badge-ghost"
									>target {referenceSample.targetFrame} · row {panel.pose?.frame ?? '—'}</span
								>
							{:else}<span class="daisy-badge daisy-badge-ghost"
									>frame {panel.pose?.frame ?? '—'}</span
								>{/if}
						</div>
						{#if panel.side === 'reference'}
							<div
								role="tablist"
								class="daisy-tabs daisy-tabs-box mx-2 mt-2 grid grid-cols-3"
								aria-label="Metric visualization"
							>
								<button
									role="tab"
									aria-selected={visualization === 'lens'}
									class="daisy-tab px-1 text-[10px]"
									class:daisy-tab-active={visualization === 'lens'}
									onclick={() => (visualization = 'lens')}>Vector lens</button
								>
								<button
									role="tab"
									aria-selected={visualization === 'audit'}
									class="daisy-tab px-1 text-[10px]"
									class:daisy-tab-active={visualization === 'audit'}
									onclick={() => (visualization = 'audit')}>Eight-pair</button
								>
								<button
									role="tab"
									aria-selected={visualization === 'scatter'}
									class="daisy-tab px-1 text-[10px]"
									class:daisy-tab-active={visualization === 'scatter'}
									onclick={() => (visualization = 'scatter')}>Angle × length</button
								>
							</div>
						{/if}
						<div
							class="pose-window mx-auto my-2"
							class:compact-participant-window={panel.side === 'participant'}
							class:compact-reference-window={panel.side === 'reference'}
							class:compact-inspection-window={visualization !== 'lens'}
							style={`aspect-ratio:${panel.crop.w}/${panel.crop.h};--crop-ratio:${panel.crop.w / panel.crop.h}`}
						>
							{#if panel.clip.url}
								<video
									class="cropped-video"
									class:mirror-video={panel.clip.mirrored}
									style={`width:${panel.clip.video?.videoWidth ? (panel.clip.video.videoWidth / panel.crop.w) * 100 : 100}%;height:${panel.clip.video?.videoHeight ? (panel.clip.video.videoHeight / panel.crop.h) * 100 : 100}%;left:${panel.clip.video?.videoWidth ? (-panel.crop.x / panel.crop.w) * 100 : 0}%;top:${panel.clip.video?.videoHeight ? (-panel.crop.y / panel.crop.h) * 100 : 0}%`}
									src={panel.clip.url}
									muted
									playsinline
									preload="metadata"
									onloadedmetadata={(event) => loaded(panel.side, event)}
									ontimeupdate={panel.side === 'participant' ? onParticipantTimeUpdate : undefined}
									onseeked={panel.side === 'participant' ? onParticipantSeeked : undefined}
									onended={panel.side === 'participant' ? onParticipantEnded : undefined}
									controls={panel.side === 'participant'}
								></video>
							{:else if !panel.pose}<div class="empty-image">
									Choose a video and pose CSV, or load the synthetic demo
								</div>{/if}
							{#if panel.pose}
								<svg
									class="pose-overlay"
									viewBox={`${panel.crop.x} ${panel.crop.y} ${panel.crop.w} ${panel.crop.h}`}
									role="img"
									aria-label={`${panel.label} pose and Viona vectors`}
								>
									<defs
										>{#each QIJIA_COLORS as color, i}<marker
												id={`${panel.side}-arrow-${i}`}
												viewBox="0 0 10 10"
												refX="8"
												refY="5"
												markerWidth="1.8"
												markerHeight="1.8"
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
										{@const length = Math.max(panel.crop.w, panel.crop.h) * 0.15}
										{#if actual}
											{#if panel.side === 'participant' && other}<line
													x1={origin.x}
													y1={origin.y}
													x2={origin.x + other[0] * length}
													y2={origin.y + other[1] * length}
													stroke={QIJIA_COLORS[i]}
													stroke-width={selectedVector === i ? 2.6 : 2}
													opacity={selectedVector === -1 || selectedVector === i ? 1 : 0.88}
													marker-end={`url(#${panel.side}-arrow-${i})`}
												/>{/if}
											<line
												x1={origin.x}
												y1={origin.y}
												x2={origin.x + actual[0] * length}
												y2={origin.y + actual[1] * length}
												stroke={QIJIA_COLORS[i]}
												stroke-width={selectedVector === i ? 2.6 : 2}
												stroke-dasharray={panel.side === 'participant' ? '5 4' : undefined}
												opacity={selectedVector === -1 || selectedVector === i ? 1 : 0.88}
												marker-end={panel.side === 'reference'
													? `url(#${panel.side}-arrow-${i})`
													: undefined}
											/>
										{/if}
									{/each}
								</svg>
							{:else if panel.clip.frames.size}<div class="empty-image">
									No matching pose row for this frame
								</div>{/if}
						</div>
						{#if panel.side === 'participant' && visualization === 'lens'}<div
								class="px-4 pb-3 text-xs opacity-75"
							>
								{#if panel.pose && !panel.clip.url}Pose overlay · no video selected ·
								{/if}Image coordinates retained · fixed pose crop · solid arrow = reference · dashed
								= participant
								<div
									class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px]"
									aria-label="Vector pair colors"
								>
									{#each vectorShortLabels as label, index (label)}<span
											class="flex items-center gap-1"
											><i class="size-2 rounded-full" style={`background:${QIJIA_COLORS[index]}`}
											></i>{label}</span
										>{/each}
								</div>
							</div>{/if}
						{#if panel.side === 'reference' && referenceSample.carried}<p
								class="text-info mx-4 mb-3 text-xs"
							>
								Carried forward row {panel.pose?.frame} for target frame {referenceSample.targetFrame}.
							</p>{/if}
						{#if panel.clip.video && hasOutOfBoundsLandmarks(panel.pose, panel.clip)}<p
								class="daisy-alert daisy-alert-warning mx-3 mb-3 py-2 text-xs"
							>
								Scored joint outside video bounds.
							</p>{/if}
					</article>
				{/each}
			</div>
			<aside
				class={visualization === 'lens'
					? 'md:col-span-4 md:col-start-9 md:row-start-2'
					: 'md:col-span-12 md:col-start-1'}
				aria-label="Viona2D visualizations"
			>
				{#if visualization === 'lens'}
					<section
						class="daisy-card border-base-300 bg-base-100 max-h-[calc(100vh-22rem)] overflow-y-auto border p-2"
						aria-label="Selected vector lens"
					>
						<div class="mb-2 flex items-start justify-between gap-2">
							<div>
								<p class="text-xs opacity-65">Selected pair</p>
								<h2 class="font-semibold">
									{selectedPair ? vectorShortLabels[selectedPair.index] : 'No pair'}
								</h2>
							</div>
							<div class="text-right">
								<p class="text-xs opacity-65">Blended D</p>
								<strong class="font-mono text-xl"
									>{selectedPair?.dissimilarity?.toFixed(3) ?? '—'}</strong
								>
							</div>
						</div>
						{#if selectedPair && selectedPair.dissimilarity !== null && selectedPair.refRaw && selectedPair.participantRaw && selectedPair.adjustedParticipantLength !== null}
							{@const refLength = selectedPair.rawReferenceLength ?? 0}
							{@const participantLength = selectedPair.rawParticipantLength ?? 0}
							{@const adjustedLength = selectedPair.adjustedParticipantLength}
							{@const diagramScale = 58 / Math.max(refLength, participantLength, adjustedLength, 1)}
							{@const refX = selectedPair.refRaw[0] * diagramScale}
							{@const refY = selectedPair.refRaw[1] * diagramScale}
							{@const participantUnitX =
								selectedPair.participantRaw[0] / Math.max(participantLength, 1e-9)}
							{@const participantUnitY =
								selectedPair.participantRaw[1] / Math.max(participantLength, 1e-9)}
							{@const adjustedX = participantUnitX * adjustedLength * diagramScale}
							{@const adjustedY = participantUnitY * adjustedLength * diagramScale}
							{@const thetaA = Math.atan2(selectedPair.refRaw[1], selectedPair.refRaw[0])}
							{@const thetaB = Math.atan2(
								selectedPair.participantRaw[1],
								selectedPair.participantRaw[0]
							)}
							{@const deltaAngle = Math.atan2(Math.sin(thetaB - thetaA), Math.cos(thetaB - thetaA))}
							{@const arcStartX = 120 + Math.cos(thetaA) * 25}
							{@const arcStartY = 80 - Math.sin(thetaA) * 25}
							{@const arcEndX = 120 + Math.cos(thetaB) * 25}
							{@const arcEndY = 80 - Math.sin(thetaB) * 25}
							{@const rulerScale = 165 / Math.max(refLength, adjustedLength, 1)}
							{@const refRulerEnd = 36 + refLength * rulerScale}
							{@const participantRulerEnd = 36 + adjustedLength * rulerScale}
							<svg
								class="bg-base-200/40 h-20 w-full rounded-md"
								style="display:block;flex-shrink:0;height:112px;width:100%"
								viewBox="0 0 240 160"
								role="img"
								aria-label={`Vector angle ${selectedPair.angleDegrees?.toFixed(1) ?? 'missing'} degrees; raw reference ${refLength.toFixed(1)} pixels, raw participant ${participantLength.toFixed(1)}, adjusted participant ${adjustedLength.toFixed(1)}`}
							>
								<defs
									><marker
										id="lens-ref-tip"
										viewBox="0 0 10 10"
										refX="8"
										refY="5"
										markerWidth="2"
										markerHeight="2"
										orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#2563eb" /></marker
									></defs
								>
								<line
									x1="120"
									y1="80"
									x2={120 + refX}
									y2={80 - refY}
									stroke="#2563eb"
									stroke-width="3"
									marker-end="url(#lens-ref-tip)"
								/>
								<line
									x1="120"
									y1="80"
									x2={120 + selectedPair.participantRaw[0] * diagramScale}
									y2={80 - selectedPair.participantRaw[1] * diagramScale}
									stroke="#e11d48"
									stroke-width="3"
									stroke-dasharray="7 4"
								/>
								<line
									x1="120"
									y1="80"
									x2={120 + adjustedX}
									y2={80 - adjustedY}
									stroke="#e11d48"
									stroke-width="2"
									stroke-dasharray="2 3"
									opacity="0.65"
								/>
								<path
									d={`M ${arcStartX} ${arcStartY} A 25 25 0 0 ${deltaAngle < 0 ? 1 : 0} ${arcEndX} ${arcEndY}`}
									fill="none"
									stroke="#0f172a"
									stroke-width="1.5"
								/>
								<circle cx="120" cy="80" r="3" fill="#0f172a" />
								<text x="10" y="18" font-size="8" fill="#2563eb">Reference · solid</text><text
									x="10"
									y="30"
									font-size="8"
									fill="#e11d48">Participant · dashed</text
								><text x="10" y="42" font-size="8" fill="#e11d48">Body-scale adjusted · dotted</text
								>
								<line
									x1="36"
									y1="146"
									x2={refRulerEnd}
									y2="146"
									stroke="#2563eb"
									stroke-width="2"
								/>
								<line
									x1="36"
									y1="151"
									x2={participantRulerEnd}
									y2="151"
									stroke="#e11d48"
									stroke-width="2"
									stroke-dasharray="2 3"
								/>
								<line
									x1={refRulerEnd}
									y1="143"
									x2={refRulerEnd}
									y2="149"
									stroke="#2563eb"
									stroke-width="1.5"
								/>
								<line
									x1={participantRulerEnd}
									y1="148"
									x2={participantRulerEnd}
									y2="154"
									stroke="#e11d48"
									stroke-width="1.5"
								/>
								<text x="36" y="140" font-size="7" fill="currentColor"
									>Lengths · ref {refLength.toFixed(0)} px · adjusted participant {adjustedLength.toFixed(
										0
									)} px</text
								>
							</svg>
							<div class="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs tabular-nums">
								<span>Angle θ / π (A)</span><strong class="text-right"
									>{selectedPair.angleError?.toFixed(3) ?? '—'} · {selectedPair.angleDegrees?.toFixed(
										1
									) ?? '—'}°</strong
								>
								<span>Relative adjusted length gap (M)</span><strong class="text-right"
									>{selectedPair.lengthError?.toFixed(3) ?? '—'}</strong
								>
								<span>Angle weight w</span><strong
									class={`text-right ${selectedPair.extrapolated ? 'text-warning' : ''}`}
									>{selectedPair.angleWeight?.toFixed(2) ?? '—'}{selectedPair.extrapolated
										? ' · extrapolated'
										: ''}</strong
								>
								<span>Raw ref / participant → adjusted px</span><strong class="text-right"
									>{refLength.toFixed(0)} / {participantLength.toFixed(0)} → {adjustedLength.toFixed(
										0
									)}</strong
								>
							</div>
							<div class="bg-base-200/70 mt-2 rounded-md p-2 text-[10px] leading-relaxed">
								<p>
									Projected-length gate: reference {selectedPair.referenceGate?.toFixed(2) ?? '—'} / participant
									{selectedPair.participantGate?.toFixed(2) ?? '—'} · 50 px → 0, 100 px → 1
								</p>
								<p class="font-mono">
									A = θ / π · M = |Lref − Ladj| / max(Lref, Ladj) · w = min(raw gates) · D = wA +
									(1−w)M
								</p>
								<p>
									Sref {selectedPair.referenceScale?.toFixed(1) ?? '—'} = .5×shoulder ({comparison?.scaleParts.referenceShoulderWidth?.toFixed(
										0
									) ?? '—'}) + .25×left torso ({comparison?.scaleParts.referenceLeftTorso?.toFixed(
										0
									) ?? '—'}) + .25×right torso ({comparison?.scaleParts.referenceRightTorso?.toFixed(
										0
									) ?? '—'}); Sparticipant {selectedPair.participantScale?.toFixed(1) ?? '—'} = .5×shoulder
									({comparison?.scaleParts.participantShoulderWidth?.toFixed(0) ?? '—'}) + .25×left
									torso ({comparison?.scaleParts.participantLeftTorso?.toFixed(0) ?? '—'}) +
									.25×right torso ({comparison?.scaleParts.participantRightTorso?.toFixed(0) ??
										'—'}).
								</p>
							</div>
						{:else}<p class="text-xs opacity-65">
								{selectedPair?.invalidReason ?? 'Load both poses to inspect this vector pair.'}
							</p>{/if}
						{#if comparison}<p class="border-base-300 mt-2 border-t pt-2 text-xs">
								Overall frame mean · <strong class="font-mono"
									>{comparison.overallDissimilarity?.toFixed(3) ?? 'missing'}</strong
								> · invalid pairs make this frame missing.
							</p>{/if}
					</section>
				{:else if visualization === 'audit'}
					<section
						class="daisy-card border-base-300 bg-base-100 border p-3"
						style="max-height:22vh;overflow-y:auto"
						aria-label="Eight-pair audit"
					>
						<div class="mb-2 flex items-center justify-between">
							<h2 class="font-semibold">Eight-pair audit</h2>
							<span class="text-xs"
								>Frame mean D {comparison?.overallDissimilarity?.toFixed(3) ?? 'missing'}</span
							>
						</div>
						<div class="overflow-x-auto">
							<table class="table-xs table" style="width:100%">
								<thead
									><tr
										><th>Pair</th><th>θ / A</th><th>Raw L / adjusted L</th><th>M</th><th>w</th><th
											>D</th
										></tr
									></thead
								><tbody>
									{#each comparison?.vectors ?? [] as vector (vector.name)}<tr
											class:bg-base-200={selectedVector === vector.index}
										>
											<td
												><button
													type="button"
													class="flex items-center gap-1 text-left"
													aria-pressed={selectedVector === vector.index}
													title={vector.invalidReason ??
														(vector.extrapolated
															? 'Unclamped weight extrapolates outside 0–1'
															: '')}
													onclick={() => (selectedVector = vector.index)}
													><span style={`color:${QIJIA_COLORS[vector.index]}`}>●</span
													>{vectorShortLabels[vector.index]}</button
												></td
											>
											<td
												>{vector.angleDegrees?.toFixed(1) ?? '—'}° / {vector.angleError?.toFixed(
													2
												) ?? '—'}</td
											>
											<td
												>{vector.rawReferenceLength?.toFixed(1) ?? '—'} / {vector.rawParticipantLength?.toFixed(
													1
												) ?? '—'} → {vector.adjustedParticipantLength?.toFixed(1) ?? '—'}</td
											>
											<td>{vector.lengthError?.toFixed(3) ?? '—'}</td>
											<td
												class:text-warning={vector.extrapolated}
												title={`Raw gates: reference ${vector.referenceGate?.toFixed(2) ?? 'missing'}; participant ${vector.participantGate?.toFixed(2) ?? 'missing'}`}
											>
												{vector.angleWeight?.toFixed(2) ?? '—'}{vector.extrapolated ? ' !' : ''}
											</td>
											<td class="font-mono"
												>{vector.dissimilarity?.toFixed(3) ?? vector.invalidReason ?? 'missing'}</td
											>
										</tr>{/each}
								</tbody>
							</table>
						</div>
					</section>
				{:else}
					<section
						class="daisy-card border-base-300 bg-base-100 border p-3"
						aria-label="Angle and length scatter plot"
					>
						<div class="mb-2 flex items-center justify-between">
							<h2 class="font-semibold">Angle × length</h2>
							<span class="text-xs"
								>x = M · y = A · max M {scatterBounds.xMax.toFixed(2)} / A {scatterBounds.yMax.toFixed(
									2
								)}</span
							>
						</div>
						<svg
							class="bg-base-200/40 w-full rounded-md"
							style="display:block;flex-shrink:0;height:160px;width:100%"
							viewBox="0 0 800 160"
							role="img"
							aria-label="Scatter plot of length error against angle error"
						>
							<line x1="48" y1="16" x2="48" y2="132" stroke="currentColor" opacity="0.4" /><line
								x1="48"
								y1="132"
								x2="780"
								y2="132"
								stroke="currentColor"
								opacity="0.4"
							/>
							<text x="4" y="18" font-size="10">A={scatterBounds.yMax.toFixed(2)}</text><text
								x="4"
								y="131"
								font-size="10">A=0</text
							><text x="48" y="151" font-size="10">M=0</text><text x="744" y="151" font-size="10"
								>M={scatterBounds.xMax.toFixed(2)}</text
							>
							{#each comparison?.vectors ?? [] as vector (vector.name)}
								{#if vector.angleError !== null && vector.lengthError !== null}<g
										role="button"
										tabindex="0"
										aria-label={`${vectorShortLabels[vector.index]}: length error ${vector.lengthError.toFixed(2)}, angle error ${vector.angleError.toFixed(2)}, weight ${vector.angleWeight?.toFixed(2) ?? 'missing'}, D ${vector.dissimilarity?.toFixed(2) ?? 'missing'}`}
										onclick={() => (selectedVector = vector.index)}
										onkeydown={(event) =>
											['Enter', ' '].includes(event.key) && (selectedVector = vector.index)}
									>
										{#if selectedVector === vector.index}<circle
												cx={48 + (vector.lengthError / scatterBounds.xMax) * 732}
												cy={132 - (vector.angleError / scatterBounds.yMax) * 116}
												r="9"
												fill="none"
												stroke="currentColor"
												stroke-width="2"
											/>{/if}
										<circle
											cx={48 + (vector.lengthError / scatterBounds.xMax) * 732}
											cy={132 - (vector.angleError / scatterBounds.yMax) * 116}
											r="5"
											fill={QIJIA_COLORS[vector.index]}
											stroke="white"
											stroke-width="1"
										/>
										<text
											x={48 +
												(vector.lengthError / scatterBounds.xMax) * 732 +
												(vector.index % 2 === 0 ? 12 : -12)}
											y={132 -
												(vector.angleError / scatterBounds.yMax) * 116 +
												(vector.index % 4 < 2 ? -9 : 13)}
											text-anchor={vector.index % 2 === 0 ? 'start' : 'end'}
											font-size="8"
											fill="currentColor">{vectorShortLabels[vector.index]}</text
										>
									</g>{/if}
							{/each}
						</svg>
						{#if selectedPair}<p class="mt-2 text-xs">
								Selected {vectorShortLabels[selectedPair.index]} · M {selectedPair.lengthError?.toFixed(
									3
								) ?? '—'} · A {selectedPair.angleError?.toFixed(3) ?? '—'} · w {selectedPair.angleWeight?.toFixed(
									2
								) ?? '—'} · D {selectedPair.dissimilarity?.toFixed(3) ??
									'missing'}{selectedPair.extrapolated ? ' · weight extrapolated' : ''}
							</p>{/if}
					</section>
				{/if}
			</aside>
		</section>

		<div class="timeline-dock fixed inset-x-0 bottom-0 z-40 px-2 pb-[env(safe-area-inset-bottom)]">
			<section
				class="daisy-card border-base-300 bg-base-100 relative mx-auto max-w-[1500px] border shadow-lg"
			>
				<div class="daisy-card-body gap-2 p-3">
					<div class="flex flex-wrap items-center justify-between gap-2">
						<h2 class="daisy-card-title text-base">Frame dissimilarity across time</h2>
						<span class="text-xs opacity-65"
							>Full-performance Viona2D · missing frames shown as gaps</span
						>
					</div>
					<div
						class="bg-base-200/60 relative h-16 overflow-hidden rounded-md sm:h-20"
						style="height:80px"
						aria-label={`Viona2D frame dissimilarity from ${chartBounds.min.toFixed(2)} to ${chartBounds.max.toFixed(2)}`}
					>
						<div
							class="border-base-content/25 absolute inset-x-0 top-1/2 border-t border-dashed"
						></div>
						<svg
							class="absolute inset-0 h-full w-full"
							style="position:absolute;inset:0;width:100%;height:100%"
							viewBox="0 0 100 100"
							preserveAspectRatio="none"
							aria-hidden="true"
							><path
								d={vionaPlotPath}
								fill="none"
								stroke="#e11d48"
								stroke-width="1.8"
								vector-effect="non-scaling-stroke"
							/></svg
						>{#if datasetMode && timelineDuration > 0}{#each timeline.slice(1) as boundary, i (boundary.id)}<div
									class="border-base-content/25 absolute top-0 h-full border-l border-dashed"
									style={`left:${(boundary.startSeconds / timelineDuration) * 100}%`}
								>
									<span class="absolute top-0 left-1 text-[9px] opacity-60">S{i + 2}</span>
								</div>{/each}{/if}{#if comparison || datasetMode}<div
								class="border-primary absolute top-0 h-full border-l-2"
								style={`left:${(datasetMode ? globalTime / Math.max(0.001, timelineDuration) : frameIndex / Math.max(1, maxFrame)) * 100}%`}
							></div>{/if}<span class="absolute top-1 left-2 text-[10px] opacity-60"
							>{chartBounds.max.toFixed(2)}</span
						><span class="absolute bottom-1 left-2 text-[10px] opacity-60"
							>{chartBounds.min.toFixed(2)}</span
						>
						<input
							class="chart-scrubber"
							type="range"
							min="0"
							max={datasetMode ? timelineDuration : maxFrame}
							step={datasetMode ? '0.01' : '1'}
							value={datasetMode ? globalTime : frameIndex}
							oninput={(event) =>
								datasetMode
									? seekGlobalTime(Number(event.currentTarget.value))
									: seek(Number(event.currentTarget.value))}
							aria-label={datasetMode ? 'Seek participant timeline' : 'Seek participant frame'}
						/>
					</div>
					<div class="flex items-center gap-2">
						<button
							class="daisy-btn daisy-btn-square daisy-btn-sm"
							aria-label="Previous frame"
							onclick={() => stepTimeline(-1)}>‹</button
						><button
							class="daisy-btn daisy-btn-square daisy-btn-sm"
							aria-label="Next frame"
							onclick={() => stepTimeline(1)}>›</button
						><span class="min-w-24 text-right font-mono text-[10px] leading-tight sm:min-w-52"
							>{#if datasetMode}{globalTime.toFixed(2)}s / {timelineDuration.toFixed(2)}s · S{activeSegmentIndex +
									1} · row {frameIndex} · src {participantFrame?.csvFrame ?? '—'}{:else}{(
									frameIndex / participant.fps
								).toFixed(2)}s / {duration.toFixed(2)}s{/if}</span
						>
					</div>
					{#if participant.frames.size && reference.frames.size && !referenceFrame}<p
							class="text-warning text-xs"
						>
							No reference pose exists at or before target frame {referenceFrameIndex}; check the
							FPS values and time offset.
						</p>{/if}
				</div>
			</section>
		</div>
	{/if}
</main>

<style>
	.pose-window {
		position: relative;
		overflow: hidden;
		background: #0f172a;
		border-radius: 0.65rem;
	}
	.compact-participant-window {
		width: min(100%, calc(min(43vh, 27rem) * var(--crop-ratio)));
		max-height: min(43vh, 27rem);
		aspect-ratio: var(--crop-ratio);
	}
	.compact-reference-window {
		width: min(100%, calc(5.5rem * var(--crop-ratio)));
		max-height: 5.5rem;
		aspect-ratio: var(--crop-ratio);
	}
	.compact-inspection-window.compact-participant-window {
		width: min(100%, calc(15vh * var(--crop-ratio)));
		max-height: 15vh;
	}
	.compact-inspection-window.compact-reference-window {
		width: min(100%, calc(3.5rem * var(--crop-ratio)));
		max-height: 3.5rem;
	}
	.cropped-video {
		position: absolute;
		max-width: none;
		object-fit: fill;
	}
	.mirror-video {
		transform: scaleX(-1);
	}
	.chart-scrubber {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		margin: 0;
		cursor: ew-resize;
		opacity: 0;
	}
	.chart-scrubber:focus-visible {
		opacity: 0.08;
		outline: 2px solid var(--color-primary);
		outline-offset: -3px;
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
