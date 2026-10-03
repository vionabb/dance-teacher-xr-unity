import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { isLoopbackClientAddress } from '$lib/server/client-address';
import { latestFrameRevisions, loadFrameSource } from '$lib/server/research-frame-review';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ getClientAddress, params }) => {
	if (!dev || !isLoopbackClientAddress(getClientAddress())) error(404);
	const source = await loadFrameSource();
	const task = source?.manifest.tasksById.get(params.taskId);
	if (!source || !task) error(404);
	const latest = await latestFrameRevisions(source);
	return {
		taskId: task.task_id,
		manifestSha256: source.manifest.sha256,
		sourceCorpus: task.source_corpus,
		sourceStem: task.source_stem,
		displayLabel: task.display_label || task.task_id,
		frameCount: task.frame_count,
		fps: task.fps,
		width: task.source_dimensions.width,
		height: task.source_dimensions.height,
		annotator: source.config.annotator,
		revision: latest[task.task_id] ?? null,
		nextTaskId:
			source.manifest.tasks.find(
				(item) =>
					item.task_id !== task.task_id &&
					latest[item.task_id]?.status !== 'completed' &&
					latest[item.task_id]?.status !== 'skipped'
			)?.task_id ?? null
	};
};
