import {
	Get2DScaleIndicator,
	Get2DVector,
	QijiaMethodComparisonVectors,
	QijiaMethodComparisionVectorNames,
	getInnerAngle,
	getMagnitude2DVec
} from '../EvaluationCommonUtils';
import { lerp } from '$lib/utils/math';
import type { Pose2DPixelLandmarks } from '$lib/webcam/mediapipe-utils';

export type VionaVectorResult = {
	index: number;
	name: string;
	src: number;
	dest: number;
	ref: [number, number] | null;
	participant: [number, number] | null;
	refRaw: [number, number] | null;
	participantRaw: [number, number] | null;
	rawReferenceLength: number | null;
	rawParticipantLength: number | null;
	adjustedParticipantLength: number | null;
	referenceGate: number | null;
	participantGate: number | null;
	referenceScale: number | null;
	participantScale: number | null;
	angleRadians: number | null;
	angleDegrees: number | null;
	angleError: number | null;
	lengthError: number | null;
	angleWeight: number | null;
	dissimilarity: number | null;
	extrapolated: boolean;
	invalidReason?: string;
};

export type VionaFrameResult = {
	vectors: VionaVectorResult[];
	overallDissimilarity: number | null;
	referenceScale: number | null;
	participantScale: number | null;
	scaleParts: {
		referenceShoulderWidth: number | null;
		referenceLeftTorso: number | null;
		referenceRightTorso: number | null;
		participantShoulderWidth: number | null;
		participantLeftTorso: number | null;
		participantRightTorso: number | null;
	};
};

const MIN_ANGLE_LENGTH = 50;
const TARGET_ANGLE_LENGTH = 100;

function unit(vector: [number, number]): [number, number] | null {
	const length = getMagnitude2DVec(vector);
	return length > 0 && Number.isFinite(length) ? [vector[0] / length, vector[1] / length] : null;
}

function finiteScale(landmarks: Pose2DPixelLandmarks): number | null {
	try {
		const value = Get2DScaleIndicator(landmarks);
		return Number.isFinite(value) && value > 0 ? value : null;
	} catch {
		return null;
	}
}

function safeVector(landmarks: Pose2DPixelLandmarks, src: number, dest: number): [number, number] {
	const source = landmarks[src];
	const target = landmarks[dest];
	if (!source || !target || ![source.x, source.y, target.x, target.y].every(Number.isFinite))
		return [Number.NaN, Number.NaN];
	return Get2DVector(landmarks, src, dest);
}

function scaleParts(landmarks: Pose2DPixelLandmarks) {
	const leftTorso = getMagnitude2DVec(safeVector(landmarks, 11, 23));
	const rightTorso = getMagnitude2DVec(safeVector(landmarks, 12, 24));
	const shoulderWidth = getMagnitude2DVec(safeVector(landmarks, 11, 12));
	return {
		shoulderWidth: Number.isFinite(shoulderWidth) ? shoulderWidth : null,
		leftTorso: Number.isFinite(leftTorso) ? leftTorso : null,
		rightTorso: Number.isFinite(rightTorso) ? rightTorso : null
	};
}

/** Mirrors the production Viona2D frame formula and leaves the angle weight unclamped. */
export function compareVionaFrame(
	reference: Pose2DPixelLandmarks,
	participant: Pose2DPixelLandmarks
): VionaFrameResult {
	const referenceScale = finiteScale(reference);
	const participantScale = finiteScale(participant);
	const vectors = QijiaMethodComparisonVectors.map(([src, dest], index): VionaVectorResult => {
		const refVector = safeVector(reference, src, dest);
		const participantVector = safeVector(participant, src, dest);
		const refLengthCandidate = getMagnitude2DVec(refVector);
		const participantLengthCandidate = getMagnitude2DVec(participantVector);
		const refRaw = refVector.every(Number.isFinite) ? refVector : null;
		const participantRaw = participantVector.every(Number.isFinite) ? participantVector : null;
		const rawReferenceLength = Number.isFinite(refLengthCandidate) ? refLengthCandidate : null;
		const rawParticipantLength = Number.isFinite(participantLengthCandidate)
			? participantLengthCandidate
			: null;
		const ref = unit(refVector);
		const participantUnit = unit(participantVector);
		const adjustedParticipantLength =
			referenceScale !== null && participantScale !== null && rawParticipantLength !== null
				? (rawParticipantLength * referenceScale) / participantScale
				: null;
		const referenceGateValue = lerp(
			rawReferenceLength ?? Number.NaN,
			MIN_ANGLE_LENGTH,
			TARGET_ANGLE_LENGTH,
			0,
			1
		);
		const participantGateValue = lerp(
			rawParticipantLength ?? Number.NaN,
			MIN_ANGLE_LENGTH,
			TARGET_ANGLE_LENGTH,
			0,
			1
		);
		const referenceGate = Number.isFinite(referenceGateValue) ? referenceGateValue : null;
		const participantGate = Number.isFinite(participantGateValue) ? participantGateValue : null;
		const angleWeight =
			referenceGate !== null && participantGate !== null
				? Math.min(referenceGate, participantGate)
				: null;
		let invalidReason: string | undefined;
		if (!ref) invalidReason = 'Reference vector has zero or non-finite length';
		else if (!participantUnit) invalidReason = 'Participant vector has zero or non-finite length';
		else if (referenceScale === null) invalidReason = 'Reference body scale is zero or non-finite';
		else if (participantScale === null)
			invalidReason = 'Participant body scale is zero or non-finite';
		const angleRadiansCandidate =
			invalidReason || !refRaw || !participantRaw ? null : getInnerAngle(refRaw, participantRaw);
		if (!invalidReason && !Number.isFinite(angleRadiansCandidate))
			invalidReason = 'Angle is non-finite';
		const angleRadians = Number.isFinite(angleRadiansCandidate) ? angleRadiansCandidate : null;
		const angleError = angleRadians === null ? null : angleRadians / Math.PI;
		const lengthError =
			invalidReason || adjustedParticipantLength === null || rawReferenceLength === null
				? null
				: Math.abs(rawReferenceLength - adjustedParticipantLength) /
					Math.max(rawReferenceLength, adjustedParticipantLength);
		const dissimilarity =
			angleError === null || lengthError === null
				? null
				: angleWeight === null
					? null
					: angleWeight * angleError + (1 - angleWeight) * lengthError;
		if (!invalidReason && !Number.isFinite(lengthError))
			invalidReason = 'Adjusted length error is non-finite';
		return {
			index,
			name: QijiaMethodComparisionVectorNames[index],
			src,
			dest,
			ref,
			participant: participantUnit,
			refRaw,
			participantRaw,
			rawReferenceLength,
			rawParticipantLength,
			adjustedParticipantLength,
			referenceGate,
			participantGate,
			referenceScale,
			participantScale,
			angleRadians,
			angleDegrees: angleRadians === null ? null : (angleRadians * 180) / Math.PI,
			angleError,
			lengthError,
			angleWeight,
			dissimilarity: invalidReason || !Number.isFinite(dissimilarity) ? null : dissimilarity,
			extrapolated: angleWeight !== null && (angleWeight < 0 || angleWeight > 1),
			invalidReason
		};
	});
	const validDissimilarities = vectors.map((vector) => vector.dissimilarity);
	const overallDissimilarity = validDissimilarities.every((value) => value !== null)
		? validDissimilarities.reduce((sum, value) => sum + value!, 0) / validDissimilarities.length
		: null;
	const referenceParts = scaleParts(reference);
	const participantParts = scaleParts(participant);
	return {
		vectors,
		overallDissimilarity: Number.isFinite(overallDissimilarity) ? overallDissimilarity : null,
		referenceScale,
		participantScale,
		scaleParts: {
			referenceShoulderWidth: referenceParts.shoulderWidth,
			referenceLeftTorso: referenceParts.leftTorso,
			referenceRightTorso: referenceParts.rightTorso,
			participantShoulderWidth: participantParts.shoulderWidth,
			participantLeftTorso: participantParts.leftTorso,
			participantRightTorso: participantParts.rightTorso
		}
	};
}
