import { dev } from '$app/environment';
import { json } from '@sveltejs/kit';
import {
	findParticipantRecord,
	participantDataRoot,
	validateCatalogFile
} from '$lib/server/participant-dataset-catalog';
import { getParticipantVideoDuration } from '$lib/server/participant-video-duration';
import { isDevLocalRequestAllowed } from '$lib/server/client-address';
import {
	findParticipantPerformance,
	toParticipantPerformanceResource
} from '$lib/server/participant-dataset-catalog';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request, getClientAddress }) => {
	if (!isDevLocalRequestAllowed(request, getClientAddress(), dev))
		return new Response(null, { status: 404 });
	const performance = await findParticipantPerformance(params.id);
	if (!performance) return new Response(null, { status: 404 });
	const durations = await Promise.all(
		performance.segments.map(async (segment) => {
			const record = await findParticipantRecord(segment.id);
			const video = record
				? await validateCatalogFile(record.videoPath, participantDataRoot())
				: null;
			const duration = video ? await getParticipantVideoDuration(segment.id, video) : null;
			return [segment.id, duration] as const;
		})
	);
	return json(toParticipantPerformanceResource(performance, new Map(durations)), {
		headers: { 'Cache-Control': 'no-store' }
	});
};
