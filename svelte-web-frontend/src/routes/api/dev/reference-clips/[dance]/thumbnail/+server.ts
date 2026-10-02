import { dev } from '$app/environment';
import { isDevLocalRequestAllowed } from '$lib/server/client-address';
import {
	referenceClipInfo,
	referenceVideoRoot,
	validateCatalogFile
} from '$lib/server/participant-dataset-catalog';
import {
	PARTICIPANT_THUMBNAIL_PLACEHOLDER,
	renderParticipantThumbnail
} from '$lib/server/participant-thumbnail';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, request, getClientAddress }) => {
	if (!isDevLocalRequestAllowed(request, getClientAddress(), dev))
		return new Response(null, { status: 404 });
	const clip = referenceClipInfo(params.dance, 1);
	const video = clip
		? await validateCatalogFile(`${referenceVideoRoot()}/${clip.fileName}`, referenceVideoRoot())
		: null;
	const thumbnail = video ? await renderParticipantThumbnail(video) : null;
	const body = thumbnail ?? PARTICIPANT_THUMBNAIL_PLACEHOLDER;
	return new Response(Uint8Array.from(body).buffer as ArrayBuffer, {
		headers: {
			'Cache-Control': 'no-store',
			'Content-Type': thumbnail ? 'image/jpeg' : 'image/svg+xml; charset=utf-8',
			'X-Content-Type-Options': 'nosniff',
			...(thumbnail ? {} : { 'X-Thumbnail-Fallback': 'true' })
		}
	});
};
