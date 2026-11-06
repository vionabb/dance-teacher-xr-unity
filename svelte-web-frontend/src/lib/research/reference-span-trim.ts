/**
 * Pure helpers for the rating-relevant-time-spans stage 1 analysis
 * (lab-log/2026-11-06-rating-relevant-time-spans.md).
 *
 * Legacy reference segment clip N starts at (N - 1) × clip spacing in the full
 * tutorial video, and the offline metric fixture pairs reference and
 * participant rows by index at 30 rows per second from clip-local time 0.
 */

export const FIXTURE_ROWS_PER_SECOND = 30;

export type DanceSpan = { startSeconds: number; endSeconds: number };

/**
 * Row range [startRow, endRow) of a segment that lies inside the marked dance
 * span. Rows are paired reference/participant rows; rowCount is the paired
 * (truncated) length.
 */
export function keptRowRange(input: {
	clipNumber: number;
	clipSpacingSeconds: number;
	rowCount: number;
	span: DanceSpan;
	rowsPerSecond?: number;
}): { startRow: number; endRow: number } {
	const rate = input.rowsPerSecond ?? FIXTURE_ROWS_PER_SECOND;
	const clipStart = (input.clipNumber - 1) * input.clipSpacingSeconds;
	const localStart = input.span.startSeconds - clipStart;
	const localEnd = input.span.endSeconds - clipStart;
	const startRow = Math.min(input.rowCount, Math.max(0, Math.ceil(localStart * rate - 1e-9)));
	const endRow = Math.max(startRow, Math.min(input.rowCount, Math.floor(localEnd * rate + 1e-9)));
	return { startRow, endRow };
}

function ranks(values: number[]): number[] {
	const order = values.map((value, index) => ({ value, index })).sort((a, b) => a.value - b.value);
	const result = new Array<number>(values.length);
	for (let i = 0; i < order.length; ) {
		let j = i;
		while (j + 1 < order.length && order[j + 1].value === order[i].value) j++;
		const rank = (i + j) / 2 + 1;
		for (let k = i; k <= j; k++) result[order[k].index] = rank;
		i = j + 1;
	}
	return result;
}

function pearson(x: number[], y: number[]): number {
	const n = x.length;
	const mx = x.reduce((a, b) => a + b, 0) / n;
	const my = y.reduce((a, b) => a + b, 0) / n;
	let sxy = 0;
	let sxx = 0;
	let syy = 0;
	for (let i = 0; i < n; i++) {
		sxy += (x[i] - mx) * (y[i] - my);
		sxx += (x[i] - mx) ** 2;
		syy += (y[i] - my) ** 2;
	}
	return sxx === 0 || syy === 0 ? NaN : sxy / Math.sqrt(sxx * syy);
}

/** Spearman rank correlation with average ranks for ties; NaN for fewer than 3 pairs. */
export function spearman(x: number[], y: number[]): number {
	if (x.length !== y.length) throw new Error('Spearman inputs differ in length');
	if (x.length < 3) return NaN;
	return pearson(ranks(x), ranks(y));
}

/** Deterministic PRNG so bootstrap intervals are reproducible. */
export function mulberry32(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export type PairedRow = { cluster: string; full: number; trimmed: number; rating: number };

function quantile(sorted: number[], q: number) {
	const position = (sorted.length - 1) * q;
	const low = Math.floor(position);
	const high = Math.ceil(position);
	return sorted[low] + (sorted[high] - sorted[low]) * (position - low);
}

/**
 * Paired comparison of Spearman(trimmed, rating) - Spearman(full, rating),
 * with a percentile bootstrap that resamples whole clusters (participants).
 */
export function pairedSpearmanDifference(
	rows: PairedRow[],
	options: { replicates?: number; seed?: number } = {}
) {
	const valid = rows.filter((row) =>
		[row.full, row.trimmed, row.rating].every((value) => Number.isFinite(value))
	);
	const statistic = (sample: PairedRow[]) => {
		const rating = sample.map((row) => row.rating);
		const full = spearman(
			sample.map((row) => row.full),
			rating
		);
		const trimmed = spearman(
			sample.map((row) => row.trimmed),
			rating
		);
		return { full, trimmed, difference: trimmed - full };
	};
	const observed = statistic(valid);
	const clusters = new Map<string, PairedRow[]>();
	for (const row of valid) clusters.set(row.cluster, [...(clusters.get(row.cluster) ?? []), row]);
	const keys = [...clusters.keys()];
	const random = mulberry32(options.seed ?? 20261106);
	const differences: number[] = [];
	for (let r = 0; r < (options.replicates ?? 2000); r++) {
		const sample: PairedRow[] = [];
		for (let i = 0; i < keys.length; i++)
			sample.push(...clusters.get(keys[Math.floor(random() * keys.length)])!);
		const { difference } = statistic(sample);
		if (Number.isFinite(difference)) differences.push(difference);
	}
	differences.sort((a, b) => a - b);
	return {
		n: valid.length,
		clusters: keys.length,
		...observed,
		ci95:
			differences.length > 0
				? ([quantile(differences, 0.025), quantile(differences, 0.975)] as const)
				: ([NaN, NaN] as const),
		bootstrapReplicates: differences.length
	};
}

/** The pre-agreed acceptance rule: improvement of at least 0.05 and a 95% CI above 0. */
export function meetsAcceptance(result: { difference: number; ci95: readonly [number, number] }) {
	return result.difference >= 0.05 && result.ci95[0] > 0;
}
