import { dev } from '$app/environment';
import { readFile } from 'node:fs/promises';
import { error, json } from '@sveltejs/kit';
import { isDevLocalRequestAllowed } from '$lib/server/client-address';
import { loadFrameSource, saveFrameRevision } from '$lib/server/research-frame-review';
import { sha256File, validatedReviewArtifact } from '$lib/server/research-video-manifest';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	if (!isDevLocalRequestAllowed(request, getClientAddress(), dev)) error(404);
	if (Number(request.headers.get('content-length') ?? 0) > 1_000_000) error(413);
	const source = await loadFrameSource();
	const task = source?.manifest.tasksById.get(params.taskId);
	if (!source || !task) error(404);
	const body = (await request.json()) as Record<string, unknown>;
	if (
		!body ||
		typeof body !== 'object' ||
		!['started', 'completed', 'skipped', 'unclear'].includes(String(body.status)) ||
		!Number.isSafeInteger(body.expected_revision_id) ||
		!body.frame_usability_response ||
		typeof body.frame_usability_response !== 'object'
	)
		error(400, 'Invalid frame review payload.');
	const response = body.frame_usability_response as Record<string, unknown>;
	const [video, landmarks] = await Promise.all([
		validatedReviewArtifact(source.manifest, task, 'video'),
		validatedReviewArtifact(source.manifest, task, 'landmarks')
	]);
	const [videoHash, landmarkHash] = await Promise.all([
		sha256File(video.file),
		sha256File(landmarks.file)
	]);
	if (videoHash !== video.sha256 || landmarkHash !== landmarks.sha256)
		error(409, 'Source media changed since the annotation manifest was frozen.');
	const pose = JSON.parse(await readFile(landmarks.file, 'utf8')) as {
		landmarks?: string[];
		frames?: Array<Record<string, [number | null, number | null] | null>>;
	};
	if (!Array.isArray(pose.frames) || pose.frames.length !== task.frame_count)
		error(409, 'Pose frames do not match the annotation task.');
	const automatic = pose.frames.flatMap((frame, index) => {
		const names = pose.landmarks?.length ? pose.landmarks : Object.keys(frame || {});
		return names.some((name) => {
			const point = frame?.[name];
			return Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]);
		})
			? []
			: [index];
	});
	const payload = {
		annotator: source.config.annotator,
		task_id: task.task_id,
		status: body.status,
		expected_revision_id: body.expected_revision_id,
		frame_usability_response: { ...response, automatic_missing_pose_frames: automatic }
	};
	try {
		const receipt = await saveFrameRevision(source, payload);
		if (receipt.conflict)
			return json(receipt, { status: 409, headers: { 'Cache-Control': 'no-store' } });
		return json(receipt, { headers: { 'Cache-Control': 'no-store' } });
	} catch (caught) {
		error(400, caught instanceof Error ? caught.message : 'Frame review could not be saved.');
	}
};
