import type { Pose2DPixelLandmarks } from '$lib/webcam/mediapipe-utils';
import { QijiaMethodComparisonVectors } from '../EvaluationCommonUtils';
import { QIJIA_SKELETON_SIMILARITY_MAX_SCORE } from './Qijia2DPoseEvaluationMetric';

/**
 * An opt-in research contract. It does not change the legacy Qijia metric or CSV schema.
 * `calculationQuality` describes measurement sufficiency; it is not a calibrated probability
 * that the similarity score agrees with human ratings. Calibrated reliability metadata is
 * asserted by the caller and must be independently validated before substantive use.
 */
export const QIJIA_2D_QUALITY_CONTRACT = 'qijia2d-quality-v1' as const;

export type LandmarkProvenance =
	| 'observed'
	| 'manual_corrected'
	| 'automatic_repair'
	| 'interpolated'
	| 'unknown';

export type QijiaLandmarkQuality = {
	/** null explicitly means unknown; undefined falls back to the pose landmark's visibility. */
	visibility?: number | null;
	provenance?: LandmarkProvenance;
};

export type CalibratedFrameReliability = {
	value: number;
	calibrationSource: string;
	calibrationVersion: string;
};

export type QijiaFrameQuality = {
	/** Only explicit true excludes a frame. Unknown and false remain eligible. */
	unusable?: boolean | null;
	/** Uncalibrated classifier output: recorded only, never used to gate or weight a score. */
	predictedUsability?: number | null;
	/** May weight a score only when a calibration source and version are supplied. */
	calibratedReliability?: CalibratedFrameReliability;
	landmarks?: readonly (QijiaLandmarkQuality | null)[];
};

export type QijiaQualityPair = {
	reference?: QijiaFrameQuality;
	user?: QijiaFrameQuality;
};

export type QijiaQualityOptions = {
	/** Opt-in visibility exclusion threshold; omitted means no automatic exclusion. */
	minVisibility?: number;
};

export type QijiaQualityFrame = {
	contract: typeof QIJIA_2D_QUALITY_CONTRACT;
	score: number | null;
	vectorScores: (number | null)[];
	vectorWeights: number[];
	expectedComparisons: number;
	validComparisons: number;
	coverage: number;
	effectiveCoverage: number;
	/** Bounds for the unweighted full comparison grid, not for a reliability-weighted score. */
	unweightedGridLowerBound: number;
	unweightedGridUpperBound: number;
	/** Fraction of landmark visibility inputs actually known among geometrically valid vectors. */
	visibilityEvidenceCoverage: number | null;
	knownVisibilityInputs: number;
	expectedVisibilityInputs: number;
	/** Mean minimum known endpoint visibility among included vectors; null means unknown. */
	meanKnownVisibility: number | null;
	/** Descriptive completeness/visibility proxy, not a calibrated probability of correctness. */
	calculationQuality: number | null;
	predictedUsability: { reference: number | null; user: number | null };
	calibratedReliability: {
		reference: CalibratedFrameReliability | null;
		user: CalibratedFrameReliability | null;
	};
	calibratedReliabilityUsed: boolean;
	provenanceCounts: Partial<Record<LandmarkProvenance, number>>;
};

export type QijiaQualitySummary = Omit<
	QijiaQualityFrame,
	'vectorScores' | 'vectorWeights' | 'predictedUsability' | 'calibratedReliability'
> & {
	frameCount: number;
	validFrameCount: number;
	predictedUsability: { referenceMean: number | null; userMean: number | null };
	calibratedReliabilityInputCount: number;
	expectedCalibratedReliabilityInputs: number;
};

const VECTOR_COUNT = QijiaMethodComparisonVectors.length;

function unitInterval(value: number, name: string): number {
	if (!Number.isFinite(value) || value < 0 || value > 1) {
		throw new RangeError(`${name} must be finite and between 0 and 1`);
	}
	return value;
}

function knownUnitInterval(value: number | null | undefined, name: string): number | null {
	return value == null ? null : unitInterval(value, name);
}

function reliability(quality: QijiaFrameQuality | undefined): number | null {
	const calibrated = quality?.calibratedReliability;
	if (!calibrated) return null;
	if (!calibrated.calibrationSource.trim() || !calibrated.calibrationVersion.trim()) {
		throw new Error('Calibrated reliability needs a calibration source and version');
	}
	return unitInterval(calibrated.value, 'calibratedReliability.value');
}

function visibility(
	pose: Pose2DPixelLandmarks,
	quality: QijiaFrameQuality | undefined,
	index: number
): number | null {
	const override = quality?.landmarks?.[index]?.visibility;
	return knownUnitInterval(
		override === undefined ? pose[index]?.visibility : override,
		'landmark visibility'
	);
}

function mean(values: readonly number[]): number | null {
	return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/**
 * Compare one aligned pose pair. A vector needs finite, nondegenerate geometry on both sides.
 * Visibility changes eligibility only if the caller supplies minVisibility. Raw predictions are
 * diagnostics. The denominator always includes all eight expected vectors, even for an unusable
 * frame. A calibrated reliability of zero abstains rather than creating a zero-valued score.
 */
export function computeQijia2DQualityAwareFrame(
	reference: Pose2DPixelLandmarks,
	user: Pose2DPixelLandmarks,
	quality: QijiaQualityPair = {},
	options: QijiaQualityOptions = {}
): QijiaQualityFrame {
	const threshold = options.minVisibility;
	if (threshold !== undefined) unitInterval(threshold, 'minVisibility');
	const referenceReliability = reliability(quality.reference);
	const userReliability = reliability(quality.user);
	const weight = Math.min(referenceReliability ?? 1, userReliability ?? 1);
	const predictedUsability = {
		reference: knownUnitInterval(quality.reference?.predictedUsability, 'predictedUsability'),
		user: knownUnitInterval(quality.user?.predictedUsability, 'predictedUsability')
	};
	const excluded = quality.reference?.unusable === true || quality.user?.unusable === true;
	const vectorScores: (number | null)[] = [];
	const vectorWeights: number[] = [];
	const includedVisibility: number[] = [];
	const provenanceCounts: Partial<Record<LandmarkProvenance, number>> = {};
	let knownVisibilityCount = 0;
	let geometricallyValidCount = 0;

	for (const [source, target] of QijiaMethodComparisonVectors) {
		const points = [reference?.[source], reference?.[target], user?.[source], user?.[target]];
		const geometric = points.every(
			(point) => point && Number.isFinite(point.x) && Number.isFinite(point.y)
		);
		if (!geometric || excluded) {
			vectorScores.push(null);
			vectorWeights.push(0);
			continue;
		}
		const [refSource, refTarget, userSource, userTarget] = points as NonNullable<
			(typeof points)[number]
		>[];
		const refDx = refTarget.x - refSource.x;
		const refDy = refTarget.y - refSource.y;
		const userDx = userTarget.x - userSource.x;
		const userDy = userTarget.y - userSource.y;
		const refLength = Math.hypot(refDx, refDy);
		const userLength = Math.hypot(userDx, userDy);
		if (
			!Number.isFinite(refLength) ||
			!Number.isFinite(userLength) ||
			refLength === 0 ||
			userLength === 0
		) {
			vectorScores.push(null);
			vectorWeights.push(0);
			continue;
		}
		geometricallyValidCount++;
		const endpointVisibility = [
			visibility(reference, quality.reference, source),
			visibility(reference, quality.reference, target),
			visibility(user, quality.user, source),
			visibility(user, quality.user, target)
		];
		knownVisibilityCount += endpointVisibility.filter((value) => value !== null).length;
		if (
			threshold !== undefined &&
			endpointVisibility.some((value) => value !== null && value < threshold)
		) {
			vectorScores.push(null);
			vectorWeights.push(0);
			continue;
		}
		const knownVisibility = endpointVisibility.filter((value): value is number => value !== null);
		if (knownVisibility.length) includedVisibility.push(Math.min(...knownVisibility));
		for (const [frameQuality, landmarkIndex] of [
			[quality.reference, source],
			[quality.reference, target],
			[quality.user, source],
			[quality.user, target]
		] as const) {
			const provenance = frameQuality?.landmarks?.[landmarkIndex]?.provenance;
			if (provenance) provenanceCounts[provenance] = (provenanceCounts[provenance] ?? 0) + 1;
		}
		const dissimilarity = Math.hypot(
			refDx / refLength - userDx / userLength,
			refDy / refLength - userDy / userLength
		);
		vectorScores.push(
			Number.isFinite(dissimilarity)
				? QIJIA_SKELETON_SIMILARITY_MAX_SCORE * (1 - dissimilarity / 2)
				: null
		);
		vectorWeights.push(Number.isFinite(dissimilarity) ? weight : 0);
	}

	const weightedSum = vectorScores.reduce<number>(
		(sum, score, index) => sum + (score ?? 0) * vectorWeights[index],
		0
	);
	const weightSum = vectorWeights.reduce((sum, value) => sum + value, 0);
	const validComparisons = vectorWeights.filter((value) => value > 0).length;
	const unweightedSum = vectorScores.reduce<number>(
		(sum, score, index) => sum + (vectorWeights[index] > 0 ? (score ?? 0) : 0),
		0
	);
	const expectedVisibilityInputs = geometricallyValidCount * 4;
	const visibilityEvidenceCoverage = expectedVisibilityInputs
		? knownVisibilityCount / expectedVisibilityInputs
		: null;
	const meanKnownVisibility = mean(includedVisibility);
	const coverage = validComparisons / VECTOR_COUNT;
	return {
		contract: QIJIA_2D_QUALITY_CONTRACT,
		score: weightSum ? weightedSum / weightSum : null,
		vectorScores,
		vectorWeights,
		expectedComparisons: VECTOR_COUNT,
		validComparisons,
		coverage,
		effectiveCoverage: weightSum / VECTOR_COUNT,
		unweightedGridLowerBound: unweightedSum / VECTOR_COUNT,
		unweightedGridUpperBound:
			(unweightedSum + (VECTOR_COUNT - validComparisons) * QIJIA_SKELETON_SIMILARITY_MAX_SCORE) /
			VECTOR_COUNT,
		visibilityEvidenceCoverage,
		knownVisibilityInputs: knownVisibilityCount,
		expectedVisibilityInputs,
		meanKnownVisibility,
		calculationQuality:
			meanKnownVisibility === null || visibilityEvidenceCoverage === null
				? null
				: (weightSum / VECTOR_COUNT) * visibilityEvidenceCoverage * meanKnownVisibility,
		predictedUsability,
		calibratedReliability: {
			reference: quality.reference?.calibratedReliability ?? null,
			user: quality.user?.calibratedReliability ?? null
		},
		calibratedReliabilityUsed: referenceReliability !== null || userReliability !== null,
		provenanceCounts
	};
}

/**
 * Pool weighted valid vector comparisons across aligned frames without changing the expected
 * frame-vector denominator. This differs from legacy Qijia, which averages each frame's mean
 * with equal frame weight even when frames have different numbers of valid vectors. Compare
 * like-for-like aggregation arms when interpreting changes against human ratings.
 */
export function summarizeQijia2DQualityAware(
	frames: readonly QijiaQualityFrame[]
): QijiaQualitySummary {
	const expectedComparisons = frames.reduce((sum, frame) => sum + frame.expectedComparisons, 0);
	const validComparisons = frames.reduce((sum, frame) => sum + frame.validComparisons, 0);
	const weightedSum = frames.reduce(
		(sum, frame) =>
			sum +
			frame.vectorScores.reduce<number>(
				(part, score, index) => part + (score ?? 0) * frame.vectorWeights[index],
				0
			),
		0
	);
	const weightSum = frames.reduce(
		(sum, frame) => sum + frame.vectorWeights.reduce((part, weight) => part + weight, 0),
		0
	);
	const unweightedSum = frames.reduce(
		(sum, frame) =>
			sum +
			frame.vectorScores.reduce<number>(
				(part, score, index) => part + (frame.vectorWeights[index] > 0 ? (score ?? 0) : 0),
				0
			),
		0
	);
	const visibilityValues = frames.filter((frame) => frame.meanKnownVisibility !== null);
	const visibilityWeight = visibilityValues.reduce((sum, frame) => sum + frame.validComparisons, 0);
	const meanKnownVisibility = visibilityWeight
		? visibilityValues.reduce(
				(sum, frame) => sum + frame.meanKnownVisibility! * frame.validComparisons,
				0
			) / visibilityWeight
		: null;
	const knownVisibilityInputs = frames.reduce((sum, frame) => sum + frame.knownVisibilityInputs, 0);
	const expectedVisibilityInputs = frames.reduce(
		(sum, frame) => sum + frame.expectedVisibilityInputs,
		0
	);
	const visibilityEvidenceCoverage = expectedVisibilityInputs
		? knownVisibilityInputs / expectedVisibilityInputs
		: null;
	const provenanceCounts: Partial<Record<LandmarkProvenance, number>> = {};
	for (const frame of frames) {
		for (const [kind, count] of Object.entries(frame.provenanceCounts)) {
			const provenance = kind as LandmarkProvenance;
			provenanceCounts[provenance] = (provenanceCounts[provenance] ?? 0) + count;
		}
	}
	return {
		contract: QIJIA_2D_QUALITY_CONTRACT,
		frameCount: frames.length,
		validFrameCount: frames.filter((frame) => frame.score !== null).length,
		score: weightSum ? weightedSum / weightSum : null,
		expectedComparisons,
		validComparisons,
		coverage: expectedComparisons ? validComparisons / expectedComparisons : 0,
		effectiveCoverage: expectedComparisons ? weightSum / expectedComparisons : 0,
		unweightedGridLowerBound: expectedComparisons ? unweightedSum / expectedComparisons : 0,
		unweightedGridUpperBound: expectedComparisons
			? (unweightedSum +
					(expectedComparisons - validComparisons) * QIJIA_SKELETON_SIMILARITY_MAX_SCORE) /
				expectedComparisons
			: QIJIA_SKELETON_SIMILARITY_MAX_SCORE,
		visibilityEvidenceCoverage,
		knownVisibilityInputs,
		expectedVisibilityInputs,
		meanKnownVisibility,
		calculationQuality:
			meanKnownVisibility === null || visibilityEvidenceCoverage === null || !expectedComparisons
				? null
				: (weightSum / expectedComparisons) * visibilityEvidenceCoverage * meanKnownVisibility,
		predictedUsability: {
			referenceMean: mean(
				frames
					.map((frame) => frame.predictedUsability.reference)
					.filter((value): value is number => value !== null)
			),
			userMean: mean(
				frames
					.map((frame) => frame.predictedUsability.user)
					.filter((value): value is number => value !== null)
			)
		},
		calibratedReliabilityInputCount: frames.reduce(
			(sum, frame) =>
				sum +
				Number(frame.calibratedReliability.reference !== null) +
				Number(frame.calibratedReliability.user !== null),
			0
		),
		expectedCalibratedReliabilityInputs: frames.length * 2,
		calibratedReliabilityUsed: frames.some((frame) => frame.calibratedReliabilityUsed),
		provenanceCounts
	};
}
