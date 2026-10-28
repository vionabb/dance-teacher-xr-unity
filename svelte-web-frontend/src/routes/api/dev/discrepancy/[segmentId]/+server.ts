import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { getParticipantVideoDuration } from '$lib/server/participant-video-duration';
import { isDevLocalRequestAllowed } from '$lib/server/client-address';
import { discrepancyTask } from '$lib/server/research-discrepancy';
import {
	researchDatabasePath,
	saveDiscrepancyObservation,
	readResearchRecords
} from '$lib/server/research-store';
import { sha256File } from '$lib/server/research-video-manifest';
import {
	participantDataRoot,
	referencePoseRoot,
	validateCatalogFile
} from '$lib/server/participant-dataset-catalog';
import { validObservation } from '$lib/research/discrepancy';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, getClientAddress, params }) => {
	if (!isDevLocalRequestAllowed(request, getClientAddress(), dev)) error(404);
	const found = await discrepancyTask(params.segmentId);
	if (!found) error(404, 'No exact prior-study human rating matches this segment.');
	return json(
		{
			task: found.task,
			navigation: found.navigation,
			annotator: process.env.RESEARCH_ANNOTATOR?.trim() ?? ''
		},
		{ headers: { 'Cache-Control': 'no-store' } }
	);
};
export const POST: RequestHandler = async ({ request, getClientAddress, params }) => {
	if (!isDevLocalRequestAllowed(request, getClientAddress(), dev)) error(404);
	const annotator = process.env.RESEARCH_ANNOTATOR?.trim();
	if (!annotator) error(503, 'Set RESEARCH_ANNOTATOR on the local server before saving.');
	const input: unknown = await request.json().catch(() => null);
	if (!validObservation(input))
		error(400, 'Enter a valid interval, direction, and observation (up to 4,000 characters).');
	const found = await discrepancyTask(params.segmentId);
	if (!found) error(409, 'The segment no longer matches the human-rating source.');
	const { task, record } = found;
	const files = await Promise.all([
		validateCatalogFile(record.videoPath, participantDataRoot()),
		validateCatalogFile(record.posePath, participantDataRoot()),
		record.referencePosePath
			? validateCatalogFile(record.referencePosePath, referencePoseRoot())
			: null
	]);
	if (files.some((file) => !file))
		error(409, 'The exact video and both pose inputs must be available.');
	const duration = await getParticipantVideoDuration(params.segmentId, files[0]!);
	if (duration === null || input.end > duration + 0.05)
		error(400, 'The interval must fall within the participant video.');
	const [videoHash, poseHash, referenceHash] = await Promise.all(
		files.map((file) => sha256File(file!))
	);
	const sources = (await readResearchRecords(researchDatabasePath(), 0)).sources;
	const receipt = await saveDiscrepancyObservation(researchDatabasePath(), {
		segment_id: params.segmentId,
		annotator,
		start_seconds: input.start,
		end_seconds: input.end,
		note: input.note.trim(),
		direction: input.direction,
		tags: [...new Set(input.tags)],
		metric: input.metric,
		context: {
			schemaVersion: 1,
			inspectorVersion: '2026-10-27',
			metricCodeSha256: await sha256File(
				path.resolve('src/lib/ai/motionmetrics', `${input.metric}-inspector.ts`)
			),
			sharedMetricCodeSha256: await sha256File(path.resolve('src/lib/ai/EvaluationCommonUtils.ts')),
			pairing: 'row-index-truncate-shorter',
			timeBasis: 'participant-segment-video-seconds',
			diagnosticClientContext: input.context,
			videoSha256: videoHash,
			participantPoseSha256: poseHash,
			referencePoseSha256: referenceHash,
			humanSourceSha256: sources.find((source) => source.kind === 'human_similarity_ratings')
				?.source_sha256,
			human: task.human,
			segment: { ...task, observations: undefined },
			inputSizes: await Promise.all(files.map(async (file) => (await stat(file!)).size))
		}
	});
	return json({
		...receipt,
		observations: (await discrepancyTask(params.segmentId))!.task.observations
	});
};
