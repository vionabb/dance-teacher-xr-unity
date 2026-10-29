import { error, type RequestEvent } from '@sveltejs/kit';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DiscrepancyObservation } from '$lib/research/discrepancy';
import type { DiscrepancyTask } from '$lib/research/discrepancy-client';
import { isResearchStudy } from './research-hosted';

type Recording = {
	id: string;
	study: string;
	performance_id: string;
	participant_id: number;
	dance: string;
	condition: string;
	phase: string | null;
	clip_number: number;
	duration_seconds: number;
	reference_id: string | null;
	human_rating_id: string | null;
	input_version: string;
	metric_release_id: string;
};
type Reference = {
	id: string;
	pose_material_id: string;
	video_material_id: string;
	start_seconds: number;
	mirrored: boolean;
};
type Human = DiscrepancyTask['human'];
type Observation = {
	id: number | string;
	recording_id: string;
	created_at: string;
	start_seconds: number;
	end_seconds: number;
	note: string;
	direction: string;
	tags: string[];
	metric: 'qijia2d' | 'viona2d';
	context: unknown;
	mutation_id: string;
	input_version: string;
	diagnostic_client_context: unknown;
};
export const observationColumns =
	'id,study,recording_id,created_at,start_seconds,end_seconds,note,direction,tags,metric,context,mutation_id,input_version,diagnostic_client_context';
const recordingColumns =
	'id,study,performance_id,participant_id,dance,condition,phase,clip_number,duration_seconds,reference_id,human_rating_id,input_version,metric_release_id';
export const privateHeaders = { 'Cache-Control': 'private, no-store' };

export async function analysisAccess(locals: RequestEvent['locals']) {
	const user = locals.user ?? (await locals.safeGetSession()).user;
	if (!user) error(404);
	const { data, error: failure } = await locals.supabase
		.from('research_access')
		.select('study,role')
		.eq('user_id', user.id);
	if (failure) throw failure;
	const memberships = (data ?? []).filter((row) => isResearchStudy(row.study));
	if (!memberships.length) error(404);
	return {
		user,
		memberships,
		canWrite: (study: string) =>
			memberships.some((row) => row.study === study && ['editor', 'admin'].includes(row.role))
	};
}

/** Pagination is deliberate: Supabase's default row limit is smaller than this catalog. */
async function allRows<T>(client: SupabaseClient, table: string, columns: string): Promise<T[]> {
	const rows: T[] = [];
	for (let start = 0; ; start += 500) {
		const { data, error: failure } = await client
			.from(table)
			.select(columns)
			.order('id')
			.range(start, start + 499);
		if (failure) throw failure;
		rows.push(...((data ?? []) as unknown as T[]));
		if (!data || data.length < 500) return rows;
	}
}
export function publicObservation(row: Observation): DiscrepancyObservation {
	return {
		id: String(row.id),
		segment_id: row.recording_id,
		annotator: 'You',
		created_at: row.created_at,
		start_seconds: row.start_seconds,
		end_seconds: row.end_seconds,
		note: row.note,
		direction: row.direction,
		tags: row.tags,
		metric: row.metric,
		context: row.context
	};
}
export function groupPerformances(recordings: Recording[]) {
	const ids = [...new Set(recordings.map((row) => row.participant_id))].sort((a, b) => a - b);
	const labels = new Map(ids.map((id, i) => [id, `Participant ${String(i + 1).padStart(3, '0')}`]));
	const grouped = new Map<
		string,
		{
			id: string;
			participantLabel: string;
			study: string;
			danceName: string;
			condition: string;
			phase: string | null;
			segments: { id: string; clipNumber: number; referencePoseAvailable: boolean }[];
		}
	>();
	for (const row of recordings) {
		if (!grouped.has(row.performance_id))
			grouped.set(row.performance_id, {
				id: row.performance_id,
				participantLabel: labels.get(row.participant_id)!,
				study: row.study === 'chi25_study1' ? 'study1' : 'study2',
				danceName: row.dance,
				condition: row.condition,
				phase: row.phase,
				segments: []
			});
		grouped.get(row.performance_id)!.segments.push({
			id: row.id,
			clipNumber: row.clip_number,
			referencePoseAvailable: !!row.reference_id
		});
	}
	return [...grouped.values()]
		.map((p) => ({ ...p, segments: p.segments.sort((a, b) => a.clipNumber - b.clipNumber) }))
		.sort((a, b) =>
			[a.study, a.participantLabel, a.danceName, a.id]
				.join()
				.localeCompare([b.study, b.participantLabel, b.danceName, b.id].join())
		);
}
export async function hostedCatalog(locals: RequestEvent['locals']) {
	await analysisAccess(locals);
	const recordings = await allRows<Recording>(
		locals.supabase,
		'research_analysis_recording',
		recordingColumns
	);
	return { recordings, performances: groupPerformances(recordings) };
}
/** Thumbnail placeholders do not need to load every recording and reference. */
export async function requireHostedPerformance(locals: RequestEvent['locals'], id: string) {
	if (!/^[a-f0-9]{24}$/.test(id)) error(404);
	await analysisAccess(locals);
	const { data, error: failure } = await locals.supabase
		.from('research_analysis_recording')
		.select('id')
		.eq('performance_id', id)
		.limit(1)
		.maybeSingle();
	if (failure) throw failure;
	if (!data) error(404);
}
export async function hostedPerformance(locals: RequestEvent['locals'], id: string) {
	if (!/^[a-f0-9]{24}$/.test(id)) error(404);
	const { recordings, performances } = await hostedCatalog(locals);
	const performance = performances.find((row) => row.id === id);
	if (!performance) error(404);
	const records = recordings.filter((row) => row.performance_id === id);
	if (records.some((row) => row.metric_release_id !== __RESEARCH_METRIC_RELEASE__))
		error(409, 'These inputs need registration for the current metric release.');
	const references = await allRows<Reference>(
		locals.supabase,
		'research_reference_segment',
		'id,pose_material_id,video_material_id,start_seconds,mirrored'
	);
	return {
		...performance,
		thumbnailUrl: `/api/research/participant-catalog/performance/${id}/thumbnail`,
		segments: performance.segments.map((segment) => {
			const recording = records.find((row) => row.id === segment.id)!;
			const reference = references.find((row) => row.id === recording.reference_id);
			return {
				...segment,
				videoUrl: `/research/studies/media/${segment.id}/video`,
				poseUrl: `/research/studies/media/${segment.id}/pose`,
				referencePoseUrl: reference
					? `/research/materials/file/${reference.pose_material_id}`
					: null,
				durationSeconds: recording.duration_seconds,
				inputVersion: recording.input_version,
				metricReleaseId: recording.metric_release_id,
				referenceVideoUrl: reference
					? `/research/materials/file/${reference.video_material_id}`
					: null,
				referenceClipStartSeconds: reference?.start_seconds ?? null,
				referenceVideoMirrored: reference?.mirrored ?? false
			};
		})
	};
}
export async function hostedTasks(locals: RequestEvent['locals']) {
	const access = await analysisAccess(locals);
	const [recordings, humans, observations] = await Promise.all([
		allRows<Recording>(locals.supabase, 'research_analysis_recording', recordingColumns),
		allRows<{ id: string; human: Human }>(locals.supabase, 'research_human_rating', 'id,human'),
		allRows<Observation>(locals.supabase, 'research_discrepancy_observation', observationColumns)
	]);
	const performances = groupPerformances(recordings);
	const humanById = new Map(humans.map((row) => [row.id, row.human]));
	const tasks: DiscrepancyTask[] = [];
	for (const performance of performances)
		for (const segment of performance.segments) {
			const row = recordings.find((row) => row.id === segment.id)!;
			const human = humanById.get(row.human_rating_id ?? '');
			if (!human || !row.reference_id || row.metric_release_id !== __RESEARCH_METRIC_RELEASE__)
				continue;
			tasks.push({
				performanceId: performance.id,
				segmentId: row.id,
				participantLabel: performance.participantLabel,
				study: performance.study,
				dance: row.dance,
				condition: row.condition,
				phase: row.phase,
				clipNumber: row.clip_number,
				referenceAvailable: true,
				human,
				observations: observations
					.filter((note) => note.recording_id === row.id)
					.map(publicObservation)
			});
		}
	return { access, recordings, tasks };
}
export async function hostedTask(locals: RequestEvent['locals'], id: string) {
	if (!/^[a-f0-9]{24}$/.test(id)) error(404);
	const { access, recordings, tasks } = await hostedTasks(locals);
	const position = tasks.findIndex((row) => row.segmentId === id);
	if (position < 0) error(404);
	const recording = recordings.find((row) => row.id === id)!;
	const destination = (index: number) =>
		tasks[index]
			? {
					performanceId: tasks[index].performanceId,
					segmentId: tasks[index].segmentId,
					label: `${tasks[index].participantLabel}, segment ${tasks[index].clipNumber}`
				}
			: null;
	return {
		task: tasks[position],
		annotator: 'You',
		backend: 'hosted' as const,
		ownerId: access.user.id,
		canAnnotate: access.canWrite(recording.study),
		inputVersion: recording.input_version,
		metricReleaseId: recording.metric_release_id,
		navigation: {
			previous: destination(position - 1),
			next: destination(position + 1),
			position: position + 1,
			total: tasks.length
		}
	};
}

/** JSON routes need an explicit origin check; form CSRF protection does not cover them. */
export function assertAnalysisMutation(request: Request) {
	if (
		request.headers.get('origin') !== new URL(request.url).origin ||
		!['same-origin', 'none', null].includes(request.headers.get('sec-fetch-site'))
	)
		error(403);
	if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') error(415);
	if (Number(request.headers.get('content-length') ?? 0) > 32_000) error(413);
}
export async function readAnalysisMutation(request: Request) {
	assertAnalysisMutation(request);
	if (!request.body) error(400);
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const { value, done } = await reader.read();
		if (done) break;
		size += value.byteLength;
		if (size > 32_000) {
			await reader.cancel();
			error(413);
		}
		chunks.push(value);
	}
	try {
		return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
	} catch {
		error(400, 'Invalid JSON');
	}
}

/** A current GET response cannot vouch for the code or inputs already loaded in a browser. */
export function assertLoadedAnalysisBinding(
	value: { inputVersion?: unknown; metricReleaseId?: unknown },
	expected: { inputVersion: string; metricReleaseId: string }
) {
	if (
		typeof value.inputVersion !== 'string' ||
		!/^[a-f0-9]{64}$/.test(value.inputVersion) ||
		typeof value.metricReleaseId !== 'string' ||
		!/^[a-f0-9]{64}$/.test(value.metricReleaseId)
	)
		error(400, 'Missing loaded analysis binding. Reload this performance before saving.');
	if (
		value.inputVersion !== expected.inputVersion ||
		value.metricReleaseId !== expected.metricReleaseId ||
		value.metricReleaseId !== __RESEARCH_METRIC_RELEASE__
	)
		error(
			409,
			'The loaded metric or analysis inputs changed. Reload this performance before saving.'
		);
}
