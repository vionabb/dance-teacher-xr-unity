<script lang="ts">
	import TeachingAgent from '$lib/ai/TeachingAgent/TeachingAgent';
	import { getContext, onDestroy, setContext } from 'svelte';
	import {
		derived,
		get,
		readonly,
		toStore,
		writable,
		type Readable,
		type Writable
	} from 'svelte/store';
	import type { PracticePlan } from '$lib/model/PracticePlan';
	import type { PracticePlanProgress } from '$lib/data/activity-progress';
	import type { MotionVideo, MotionVideoSegmentation } from '$lib/ai/backend/IDataBackend.js';

	let { data, children } = $props();

	// let danceId = $derived(page.params.danceId);
	// let danceTreeName = $derived(page.params.danceTreeName);

	const motionSegmentation = toStore<MotionVideoSegmentation>(() => data.motionSegmentation);
	const dataBackend = toStore(() => data.databackend);
	const userLearningModel = toStore(() => data.userLearningModel);
	const motionVideoReadOnly = getContext<Readable<MotionVideo>>('motionVideo');
	const motionSegmentationReadOnly = derived(
		motionSegmentation,
		(dt): MotionVideoSegmentation => dt
	);
	setContext<Readable<MotionVideo>>('motionVideo', motionVideoReadOnly);
	setContext<Readable<MotionVideoSegmentation>>('motionSegmentation', motionSegmentationReadOnly);

	const teachingAgent = writable<TeachingAgent>(
		new TeachingAgent({
			motionVideo: get(motionVideoReadOnly),
			motionSegmentation: get(motionSegmentationReadOnly),
			dataBackend: get(dataBackend),
			userLearningModel: get(userLearningModel)
		})
	);

	const teachingAgentReadonly = readonly(teachingAgent);
	setContext<Readable<TeachingAgent>>('teachingAgent', teachingAgentReadonly);

	const practicePlanProgress: Writable<PracticePlanProgress> = writable(
		get(get(teachingAgent).progress)
	);
	setContext<Readable<PracticePlanProgress>>(
		'practicePlanProgress',
		readonly(practicePlanProgress)
	);

	let progressUpdaterUnsubscribe: () => void = () => {};
	onDestroy(() => {
		progressUpdaterUnsubscribe();
	});

	$effect(() => {
		// make this responsive to changes in data
		console.debug('+layout.svelte: data changed, re-initializing teachingAgent');
		const ta = new TeachingAgent({
			motionVideo: $motionVideoReadOnly,
			motionSegmentation: $motionSegmentation,
			dataBackend: $dataBackend,
			userLearningModel: $userLearningModel
		});
		teachingAgent.set(ta);
		progressUpdaterUnsubscribe();
		progressUpdaterUnsubscribe = ta.progress.subscribe((progress) => {
			practicePlanProgress.set(progress);
		});
	});

	const practicePlan = writable<PracticePlan>(get($teachingAgent.practicePlan));
	const practicePlanReadonly = derived(practicePlan, (plan): PracticePlan => plan);
	setContext<Readable<PracticePlan>>('practicePlan', practicePlanReadonly);

	teachingAgentReadonly.subscribe((agent) => {
		agent.practicePlan.subscribe((plan) => {
			practicePlan.set(plan);
		});
	});
</script>

{@render children?.()}
