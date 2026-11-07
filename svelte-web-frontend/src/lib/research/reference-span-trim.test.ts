import { expect, test } from 'vitest';
import {
	keptRowRange,
	meetsAcceptance,
	pairedSpearmanDifference,
	spearman
} from './reference-span-trim';

test('kept rows map full-video marks onto clip-local paired rows', () => {
	const base = {
		clipSpacingSeconds: 4.5,
		rowCount: 135,
		span: { startSeconds: 1, endSeconds: 14.9 }
	};
	expect(keptRowRange({ ...base, clipNumber: 1 })).toEqual({ startRow: 30, endRow: 135 });
	expect(keptRowRange({ ...base, clipNumber: 2 })).toEqual({ startRow: 0, endRow: 135 });
	expect(keptRowRange({ ...base, clipNumber: 4 })).toEqual({ startRow: 0, endRow: 42 });
	expect(keptRowRange({ ...base, clipNumber: 5, rowCount: 26 })).toEqual({
		startRow: 0,
		endRow: 0
	});
});

test('spearman handles ties and monotone relations', () => {
	expect(spearman([1, 2, 3, 4], [10, 20, 30, 40])).toBeCloseTo(1);
	expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
	expect(spearman([1, 1, 2, 3], [1, 2, 3, 4])).toBeCloseTo(0.9487, 3);
	expect(spearman([1, 2], [1, 2])).toBeNaN();
});

test('paired difference detects a trimmed metric that tracks ratings better', () => {
	const rows = Array.from({ length: 60 }, (_, i) => {
		const rating = (i % 5) + 1;
		const noise = ((i * 7919) % 13) / 13;
		return {
			cluster: `p${Math.floor(i / 3)}`,
			rating,
			trimmed: rating + noise * 0.5,
			full: rating + noise * 4
		};
	});
	const result = pairedSpearmanDifference(rows, { replicates: 500 });
	expect(result.n).toBe(60);
	expect(result.clusters).toBe(20);
	expect(result.difference).toBeGreaterThan(0.05);
	expect(result.ci95[0]).toBeGreaterThan(0);
	expect(meetsAcceptance(result)).toBe(true);
	const same = pairedSpearmanDifference(
		rows.map((row) => ({ ...row, trimmed: row.full })),
		{ replicates: 200 }
	);
	expect(same.difference).toBe(0);
	expect(meetsAcceptance(same)).toBe(false);
});
