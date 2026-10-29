import { json } from '@sveltejs/kit';
import { hostedTask, privateHeaders } from '$lib/server/hosted-analysis';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = async ({ locals, params }) => {
	return json(await hostedTask(locals, params.segmentId), { headers: privateHeaders });
};

import { error } from '@sveltejs/kit';
import { validObservation } from '$lib/research/discrepancy';
import {
	analysisAccess,
	assertLoadedAnalysisBinding,
	observationColumns,
	publicObservation,
	readAnalysisMutation
} from '$lib/server/hosted-analysis';
import { stableJson } from '$lib/server/chi25-analysis-contract.js';
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const body = await readAnalysisMutation(request);
	if (!validObservation(body)) error(400, 'Invalid observation');
	const extra = body as typeof body & {
		mutationId?: string;
		inputVersion?: string;
		metricReleaseId?: string;
	};
	if (
		!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			extra.mutationId ?? ''
		) ||
		!/^[a-f0-9]{64}$/.test(extra.inputVersion ?? '')
	)
		error(400);
	const access = await analysisAccess(locals);
	const review = await hostedTask(locals, params.segmentId);
	if (!review.canAnnotate) error(403, 'Editor access is required to save observations.');
	assertLoadedAnalysisBinding(extra, review);
	const row = {
		owner_id: access.user.id,
		recording_id: params.segmentId,
		study: review.task.study === 'study1' ? 'chi25_study1' : 'chi25_study2',
		mutation_id: extra.mutationId,
		input_version: extra.inputVersion,
		start_seconds: body.start,
		end_seconds: body.end,
		note: body.note.trim(),
		direction: body.direction,
		tags: body.tags,
		metric: body.metric,
		diagnostic_client_context: body.context
	};
	const { data: saved, error: failure } = await locals.supabase
		.from('research_discrepancy_observation')
		.insert(row)
		.select(observationColumns)
		.single();
	let receipt = saved;
	if (failure?.code === '23505') {
		const { data: prior, error: lookupError } = await locals.supabase
			.from('research_discrepancy_observation')
			.select(observationColumns)
			.eq('owner_id', access.user.id)
			.eq('mutation_id', extra.mutationId)
			.maybeSingle();
		if (lookupError) throw lookupError;
		if (
			!prior ||
			Object.entries(row).some(
				([key, value]) =>
					key !== 'owner_id' && stableJson(prior[key as keyof typeof prior]) !== stableJson(value)
			)
		)
			error(409, 'Retry ID was already used for a different observation.');
		receipt = prior;
	} else if (failure) {
		if (failure.code === '42501') error(403, 'Research authoring access is no longer available.');
		if (['23514', '23503', '22001', '22P02'].includes(failure.code))
			error(400, 'Observation does not match the registered inputs or video duration.');
		throw failure;
	}
	if (!receipt) error(500);
	const { data: observations, error: readError } = await locals.supabase
		.from('research_discrepancy_observation')
		.select(observationColumns)
		.eq('recording_id', params.segmentId)
		.order('id', { ascending: false });
	if (readError) throw readError;
	return json(
		{
			id: String(receipt.id),
			backend: 'hosted',
			observations: (observations ?? []).map(publicObservation)
		},
		{ headers: privateHeaders }
	);
};
