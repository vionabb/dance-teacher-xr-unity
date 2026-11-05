import type { DiscrepancyObservation } from './discrepancy';

export type ResearchBackend = 'local' | 'hosted';
export type DiscrepancyTask = {
	performanceId: string;
	segmentId: string;
	participantLabel: string;
	study: string;
	dance: string;
	condition: string;
	phase: string | null;
	clipNumber: number;
	referenceAvailable: boolean;
	human: {
		human_rating: number | null;
		rating_1: number | null;
		rating_2: number | null;
		rating_3: number | null;
	};
	observations: DiscrepancyObservation[];
};
type Destination = { performanceId: string; segmentId: string; label: string };
export type DiscrepancyReviewData = {
	task: Pick<DiscrepancyTask, 'clipNumber' | 'human' | 'observations'>;
	annotator: string;
	navigation: {
		previous: Destination | null;
		next: Destination | null;
		position: number;
		total: number;
	};
	backend?: ResearchBackend;
	ownerId?: string;
	canAnnotate?: boolean;
	inputVersion?: string;
	metricReleaseId?: string;
};
export type PendingObservation = { mutationId: string; payload: string };

export function researchApiPrefix(backend: ResearchBackend) {
	return backend === 'hosted' ? '/api/research' : '/api/dev';
}

export function discrepancyDraftKey(
	backend: ResearchBackend,
	segmentId: string,
	review: Pick<DiscrepancyReviewData, 'ownerId' | 'inputVersion'>
): string | null {
	if (backend === 'local') return `research-discrepancy-draft-v1:${segmentId}`;
	if (!review.ownerId || !review.inputVersion) return null;
	// Segment ids are study-scoped. Encode each component to prevent ambiguous separators.
	return `research-discrepancy-draft-v2:${[review.ownerId, segmentId, review.inputVersion]
		.map(encodeURIComponent)
		.join(':')}`;
}

export function prepareObservationMutation(
	payload: string,
	pending: PendingObservation | null,
	createId: () => string
): PendingObservation {
	return pending?.payload === payload ? pending : { mutationId: createId(), payload };
}

export function readPendingObservation(value: unknown): PendingObservation | null {
	if (!value || typeof value !== 'object') return null;
	const candidate = value as Partial<PendingObservation>;
	return typeof candidate.payload === 'string' &&
		typeof candidate.mutationId === 'string' &&
		/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			candidate.mutationId
		)
		? { mutationId: candidate.mutationId, payload: candidate.payload }
		: null;
}

export type LoadedAnalysisBinding = { inputVersion?: string; metricReleaseId?: string };

export function loadedAnalysisBindingError(
	loaded: LoadedAnalysisBinding | undefined,
	review: LoadedAnalysisBinding,
	compiledMetricRelease: string
): string | null {
	if (!loaded?.inputVersion || !loaded.metricReleaseId)
		return 'Loaded analysis details are missing. Reload this performance before saving.';
	if (loaded.metricReleaseId !== compiledMetricRelease)
		return 'The loaded metric version differs from this page. Reload the page before saving.';
	if (
		loaded.inputVersion !== review.inputVersion ||
		loaded.metricReleaseId !== review.metricReleaseId
	)
		return 'Analysis inputs changed. Reload this performance before saving. Your current note is retained.';
	return null;
}
