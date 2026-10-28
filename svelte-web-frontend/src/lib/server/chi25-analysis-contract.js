import { createHash } from 'node:crypto';
import { humanSimilarityCondition } from './research-identity.js';

export const ANALYSIS_SOURCE_VERSION = 'chi25-analysis-20261028-v1';
export const REFERENCE_CLIPS = Object.freeze({
	bartender: { fileName: 'bartender.mp4', spacing: 4.498 },
	'last-christmas': { fileName: 'last-christmas-tutorial.mp4', spacing: 4.352 },
	'mad-at-disney': { fileName: 'mad-at-disney-tutorial.mp4', spacing: 4.04 },
	'pajama-party': { fileName: 'pajamaparty-tutorial.mp4', spacing: 2.682 }
});
/** @type {Record<string,string>} */
const danceAliases = {
	bartender: 'bartender',
	lastchristmas: 'last-christmas',
	'last-christmas': 'last-christmas',
	madatdisney: 'mad-at-disney',
	'mad-at-disney': 'mad-at-disney',
	pajamaparty: 'pajama-party',
	'pajama-party': 'pajama-party'
};

/** @param {string | Uint8Array} value */
export function sha256(value) {
	return createHash('sha256').update(value).digest('hex');
}

/** @param {unknown} value @returns {string} */
export function stableJson(value) {
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	if (value && typeof value === 'object') {
		return `{${Object.keys(value)
			.sort()
			.map(
				(key) =>
					`${JSON.stringify(key)}:${stableJson(/** @type {Record<string, unknown>} */ (value)[key])}`
			)
			.join(',')}}`;
	}
	if (value === undefined) throw new Error('Undefined value in analysis inputs');
	return JSON.stringify(value);
}

/** @param {string} study @param {string} stem */
export function analysisRecordingIdentity(study, stem) {
	if (!['chi25_study1', 'chi25_study2'].includes(study)) return null;
	const localStudy = study === 'chi25_study1' ? 'study1' : 'study2';
	const parts = stem.split('_').filter(Boolean);
	const phase = localStudy === 'study1' ? parts.splice(1, 1)[0] : null;
	if (parts.length !== 4) return null;
	const [user, danceCondition, workflow, clip] = parts;
	if (!/^user[1-9]\d*$/.test(user) || !/^clip[1-9]\d*$/.test(clip)) return null;
	if (!/^workflowid-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(workflow)) return null;
	let rawDance;
	let condition;
	if (localStudy === 'study1') {
		const fields = danceCondition.split('--');
		if (fields.length !== 3 || fields[0] !== 'userstudy1') return null;
		[, rawDance, condition] = fields;
	} else {
		if (!danceCondition.startsWith('userstudy2-')) return null;
		const fields = danceCondition.slice('userstudy2-'.length);
		const separator = fields.lastIndexOf('-');
		rawDance = fields.slice(0, separator);
		condition = fields.slice(separator + 1);
	}
	const dance = danceAliases[rawDance];
	if (!dance || !condition || (localStudy === 'study1' && !phase)) return null;
	const participantId = Number(user.slice(4));
	const clipNumber = Number(clip.slice(4));
	if (!Number.isSafeInteger(participantId) || !Number.isSafeInteger(clipNumber)) return null;
	const workflowId = workflow.slice('workflowid-'.length);
	return {
		study,
		localStudy,
		participantId,
		dance,
		condition,
		phase,
		workflowId,
		clipNumber,
		id: sha256(`${study}\0${stem}`).slice(0, 24),
		legacyId: sha256(`${localStudy}\0${stem}`).slice(0, 24),
		performanceId: sha256(
			`performance\0${[localStudy, participantId, dance, workflowId, condition, phase ?? ''].join('\0')}`
		).slice(0, 24)
	};
}

/** @param {string} study @param {string} dance @param {string|number} user @param {string|number} segment @param {string} condition */
export function analysisRatingKey(study, dance, user, segment, condition) {
	return [study, dance, String(user), String(segment), humanSimilarityCondition(condition)].join(
		'\0'
	);
}

/** @param {Record<string,string>} row @param {string} sourceSha @param {number} ordinal @param {string} materialId */
export function analysisHumanRating(row, sourceSha, ordinal, materialId) {
	const numeric = (/** @type {string} */ key) => {
		if (!row[key]?.trim()) return null;
		const value = Number(row[key]);
		if (!Number.isFinite(value)) throw new Error(`Non-numeric rating field ${key}`);
		return value;
	};
	if (
		!['1', '2'].includes(row.study) ||
		!row.dance ||
		!row.userId ||
		!row.segmentId ||
		!row.condition
	) {
		throw new Error('Invalid human rating identity');
	}
	const mean = numeric('humanRating');
	const segment = Number(row.segmentId);
	return {
		id: sha256(`${sourceSha}\0${ordinal}`).slice(0, 24),
		study: `chi25_study${row.study}`,
		dance: row.dance,
		participant_id: row.userId,
		source_segment: row.segmentId,
		condition: row.condition,
		human_rating: mean,
		segment_eligible:
			/^[1-9]\d*$/.test(row.segmentId) &&
			Number.isSafeInteger(segment) &&
			mean !== null &&
			mean >= 1 &&
			mean <= 5,
		source_sha256: sourceSha,
		source_row: ordinal,
		material_id: materialId,
		human: {
			study: row.study,
			dance: row.dance,
			user_id: row.userId,
			segment_id: row.segmentId,
			condition: row.condition,
			human_rating: mean,
			human_rating_percentile: numeric('humanRatingPercentile'),
			rating_1: numeric('rating1'),
			rating_2: numeric('rating2'),
			rating_3: numeric('rating3')
		},
		original_row: row
	};
}
