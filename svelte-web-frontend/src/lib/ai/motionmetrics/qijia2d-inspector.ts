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
	const reindex = (frames: ReadonlyMap<number, InspectorFrame>) =>
		[...frames.values()].map((frame, index) => ({
			...frame,
			frame: index,
			csvFrame: frame.csvFrame ?? frame.frame
		}));
	const participants = reindex(participantFrames);
	const references = reindex(referenceFrames);
	const frameCount = Math.min(participants.length, references.length);
	return {
		frameCount,
		participantFrames: new Map(
			participants.slice(0, frameCount).map((frame) => [frame.frame, frame])
		),
		referenceFrames: new Map(references.slice(0, frameCount).map((frame) => [frame.frame, frame]))
	};
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
	const widthLimit = videoWidth && videoWidth > 0 ? videoWidth : Number.POSITIVE_INFINITY;
	const heightLimit = videoHeight && videoHeight > 0 ? videoHeight : Number.POSITIVE_INFINITY;
	const points = QIJIA_LANDMARK_INDICES.map((index) => frame?.landmarks[index]).filter(
		(point): point is NonNullable<typeof point> =>
			!!point && Number.isFinite(point.x) && Number.isFinite(point.y)
	);
	const confident = points.filter(
		(point) => point.visibility === undefined || point.visibility >= 0.35
	);
	const marks = confident.length ? confident : points;
	const nose = frame?.landmarks[0];
	if (
		nose &&
		Number.isFinite(nose.x) &&
		Number.isFinite(nose.y) &&
		(nose.visibility === undefined || nose.visibility >= 0.35) &&
		marks.length
	) {
		const scoredX = marks.map((point) => point.x);
		const scoredY = marks.map((point) => point.y);
		const tolerance = Math.max(
			(Math.max(...scoredX) - Math.min(...scoredX)) * 0.75,
			(Math.max(...scoredY) - Math.min(...scoredY)) * 2.5,
			180
		);
		const nearScoredPose =
			nose.x >= Math.min(...scoredX) - tolerance &&
			nose.x <= Math.max(...scoredX) + tolerance &&
			nose.y >= Math.min(...scoredY) - tolerance &&
			nose.y <= Math.max(...scoredY) + tolerance;
		if (nearScoredPose) marks.push(nose);
	}
	if (!marks.length) {
		return {
			x: 0,
			y: 0,
			w: Number.isFinite(widthLimit) ? widthLimit : 640,
			h: Number.isFinite(heightLimit) ? heightLimit : 480
		};
	}
	const xs = marks.map((point) => point.x);
	const ys = marks.map((point) => point.y);
	const x0 = Math.min(...xs);
	const x1 = Math.max(...xs);
	const y0 = Math.min(...ys);
	const y1 = Math.max(...ys);
	const padX = Math.max((x1 - x0) * 0.28, 45);
	const padY = Math.max((y1 - y0) * 0.2, 45);
	const x = Math.max(0, x0 - padX);
	const y = Math.max(0, y0 - padY);
	const w = Math.min(
		widthLimit,
		Math.max(Math.min(120, widthLimit), Math.min(widthLimit, x1 + padX) - x)
	);
	const h = Math.min(
		heightLimit,
		Math.max(Math.min(160, heightLimit), Math.min(heightLimit, y1 + padY) - y)
	);
	const centerX = (x + Math.min(widthLimit, x1 + padX)) / 2;
	const centerY = (y + Math.min(heightLimit, y1 + padY)) / 2;
	return {
		x: Math.max(0, Math.min(widthLimit - w, centerX - w / 2)),
		y: Math.max(0, Math.min(heightLimit - h, centerY - h / 2)),
		w,
		h
	};
}
