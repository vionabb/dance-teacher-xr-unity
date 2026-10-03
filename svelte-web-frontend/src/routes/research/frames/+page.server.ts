import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import { isLoopbackClientAddress } from '$lib/server/client-address';
import { latestFrameRevisions, loadFrameSource } from '$lib/server/research-frame-review';
import { reviewDisplayIdentity } from '$lib/server/research-video-manifest';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ getClientAddress }) => {
	if (!dev || !isLoopbackClientAddress(getClientAddress())) error(404);
	const source = await loadFrameSource();
	if (!source) return { configured: false as const, tasks: [], annotator: '', experimentId: '' };
	const latest = await latestFrameRevisions(source);
	return {
		configured: true as const,
		annotator: source.config.annotator,
		experimentId: source.manifest.experimentId,
		tasks: source.manifest.tasks.map((task) => ({
			taskId: task.task_id,
			sourceCorpus: task.source_corpus,
			label: task.display_label || task.task_id,
			identity: reviewDisplayIdentity(task.source_corpus, task.source_stem),
			frameCount: task.frame_count,
			status: latest[task.task_id]?.status ?? 'unjudged',
			lastViewedFrame: latest[task.task_id]?.frame_usability_response?.last_viewed_frame ?? 0
		}))
	};
};
