<script lang="ts">

	import { page } from "$app/state";
	import TeachingAgent from "$lib/ai/TeachingAgent/TeachingAgent";
	import { onDestroy, setContext } from "svelte";
	import { derived, get, readonly, writable, type Readable, type Writable } from "svelte/store";
	import type { Dance, DanceTree } from '$lib/data/dances-store';
	import type { PracticePlan } from '$lib/model/PracticePlan';
	import type { PracticePlanProgress } from "$lib/data/activity-progress";
	// Optionally, create a shared context-types.ts and import from there
	// import type { AppContext } from '$lib/context-types';

    let { data, children } = $props();

    // let danceId = $derived(page.params.danceId);
    // let danceTreeName = $derived(page.params.danceTreeName);

    const dance = writable<Dance>(data.dance);
    const danceTree = writable<DanceTree>(data.danceTree);
    const danceReadOnly = derived(dance, (d): Dance => d);
    const danceTreeReadOnly = derived(danceTree, (dt): DanceTree => dt);
    setContext<Readable<Dance>>('dance', danceReadOnly);
    setContext<Readable<DanceTree>>('danceTree', danceTreeReadOnly);
    $effect(() => {
        dance.set(data.dance);
        danceTree.set(data.danceTree);
    });
    
    const teachingAgent = writable<TeachingAgent>(new TeachingAgent($danceTree, $dance, data.databackend, {
        initialPracticePlan: data.initialPracticePlan,
        initialProgress: data.initialPracticePlanProgress
    }));
    console.log('+layout.svelte: teachingAgent initialized:', get(teachingAgent), 'initialProgress:', data.initialPracticePlanProgress);
    const teachingAgentReadonly = readonly(teachingAgent);
    setContext<Readable<TeachingAgent>>('teachingAgent', teachingAgentReadonly);

    const practicePlanProgress: Writable<PracticePlanProgress> = writable(get(get(teachingAgent).progress));
    setContext<Readable<PracticePlanProgress>>('practicePlanProgress', readonly(practicePlanProgress));
    
    let progressUpdaterUnsubscribe: () => void = () => {};
    onDestroy(() => {
        progressUpdaterUnsubscribe();
    });

    $effect(() => {
        const ta = new TeachingAgent($danceTree, $dance, data.databackend, {
            initialPracticePlan: data.initialPracticePlan,
            initialProgress: data.initialPracticePlanProgress
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