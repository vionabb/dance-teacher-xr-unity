import { researchApiPrefix, type ResearchBackend } from './discrepancy-client';
import type { ScoreSummary } from './segment-score';

/**
 * Browser cache of whole-segment Qijia2D baseline scores, keyed by backend and metric release
 * so a new release never reuses old numbers. Scores are recomputable; storage failures only
 * mean they are fetched again.
 */
export type SegmentScore = ScoreSummary & { segmentId: string; inputVersion: string | null };
export type ScoreDistribution = { humans: number[]; metrics: number[]; count: number };

const prefix = (backend: ResearchBackend, release: string) =>
	`discrepancy-score:v1:${backend}:${release}`;

export function readCachedScores(backend: ResearchBackend, release: string) {
	try {
		const raw = localStorage.getItem(prefix(backend, release));
		const parsed = raw ? JSON.parse(raw) : null;
		return parsed && typeof parsed === 'object'
			? (parsed as Record<string, SegmentScore>)
			: ({} as Record<string, SegmentScore>);
	} catch {
		return {} as Record<string, SegmentScore>;
	}
}
export function writeCachedScores(
	backend: ResearchBackend,
	release: string,
	scores: Record<string, SegmentScore>
) {
	try {
		localStorage.setItem(prefix(backend, release), JSON.stringify(scores));
	} catch {
		/* Scores are recomputable. */
	}
}
export function readDistribution(backend: ResearchBackend, release: string) {
	try {
		const raw = localStorage.getItem(`${prefix(backend, release)}:distribution`);
		const parsed = raw ? JSON.parse(raw) : null;
		return parsed && Array.isArray(parsed.humans) && Array.isArray(parsed.metrics)
			? (parsed as ScoreDistribution)
			: null;
	} catch {
		return null;
	}
}
export function writeDistribution(
	backend: ResearchBackend,
	release: string,
	distribution: ScoreDistribution
) {
	try {
		localStorage.setItem(`${prefix(backend, release)}:distribution`, JSON.stringify(distribution));
	} catch {
		/* Recomputed on the next queue visit. */
	}
}

export async function fetchScores(
	backend: ResearchBackend,
	ids: string[],
	signal?: AbortSignal
): Promise<SegmentScore[]> {
	const response = await fetch(
		`${researchApiPrefix(backend)}/discrepancy/scores?ids=${ids.join(',')}`,
		{ cache: 'no-store', signal }
	);
	if (!response.ok) throw new Error(`Scoring failed (${response.status}).`);
	return response.json();
}
