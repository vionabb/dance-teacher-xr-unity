import {
	compareQijiaFrameVariant,
	pairFramesByRowIndex,
	parseLegacyReferencePoseCsv,
	parseRawPoseCsv,
	participantVideoTimeForRow,
	reindexFramesByRowIndex,
	type QijiaVisibilityMode
} from '$lib/ai/motionmetrics/qijia2d-inspector';

/**
 * Display-only aggregation of the Qijia2D frame scores the inspector already shows
 * (score = 5 × (1 − mean vector error / 2)). The math lives in the metric modules; this file
 * only pairs rows the same way the inspector page does and averages valid frames.
 */
export type ScoreSample = { time: number; score: number | null };
export type ScoreSummary = { score: number | null; valid: number; total: number };

export const QIJIA_ALL_VECTORS = [0, 1, 2, 3, 4, 5, 6, 7] as const;

export function qijiaFrameScore(sum: number | null, validCount: number): number | null {
	if (sum === null || validCount <= 0) return null;
	const score = 5 * (1 - sum / validCount / 2);
	return Number.isFinite(score) ? score : null;
}

/** Per-row samples for one segment, paired exactly as the dataset inspector pairs them. */
export function qijiaSegmentSamples(
	participantPoseCsv: string,
	referencePoseCsv: string,
	durationSeconds: number,
	vectors: readonly number[] = QIJIA_ALL_VECTORS,
	visibility: QijiaVisibilityMode = 'none'
): ScoreSample[] {
	const participantFrames = reindexFramesByRowIndex(parseRawPoseCsv(participantPoseCsv));
	const pair = pairFramesByRowIndex(
		participantFrames,
		parseLegacyReferencePoseCsv(referencePoseCsv)
	);
	return Array.from({ length: pair.frameCount }, (_, row) => {
		const participant = participantFrames.get(row);
		const reference = pair.referenceFrames.get(row);
		const time = participant ? participantVideoTimeForRow(participantFrames, row, 30) : 0;
		if (!participant || !reference || time >= durationSeconds) return { time, score: null };
		const variant = compareQijiaFrameVariant(reference, participant, vectors, visibility);
		return { time, score: qijiaFrameScore(variant.sum, variant.validCount) };
	});
}

function summarize(samples: readonly ScoreSample[]): ScoreSummary {
	const valid = samples.flatMap((sample) =>
		sample.score !== null && Number.isFinite(sample.score) ? [sample.score] : []
	);
	return {
		score: valid.length ? valid.reduce((total, value) => total + value, 0) / valid.length : null,
		valid: valid.length,
		total: samples.length
	};
}

/** Mean frame score over the whole segment, inside [start, end], and outside it. */
export function intervalScores(samples: readonly ScoreSample[], start: number, end: number) {
	const inside = (sample: ScoreSample) => sample.time >= start && sample.time <= end;
	return {
		whole: summarize(samples),
		interval: summarize(samples.filter(inside)),
		without: summarize(samples.filter((sample) => !inside(sample)))
	};
}

/** Metric minus human on the shared 0–5 display axis. The scales are not calibrated. */
export function scoreGap(metric: number | null, human: number | null | undefined) {
	return metric === null || human === null || human === undefined ? null : metric - human;
}

/** Fraction of values strictly below `value`, plus half the ties (mid-rank percentile, 0–1). */
export function percentileRank(values: readonly number[], value: number) {
	if (!values.length) return null;
	let below = 0;
	let ties = 0;
	for (const other of values) {
		if (other < value) below++;
		else if (other === value) ties++;
	}
	return (below + ties / 2) / values.length;
}

/** Percentile-point gap (metric rank − human rank), −100…100. Null until every score is known. */
export function rankGaps(
	rows: ReadonlyArray<{ id: string; human: number | null; metric: number | null }>
): Map<string, number> {
	const result = new Map<string, number>();
	if (!rows.length || rows.some((row) => row.metric === null || row.human === null)) return result;
	const humans = rows.map((row) => row.human!);
	const metrics = rows.map((row) => row.metric!);
	for (const row of rows)
		result.set(
			row.id,
			100 * (percentileRank(metrics, row.metric!)! - percentileRank(humans, row.human!)!)
		);
	return result;
}

export function formatGap(gap: number | null, digits = 2) {
	if (gap === null) return '—';
	return `${gap >= 0 ? '+' : '−'}${Math.abs(gap).toFixed(digits)}`;
}

export function gapDirection(gap: number | null, tolerance = 0.25) {
	if (gap === null) return 'No comparison';
	if (Math.abs(gap) < tolerance) return 'Roughly agrees';
	return gap < 0 ? 'Metric harsher than raters' : 'Metric kinder than raters';
}
