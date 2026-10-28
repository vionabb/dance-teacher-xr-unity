export const observationTags = [
	'Tracking / occlusion',
	'Timing / alignment',
	'Amplitude / scale',
	'Body region weighting',
	'Style / expression',
	'Human rater disagreement',
	'Unclear / other'
] as const;
export const discrepancyDirections = [
	'Metric seems too harsh',
	'Metric seems too generous',
	'Agreement / comparison',
	'Uncertain'
] as const;
export type DiscrepancyObservation = {
	id: number | string;
	segment_id: string;
	annotator: string;
	created_at: string;
	start_seconds: number;
	end_seconds: number;
	note: string;
	direction: string;
	tags: string[];
	metric: 'qijia2d' | 'viona2d';
	context: unknown;
};
export function validObservation(value: unknown): value is {
	start: number;
	end: number;
	note: string;
	direction: string;
	tags: string[];
	metric: 'qijia2d' | 'viona2d';
	context: Record<string, unknown>;
} {
	if (!value || typeof value !== 'object') return false;
	const v = value as Record<string, unknown>;
	return (
		typeof v.start === 'number' &&
		Number.isFinite(v.start) &&
		v.start >= 0 &&
		typeof v.end === 'number' &&
		Number.isFinite(v.end) &&
		v.end >= v.start &&
		typeof v.note === 'string' &&
		!!v.note.trim() &&
		v.note.length <= 4000 &&
		discrepancyDirections.includes(v.direction as never) &&
		Array.isArray(v.tags) &&
		v.tags.every((tag) => observationTags.includes(tag as never)) &&
		v.tags.length <= observationTags.length &&
		['qijia2d', 'viona2d'].includes(String(v.metric)) &&
		!!v.context &&
		typeof v.context === 'object' &&
		!Array.isArray(v.context) &&
		JSON.stringify(v.context).length <= 12000
	);
}
