<script lang="ts">

	import TeachingAgent from "$lib/ai/TeachingAgent/TeachingAgent";
	import { getContext, onDestroy, setContext } from "svelte";
	import { derived, get, readonly, writable, type Readable, type Writable } from "svelte/store";
	import type { DanceTree } from '$lib/data/dances-store';
	import type { PracticePlan } from '$lib/model/PracticePlan';
	import type { PracticePlanProgress } from "$lib/data/activity-progress";
	import type { MotionVideo, MotionVideoSegmentation } from "$lib/ai/backend/IDataBackend.js";
	
    let { data, children } = $props();

    // let danceId = $derived(page.params.danceId);
    // let danceTreeName = $derived(page.params.danceTreeName);

    
    const motionSegmentation = writable<MotionVideoSegmentation>(data.motionSegmentation);
    const motionVideoReadOnly = getContext<Readable<MotionVideo>>('motionVideo');
    const motionSegmentationReadOnly = derived(motionSegmentation, (dt): MotionVideoSegmentation => dt);
    setContext<Readable<MotionVideo>>('motionVideo', motionVideoReadOnly);
    setContext<Readable<MotionVideoSegmentation>>('motionSegmentation', motionSegmentationReadOnly);
    $effect(() => {
        motionSegmentation.set(data.motionSegmentation);
    });
    
    const teachingAgent = writable<TeachingAgent>(new TeachingAgent({
        motionVideo: data.motionVideo,
        motionSegmentation: data.motionSegmentation,
        dataBackend: data.databackend,
        userLearningModel: data.userLearningModel,
    }));
    

    const teachingAgentReadonly = readonly(teachingAgent);
    setContext<Readable<TeachingAgent>>('teachingAgent', teachingAgentReadonly);

    const practicePlanProgress: Writable<PracticePlanProgress> = writable(get(get(teachingAgent).progress));
    setContext<Readable<PracticePlanProgress>>('practicePlanProgress', readonly(practicePlanProgress));
    
    let progressUpdaterUnsubscribe: () => void = () => {};
    onDestroy(() => {
        progressUpdaterUnsubscribe();
    });

    $effect(() => {
        // make this responsive to changes in data
        console.debug('+layout.svelte: data changed, re-initializing teachingAgent');
        const ta = new TeachingAgent({
            motionVideo: $motionVideoReadOnly,
            motionSegmentation: data.motionSegmentation,
            dataBackend: data.databackend,
            userLearningModel: data.userLearningModel,
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