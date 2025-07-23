<script lang="ts">
	import type { SegmentedProgressBarPropsWithoutCurrentTime } from '$lib/elements/SegmentedProgressBar.svelte';
    import { navbarProps } from "$lib/elements/NavBar.svelte";
	import PracticePage from "$lib/pages/PracticePage.svelte";
	import type { SupabaseClient } from '@supabase/supabase-js';
	import { getContext } from 'svelte';
	import { goto, invalidate } from '$app/navigation';
	import type PracticeStep from '$lib/model/PracticeStep.js';
	import type { PracticePlan, PracticePlanActivity } from '$lib/model/PracticePlan';
	import type { Readable } from 'svelte/store';
	import type { Dance } from '$lib/data/dances-store.js';
	import { GetTeachingAgent } from '$lib/ai/TeachingAgent/TeachingAgent.js';

    export let data;

    function rangeInt(from: number, upTo: number) {
        return Array.from( { length: upTo-from }, (e, i) => i + from );
    }

    const dance = getContext<Readable<Dance>>('dance');
    // const danceTree = getContext<Readable<DanceTree>>('danceTree');
    // const teachingAgent = getContext<Readable<TeachingAgent>>('teachingAgent');
    const practicePlan = getContext<Readable<PracticePlan>>('practicePlan');
        
    let practicePage: PracticePage | undefined;
    const practiceActivity = getContext<Readable<PracticePlanActivity>>('practiceActivity');

    let supabase: SupabaseClient = getContext('supabase');
    const teachingAgent = GetTeachingAgent();

    let parentUrl: string;
    let activityBaseUrl: string;
    $: {
        parentUrl = '/dance/' + encodeURIComponent(data.dance.clipRelativeStem) + '/' + encodeURIComponent(data.danceTree.tree_name) + '/';
        activityBaseUrl = parentUrl + encodeURIComponent(data.practiceActivity.id) + '/';

        navbarProps.update(props => ({
            ...props,
            collapsed: false,
            pageTitle: data.practiceActivity.title,
            subtitle:  data.practiceStep.title,
            back: {
                url: parentUrl,
                title: `${data.dance.title} Home`,
            },
        }));
    }

    let segmentBreaks: number[];
    $: {
        segmentBreaks = $practicePlan.demoSegmentation?.segmentBreaks ?? [];
    }
    let segmentIsolateIndex = undefined as undefined | number | number[];

    $: if (data.practiceActivity.type === "segment") {
        segmentIsolateIndex = data.practiceActivity.segmentIndex;
    }  else {
        let segmentStarts = [$practicePlan.startTime, ...segmentBreaks];
        let segmentEnds = [...segmentBreaks, $practicePlan.endTime];
        console.log('segment starts:', segmentStarts)
        console.log('segment ends:', segmentEnds)
        console.log(' data.practiceStep.startTime:',  data.practiceStep.startTime)
        console.log(' data.practiceStep.endTime:',  data.practiceStep.endTime)
        // determine isolated segments manually.
        let isolateStartIndex = segmentEnds.findIndex(time => time >= data.practiceStep.startTime);
        let isolateEndIndex = segmentStarts.findIndex(time => time >= data.practiceStep.endTime);
        if (isolateEndIndex === -1) {
            isolateEndIndex = segmentStarts.length;
        }
        console.log('isolate start,end:', isolateStartIndex, isolateEndIndex)
        segmentIsolateIndex = undefined;
        if (isolateStartIndex !== -1 && isolateEndIndex !== -1 && isolateStartIndex <= isolateEndIndex) {
            segmentIsolateIndex = rangeInt(isolateStartIndex, isolateEndIndex);
        }
    }

    let progressBarProps: SegmentedProgressBarPropsWithoutCurrentTime;
    $: progressBarProps = {
        startTime: $practicePlan.startTime,
        endTime: $practicePlan.endTime,
        breakpoints: $practicePlan.demoSegmentation?.segmentBreaks ?? [],
        labels: $practicePlan.demoSegmentation?.segmentLabels ?? [],
        enableSegmentClick: true,
        isolatedSegments: segmentIsolateIndex,
    };

    let currentStepIndex: number;
    $: currentStepIndex = $practiceActivity.steps.findIndex(step => step.id === data.practiceStep.id);

    let nextStep: PracticeStep | undefined;
    $: nextStep = $practiceActivity.steps[currentStepIndex + 1];

    async function onNextClicked() {

        try {
            console.log('onNextClicked: updating activity step progress for', data.practiceActivity.id, data.practiceStep.id);
            await $teachingAgent.updateActivityStepProgress(
                data.practiceActivity.id,
                data.practiceStep.id, 
                { completed: true },
            );  
        } catch (error) {
            console.trace('Error updating activity step progress:', error);
        }
  
        // invalidate('progress:' + data.dance.clipRelativeStem);
        
        if (nextStep) {
            console.log('onNextClicked: navigating to next step:', nextStep.id);
            const url = activityBaseUrl + encodeURIComponent(nextStep.id) + "/";
            try {
                await goto(url, { invalidateAll: true });
            } catch (error) {
                console.trace('Error navigating to next step:', error);
            }
            return;
        }

        const queryString = '?completedStep=' + encodeURIComponent(data.practiceActivity.id) + '/' + encodeURIComponent(data.practiceStep.id); 
        console.log('goto', parentUrl + queryString);
        try {
            await goto(parentUrl + queryString, { invalidateAll: true });
        } catch(error) {
            console.trace('Error navigating to parent URL:', error);
        }

        console.log('onNextClicked: reset practicePage after navigation');
        practicePage?.reset();
    }
</script>

<div class="p-4 overflow-hidden">
    <PracticePage 
        bind:this={practicePage}
        dance={data.dance}    
        practiceStep={data.practiceStep}
        practicePlan={$practicePlan}
        pageActive={true}
        progressBarProps={progressBarProps}
        on:nextClicked={onNextClicked}
        continueBtnTitle={nextStep ? nextStep.title : "Finish"}
        continueBtnIcon={nextStep ? "nextarrow" : "check"}
    />
</div>

<style>
    div {
        height: var(--content_height);
        width: 100%;
        overflow: hidden;
    }
</style>