<script lang="ts">
	import PracticeStepList from './PracticeStepList.svelte';
	import type { PracticePlanProgress } from '$lib/data/activity-progress';
	import type { PracticePlan, PracticePlanActivity, PracticePlanActivityBase } from '$lib/model/PracticePlan';
	import type PracticeStep from '$lib/model/PracticeStep';
    import { createEventDispatcher, onMount, tick } from 'svelte';

    export let practicePlan: PracticePlan;
    export let practicePlanProgress: PracticePlanProgress | undefined;

    let openActivityDropdowns = {} as { [activityId: string]: boolean };    

    const dispatch = createEventDispatcher<{
        activityClicked: PracticePlanActivity;
        practiceStepClicked: { activity: PracticePlanActivity, step: PracticeStep };
    }>();

    function onActivityClicked(activity: PracticePlanActivity) {
        // close all other activities
        let wasOpen = openActivityDropdowns[activity.id] ?? false;
        console.log('onActivityClicked', activity.id, 'isOpen: ' + wasOpen)
        for (const activityId in openActivityDropdowns) {
            if (activityId !== activity.id && openActivityDropdowns[activityId] === true) {
                openActivityDropdowns[activityId] = false;
                console.log('closing', activityId)
            }
        }      
        openActivityDropdowns[activity.id] = !wasOpen;  
    }

    function isActivityComplete(activity: PracticePlanActivity, progress: PracticePlanProgress) {
        return activity.steps.reduce(
            (acc, step) => acc && (
                (practicePlanProgress?.[activity.id]?.[step.id]?.completed) ?? false), 
                true
        );
    }
    function getActivityCompletionPercent(activity: PracticePlanActivity, progress: PracticePlanProgress) {
        const numSteps = activity.steps.length;
        const numCompletedSteps = activity.steps.reduce(
            (acc, step) => acc + (
                (practicePlanProgress?.[activity.id]?.[step.id]?.completed) ? 1 : 0), 
                0
        );
        return numCompletedSteps / numSteps;
    }

    let nextSuggestedActivity = undefined as undefined | PracticePlanActivityBase;
    function nextIncompleteActivity(progress: PracticePlanProgress | undefined) {

        if (progress === undefined) {
            return practicePlan.stages[0].activities[0];
        }

        const allActivities = practicePlan.stages.flatMap(stage => stage.activities);
        const firstIncompleteActivity = allActivities.find(
            activity => !isActivityComplete(activity, progress!)
        );

        return firstIncompleteActivity;
    }
    $: nextSuggestedActivity = nextIncompleteActivity(practicePlanProgress);
    onMount(() => {
        tick().then(() => {
            if (nextSuggestedActivity) {
                openActivityDropdowns[nextSuggestedActivity.id] = true;
            }
        });
    });
    let nextSuggestedStep = undefined as undefined | PracticeStep;
    $: practicePlanProgress, nextSuggestedStep = (nextSuggestedActivity?.steps ?? []).find(
        step => {
            const progressStatus = practicePlanProgress?.[nextSuggestedActivity?.id ?? '']?.[step.id];
            const isCompleted = progressStatus?.completed ?? false;
            return !isCompleted
        }
    );

    function onPracticeStepClicked(activity: PracticePlanActivity, step: PracticeStep) {
        dispatch('practiceStepClicked', { activity, step });
    }

    let isVeryFirstActivityStep: boolean;
    $: isVeryFirstActivityStep = practicePlanProgress === undefined || Object.values(practicePlanProgress).reduce(
        (nonCompleteSoFar, activityProgress) => nonCompleteSoFar && Object.values(activityProgress).reduce(
            (noStepCompleteSoFar, stepProgress) => noStepCompleteSoFar && !stepProgress.completed, 
            true
        ), 
        true
    
    );    
</script>

<!-- <details class="daisy-collapse bg-base-200">
    <summary class="daisy-collapse-title text-xl font-medium">nextSuggestedActivity</summary>
    <div class="daisy-collapse-content max-h-80 overflow-y-auto"> 
        <pre>{JSON.stringify(nextSuggestedActivity, undefined, 2)}</pre>
    </div>
</details> -->

<!-- <details class="daisy-collapse bg-base-200">
    <summary class="daisy-collapse-title text-xl font-medium">nextSuggestedStep</summary>
    <div class="daisy-collapse-content max-h-80 overflow-y-auto"> 
        <pre>{JSON.stringify(nextSuggestedStep, undefined, 2)}</pre>
    </div>
</details> -->

<div class="flex flex-col learning-journey items-center relative gap-20">
    {#each practicePlan.stages as stage, stage_i}
    <div class="flex flex-row gap-4 justify-center relative flex-wrap">
        {#each stage.activities as activity, activity_i}
            {@const isComplete = practicePlanProgress?.[activity.id] !== undefined && 
                    isActivityComplete(activity, practicePlanProgress)
            }
            {@const percentComplete = practicePlanProgress?.[activity.id] !== undefined 
                    ? getActivityCompletionPercent(activity, practicePlanProgress) 
                    : 0
            }
            {@const isActivitySuggested = nextSuggestedActivity?.id === activity.id}
            {@const isDropdownOpen = openActivityDropdowns[activity.id] ?? false}
            {@const activitySuggestedStepId = isActivitySuggested ? nextSuggestedStep?.id : undefined}
            {@const showActivityTooltip = isActivitySuggested && !isDropdownOpen}
            <!-- {@const hasStepCompleted = practicePlanProgress?.[activity.id] !== undefined && 
                    activity.steps.reduce(
                        (acc, step) => acc || (
                            (practicePlanProgress?.[activity.id]?.[step.id]?.completed) ?? false), 
                            false
                    )} -->
            {@const isSuggestingFirstStepInActivity = isActivitySuggested && activitySuggestedStepId && activitySuggestedStepId === activity.steps[0]?.id}
            {@const isSuggestingLastStepInActivity = isActivitySuggested && activitySuggestedStepId && activitySuggestedStepId === activity.steps[activity.steps.length - 1]?.id}
            {@const activityTooltipText = !isActivitySuggested ? 
                undefined : 
                (isVeryFirstActivityStep ? "Start learning here!": 
                    (isSuggestingFirstStepInActivity ? "Let's start this activity!" : 
                        (isSuggestingLastStepInActivity ? "Let's finish this activity!" : "Continue with this activity!")))
                }
                    
            <div class="flex flex-col items-center justify-start"
            >
                <details class="daisy-dropdown" 
                         bind:open={openActivityDropdowns[activity.id]}>
                    <summary
                        tabindex="0"                     
                        class="size-32 flex justify-center items-center
                               border-b-4 daisy-btn 
                               rounded-full" 
                        class:border-b-base-300={!isDropdownOpen}
                        class:border-b-primary={isDropdownOpen}
                        class:[hov:border-b-primary]={isDropdownOpen}
                        class:daisy-btn-success={isComplete}
                        data-tip={activityTooltipText}
                        class:daisy-tooltip-accent={showActivityTooltip}
                        class:daisy-tooltip={showActivityTooltip}
                        class:daisy-tooltip-open={showActivityTooltip}
                        on:click|preventDefault={() => { onActivityClicked(activity); }} >
                        {#if activity.type === 'segment'}
                            <span class="px-8 py-1 rounded-full bg-green-500">
                                { activity.segmentTitle }
                            </span>
                        {:else if activity.type === 'checkpoint'}
                            Checkpoint
                        {:else if activity.type === 'drill'}
                            Drill
                        {:else if activity.type === 'finale'}
                            Finale
                        {:else}
                            Unknown
                        {/if}
                    </summary>
                    <div class="daisy-dropdown-content  z-[2] daisy-card daisy-card-compact w-64 p-2 shadow
                    bg-base-200 text-base-content shadow-primary"
                    >
                        <div class="daisy-card-body p-0">
                        <!-- <h3 class="daisy-card-title">Card title!</h3> -->
                        <PracticeStepList 
                            {activity}
                            {practicePlanProgress} 
                            suggestedStepId={isActivitySuggested ? activitySuggestedStepId : undefined}
                            suggestedStepTooltip={isActivitySuggested ? 
                                (isVeryFirstActivityStep ? "Try this first!" : 
                                    (isSuggestingLastStepInActivity ? "Wrap it up here!" : "Try this next!")) : 
                                undefined}
                            on:practiceStepClicked={(e) => onPracticeStepClicked(e.detail.activity, e.detail.step)}
                            stepClasses="hover:bg-base-100"
                        />
                        </div>
                    </div>
                </details>
            </div>
        {/each}
    </div>
    {/each}
</div>

<style lang="scss">

    .segment-body {
        padding: 0.25rem 2rem;
        border-radius: 9999px;
        background: green;
    }
</style>