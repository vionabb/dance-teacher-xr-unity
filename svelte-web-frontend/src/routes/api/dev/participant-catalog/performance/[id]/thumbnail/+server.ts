import { dev } from '$app/environment';
import { isDevLocalRequestAllowed } from '$lib/server/client-address';
import {
	findParticipantPerformance,
	findParticipantRecord,
	participantDataRoot,
	validateCatalogFile
} from '$lib/server/participant-dataset-catalog';
import {
	PARTICIPANT_THUMBNAIL_PLACEHOLDER,
	renderParticipantThumbnail
} from '$lib/server/participant-thumbnail';
import type { RequestHandler } from './$types';

const headers = {
	'Cache-Control': 'no-store',
	'X-Content-Type-Options': 'nosniff'
};

export const GET: RequestHandler = async ({ params, request, getClientAddress }) => {
	if (!isDevLocalRequestAllowed(request, getClientAddress(), dev))
		return new Response(null, { status: 404 });
	const performance = await findParticipantPerformance(params.id);
	const firstSegment = performance?.segments[0];
	const record = firstSegment ? await findParticipantRecord(firstSegment.id) : null;
	const video = record ? await validateCatalogFile(record.videoPath, participantDataRoot()) : null;
	const thumbnail = video ? await renderParticipantThumbnail(video) : null;
	const body = thumbnail ?? PARTICIPANT_THUMBNAIL_PLACEHOLDER;
	const payload = Uint8Array.from(body).buffer as ArrayBuffer;
	return new Response(payload, {
		headers: {
			...headers,
			'Content-Type': thumbnail ? 'image/jpeg' : 'image/svg+xml; charset=utf-8',
			...(thumbnail ? {} : { 'X-Thumbnail-Fallback': 'true' })
		}
	});
};
