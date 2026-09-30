import Papa from 'papaparse';
import {
	GetNormalized2DVector,
	QijiaMethodComparisonVectors,
	QijiaMethodComparisionVectorNames
} from '../EvaluationCommonUtils';
import {
	PoseLandmarkKeysUpperSnakeCase,
	type Pose2DPixelLandmarks
} from '$lib/webcam/mediapipe-utils';

export type InspectorFrame = {
	frame: number;
	landmarks: Pose2DPixelLandmarks;
	csvFrame?: number;
	timestampMs?: number;
};
export type ResolvedFrame = { targetFrame: number; frame: InspectorFrame | null; carried: boolean };
export type VectorResult = {
	index: number;
	name: string;
	src: number;
	dest: number;
	ref: [number, number] | null;
	participant: [number, number] | null;
	error: number | null;
	invalidReason?: string;
};

export const QIJIA_COLORS = [
	'#e11d48',
	'#ea580c',
	'#ca8a04',
	'#16a34a',
	'#0891b2',
	'#2563eb',
	'#7c3aed',
	'#c026d3'
];

/** Parse image-space pose2d CSV without collapsing sparse frame indexes. */
export function parseRawPoseCsv(csvText: string): Map<number, InspectorFrame> {
	const parsed = Papa.parse<Record<string, string>>(csvText, {
		header: true,
		skipEmptyLines: true
	});
	if (parsed.errors.length) throw new Error(parsed.errors[0].message);
	const headers = new Set(parsed.meta.fields ?? []);
	if (!headers.has('frame')) throw new Error('Missing required CSV column: frame.');
	const requiredLandmarks = new Set(
		QijiaMethodComparisonVectors.flatMap(([src, dest]) => [src, dest])
	);
	const missingColumns = [...requiredLandmarks].flatMap((index) => {
		const name = PoseLandmarkKeysUpperSnakeCase[index];
		return [`${name}_x`, `${name}_y`].filter((column) => !headers.has(column));
	});
	if (missingColumns.length)
		throw new Error(`Missing required Qijia coordinate columns: ${missingColumns.join(', ')}.`);
	const rows = new Map<number, InspectorFrame>();
	const numeric = (value: string | undefined) =>
		value === undefined || value.trim() === '' ? Number.NaN : Number(value);
	for (const [rowIndex, row] of parsed.data.entries()) {
		const frame = numeric(row.frame);
		if (!Number.isInteger(frame) || frame < 0)
			throw new Error(`Invalid frame ID on CSV data row ${rowIndex + 2}: “${row.frame ?? ''}”.`);
		if (rows.has(frame))
			throw new Error(`Duplicate frame ID ${frame} on CSV data row ${rowIndex + 2}.`);
		const landmarks = PoseLandmarkKeysUpperSnakeCase.map((name) => ({
			x: numeric(row[`${name}_x`]),
			y: numeric(row[`${name}_y`]),
			dist_from_camera: numeric(row[`${name}_distance`]),
			visibility: numeric(row[`${name}_vis`])
		}));
		rows.set(frame, { frame, csvFrame: frame, landmarks });
	}
	if (!rows.size) throw new Error('No rows with a numeric frame column were found.');
	return rows;
}

/** Read legacy combined reference CSVs while retaining timestamps only as source metadata. */
export function parseLegacyReferencePoseCsv(csvText: string): Map<number, InspectorFrame> {
	const parsed = Papa.parse<Record<string, string>>(csvText, {
		header: true,
		skipEmptyLines: true
	});
	if (parsed.errors.length) throw new Error(parsed.errors[0].message);
	const headers = new Set(parsed.meta.fields ?? []);
	for (const column of ['frame', 'timestamp']) {
		if (!headers.has(column)) throw new Error(`Missing required reference CSV column: ${column}.`);
	}
	const requiredLandmarks = new Set(
		QijiaMethodComparisonVectors.flatMap(([src, dest]) => [src, dest])
	);
	const missingColumns = [...requiredLandmarks].flatMap((index) => {
		const name = PoseLandmarkKeysUpperSnakeCase[index];
		return [`${name}_x_2d`, `${name}_y_2d`].filter((column) => !headers.has(column));
	});
	if (missingColumns.length)
		throw new Error(`Missing reference Qijia coordinate columns: ${missingColumns.join(', ')}.`);
	const numeric = (value: string | undefined) =>
		value === undefined || value.trim() === '' ? Number.NaN : Number(value);
	const frames = new Map<number, InspectorFrame>();
	for (const [rowIndex, row] of parsed.data.entries()) {
		const csvFrame = numeric(row.frame);
		const timestampMs = numeric(row.timestamp);
		if (!Number.isFinite(csvFrame) || !Number.isFinite(timestampMs)) {
			throw new Error(`Invalid source frame or timestamp on reference CSV row ${rowIndex + 2}.`);
		}
		const landmarks = PoseLandmarkKeysUpperSnakeCase.map((name) => ({
			x: numeric(row[`${name}_x_2d`]),
			y: numeric(row[`${name}_y_2d`]),
			dist_from_camera: numeric(row[`${name}_z_2d`]),
			visibility: numeric(row[`${name}_visibility_2d`])
		}));
		frames.set(rowIndex, { frame: rowIndex, csvFrame, timestampMs, landmarks });
	}
	if (!frames.size) throw new Error('No rows were found in the reference pose CSV.');
	return frames;
}

/** Match the offline metric fixture: pair poses in CSV row order and truncate to the shorter clip. */
export function pairFramesByRowIndex(
	participantFrames: ReadonlyMap<number, InspectorFrame>,
	referenceFrames: ReadonlyMap<number, InspectorFrame>
) {
	const participants = [...reindexFramesByRowIndex(participantFrames).values()];
	const references = [...reindexFramesByRowIndex(referenceFrames).values()];
	const frameCount = Math.min(participants.length, references.length);
	return {
		frameCount,
		participantFrames: new Map(
			participants.slice(0, frameCount).map((frame) => [frame.frame, frame])
		),
		referenceFrames: new Map(references.slice(0, frameCount).map((frame) => [frame.frame, frame]))
	};
}

export function reindexFramesByRowIndex(frames: ReadonlyMap<number, InspectorFrame>) {
	return new Map(
		[...frames.values()].map((frame, index) => [
			index,
			{ ...frame, frame: index, csvFrame: frame.csvFrame ?? frame.frame }
		])
	);
}

/** Resolve a paired row to its source video time; sparse source frame IDs stay intact. */
export function participantVideoTimeForRow(
	frames: Map<number, InspectorFrame>,
	rowIndex: number,
	fps: number
): number {
	const sourceFrame = frames.get(rowIndex)?.csvFrame ?? rowIndex;
	return sourceFrame / fps;
}

export type ContinuousTimelineSegment = {
	id: string;
	startSeconds: number;
	endSeconds: number;
	durationSeconds: number;
};

export function buildContinuousTimeline(
	segments: Array<{ id: string; durationSeconds: number | null; fallbackDurationSeconds: number }>
): ContinuousTimelineSegment[] {
	let cursor = 0;
	return segments.map((segment) => {
		const durationSeconds =
			segment.durationSeconds !== null &&
			Number.isFinite(segment.durationSeconds) &&
			segment.durationSeconds > 0
				? segment.durationSeconds
				: Math.max(0, segment.fallbackDurationSeconds);
		const timelineSegment = {
			id: segment.id,
			startSeconds: cursor,
			endSeconds: cursor + durationSeconds,
			durationSeconds
		};
		cursor = timelineSegment.endSeconds;
		return timelineSegment;
	});
}

export function locateTimelineSegment(
	timeline: ContinuousTimelineSegment[],
	timeSeconds: number
): { segmentIndex: number; localTimeSeconds: number } | null {
	if (!timeline.length || !Number.isFinite(timeSeconds) || timeSeconds < 0) return null;
	const index = timeline.findIndex(
		(segment, i) =>
			timeSeconds < segment.endSeconds ||
			(i === timeline.length - 1 && timeSeconds <= segment.endSeconds)
	);
	if (index < 0) return null;
	return {
		segmentIndex: index,
		localTimeSeconds: timeSeconds - timeline[index].startSeconds
	};
}

/** Ignore media events emitted for the previous seek until the requested segment time is reached. */
export function matchesTimelineSeekTarget(
	actualSegmentIndex: number,
	actualLocalTimeSeconds: number,
	targetSegmentIndex: number,
	targetLocalTimeSeconds: number,
	toleranceSeconds = 0.08
): boolean {
	return (
		actualSegmentIndex === targetSegmentIndex &&
		Number.isFinite(actualLocalTimeSeconds) &&
		Math.abs(actualLocalTimeSeconds - targetLocalTimeSeconds) <= toleranceSeconds
	);
}

/** Map participant media time to the latest pose CSV row at or before that source frame. */
export function sourcePoseRowAtTime(
	frames: Map<number, InspectorFrame>,
	timeSeconds: number,
	fps: number
): number | null {
	if (!Number.isFinite(timeSeconds) || timeSeconds < 0 || !Number.isFinite(fps) || fps <= 0)
		return null;
	const targetSourceFrame = Math.floor(timeSeconds * fps);
	let selectedRow: number | null = null;
	let selectedSourceFrame = Number.NEGATIVE_INFINITY;
	for (const [row, frame] of frames) {
		const sourceFrame = frame.csvFrame ?? frame.frame;
		if (sourceFrame <= targetSourceFrame && sourceFrame > selectedSourceFrame) {
			selectedRow = row;
			selectedSourceFrame = sourceFrame;
		}
	}
	return selectedRow;
}

/** Match production sampling: floor timestamp × FPS, then use the latest available row at or before it. */
export function resolvePoseFrameAtTime(
	frames: ReadonlyMap<number, InspectorFrame>,
	timeSeconds: number,
	fps: number,
	sortedFrameNumbers: readonly number[] = [...frames.keys()].sort((a, b) => a - b)
): ResolvedFrame {
	const targetFrame = Math.floor(timeSeconds * fps);
	if (!Number.isFinite(targetFrame) || targetFrame < 0 || frames.size === 0) {
		return { targetFrame, frame: null, carried: false };
	}
	let low = 0;
	let high = sortedFrameNumbers.length - 1;
	let selectedNumber: number | null = null;
	while (low <= high) {
		const middle = Math.floor((low + high) / 2);
		const frameNumber = sortedFrameNumbers[middle];
		if (frameNumber <= targetFrame) {
			selectedNumber = frameNumber;
			low = middle + 1;
		} else high = middle - 1;
	}
	const selected = selectedNumber === null ? null : (frames.get(selectedNumber) ?? null);
	return {
		targetFrame,
		frame: selected,
		carried: selected !== null && selected.frame < targetFrame
	};
}

function normalized(
	landmarks: Pose2DPixelLandmarks,
	src: number,
	dest: number
): [number, number] | null {
	const [x, y] = GetNormalized2DVector(landmarks, src, dest);
	return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
}

/** Frame values mirror the production Qijia metric (mean unit-vector distance, then 0..5 scale). */
export function compareQijiaFrame(reference: InspectorFrame, participant: InspectorFrame) {
	const vectors: VectorResult[] = QijiaMethodComparisonVectors.map(([src, dest], index) => {
		const ref = normalized(reference.landmarks, src, dest);
		const user = normalized(participant.landmarks, src, dest);
		const error = ref && user ? Math.hypot(ref[0] - user[0], ref[1] - user[1]) : null;
		return {
			index,
			name: QijiaMethodComparisionVectorNames[index],
			src,
			dest,
			ref,
			participant: user,
			error,
			invalidReason: !ref
				? 'Reference vector has zero or non-finite length'
				: !user
					? 'Participant vector has zero or non-finite length'
					: undefined
		};
	});
	// The production implementation's `magnitude || 0` makes invalid vector pairs contribute zero.
	// Keep that displayed score faithful, while retaining nulls and diagnostics above for debugging.
	const sum = vectors.reduce((total, vector) => total + (vector.error ?? 0), 0);
	const mean = sum / vectors.length;
	return {
		vectors,
		sum,
		mean,
		score: 5 * (1 - mean / 2),
		invalidCount: vectors.filter((v) => v.error === null).length
	};
}

/** Restrict the background skeleton to the eight segments the metric actually scores. */
export const UPPER_SKELETON_EDGES: ReadonlyArray<readonly [number, number]> =
	QijiaMethodComparisonVectors;

export const QIJIA_LANDMARK_INDICES = [
	...new Set(QijiaMethodComparisonVectors.flatMap(([src, dest]) => [src, dest]))
];

/** Bound a source-space crop around scored landmarks, preferring confident points. */
export function getQijiaPoseCrop(
	frame: InspectorFrame | undefined,
	videoWidth?: number,
	videoHeight?: number
) {
	return getQijiaPoseCropForFrames(frame ? [frame] : [], videoWidth, videoHeight, true);
}

/** Fit one stable, robust crop around scored pose landmarks across a whole clip/performance. */
export function getQijiaPoseCropForFrames(
	frames: Iterable<InspectorFrame>,
	videoWidth?: number,
	videoHeight?: number,
	includeNearbyNose = false
) {
	const width = videoWidth && videoWidth > 0 ? videoWidth : 640;
	const height = videoHeight && videoHeight > 0 ? videoHeight : 480;
	const xs: number[] = [];
	const ys: number[] = [];
	for (const frame of frames) {
		const marks = QIJIA_LANDMARK_INDICES.map((index) => frame.landmarks[index]).filter(
			(point) =>
				!!point &&
				Number.isFinite(point.x) &&
				Number.isFinite(point.y) &&
				(point.visibility === undefined || point.visibility >= 0.35) &&
				point.x >= 0 &&
				point.x <= width &&
				point.y >= 0 &&
				point.y <= height
		);
		if (!marks.length) continue;
		const minX = Math.min(...marks.map((point) => point.x));
		const maxX = Math.max(...marks.map((point) => point.x));
		const minY = Math.min(...marks.map((point) => point.y));
		const maxY = Math.max(...marks.map((point) => point.y));
		const nose = includeNearbyNose ? frame.landmarks[0] : undefined;
		if (
			nose &&
			Number.isFinite(nose.x) &&
			Number.isFinite(nose.y) &&
			(nose.visibility === undefined || nose.visibility >= 0.35) &&
			nose.x >= minX - Math.max((maxX - minX) * 0.75, 100) &&
			nose.x <= maxX + Math.max((maxX - minX) * 0.75, 100) &&
			nose.y >= minY - Math.max((maxY - minY) * 2.5, 180) &&
			nose.y <= maxY + Math.max((maxY - minY) * 2.5, 180) &&
			nose.x >= 0 &&
			nose.x <= width &&
			nose.y >= 0 &&
			nose.y <= height
		)
			marks.push(nose);
		for (const point of marks) {
			xs.push(point.x);
			ys.push(point.y);
		}
	}
	if (!xs.length) return { x: 0, y: 0, w: width, h: height };
	const quantile = (values: number[], p: number) => {
		const sorted = [...values].sort((a, b) => a - b);
		return sorted[Math.floor((sorted.length - 1) * p)];
	};
	// Trim isolated detector excursions while retaining the full temporal range of the motion.
	const x0 = quantile(xs, 0.01);
	const x1 = quantile(xs, 0.99);
	const y0 = quantile(ys, 0.01);
	const y1 = quantile(ys, 0.99);
	const padX = Math.max((x1 - x0) * 0.2, 45);
	const padY = Math.max((y1 - y0) * 0.2, 45);
	const centerX = (x0 + x1) / 2;
	const centerY = (y0 + y1) / 2;
	const aspect = width / height;
	let cropWidth = Math.max(120, x1 - x0 + padX * 2);
	let cropHeight = Math.max(160, y1 - y0 + padY * 2);
	if (cropWidth / cropHeight > aspect) cropHeight = cropWidth / aspect;
	else cropWidth = cropHeight * aspect;
	const scale = Math.min(1, width / cropWidth, height / cropHeight);
	cropWidth *= scale;
	cropHeight *= scale;
	return {
		x: Math.max(0, Math.min(width - cropWidth, centerX - cropWidth / 2)),
		y: Math.max(0, Math.min(height - cropHeight, centerY - cropHeight / 2)),
		w: cropWidth,
		h: cropHeight
	};
}

export type NormalizedQijiaPoseCrop = { x: number; y: number; w: number; h: number };

/** Aggregate a fixed video-relative crop across segments with different source resolutions. */
export function getQijiaNormalizedPoseCropForSegments(
	segments: Array<{
		frames: Iterable<InspectorFrame>;
		videoWidth: number;
		videoHeight: number;
	}>
): NormalizedQijiaPoseCrop {
	const xs: number[] = [];
	const ys: number[] = [];
	let minimumPadX = 0;
	let minimumPadY = 0;
	for (const segment of segments) {
		const { videoWidth: width, videoHeight: height } = segment;
		if (!(width > 0 && height > 0)) continue;
		minimumPadX = Math.max(minimumPadX, 45 / width);
		minimumPadY = Math.max(minimumPadY, 45 / height);
		for (const frame of segment.frames) {
			for (const index of QIJIA_LANDMARK_INDICES) {
				const point = frame.landmarks[index];
				if (
					!point ||
					!Number.isFinite(point.x) ||
					!Number.isFinite(point.y) ||
					(point.visibility !== undefined && point.visibility < 0.35) ||
					point.x < 0 ||
					point.x > width ||
					point.y < 0 ||
					point.y > height
				)
					continue;
				xs.push(point.x / width);
				ys.push(point.y / height);
			}
		}
	}
	if (!xs.length) return { x: 0, y: 0, w: 1, h: 1 };
	const quantile = (values: number[], p: number) => {
		const sorted = [...values].sort((a, b) => a - b);
		return sorted[Math.floor((sorted.length - 1) * p)];
	};
	const x0 = quantile(xs, 0.01);
	const x1 = quantile(xs, 0.99);
	const y0 = quantile(ys, 0.01);
	const y1 = quantile(ys, 0.99);
	const padX = Math.max((x1 - x0) * 0.2, minimumPadX);
	const padY = Math.max((y1 - y0) * 0.2, minimumPadY);
	const left = Math.max(0, x0 - padX);
	const top = Math.max(0, y0 - padY);
	const right = Math.min(1, x1 + padX);
	const bottom = Math.min(1, y1 + padY);
	return { x: left, y: top, w: right - left, h: bottom - top };
}

/** Map a shared normalized viewport into one segment's pixel coordinates. */
export function mapQijiaNormalizedCropToVideo(
	crop: NormalizedQijiaPoseCrop,
	videoWidth: number,
	videoHeight: number
) {
	const width = videoWidth > 0 ? videoWidth : 640;
	const height = videoHeight > 0 ? videoHeight : 480;
	return {
		x: crop.x * width,
		y: crop.y * height,
		w: crop.w * width,
		h: crop.h * height
	};
}
