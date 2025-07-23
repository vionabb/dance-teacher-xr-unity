<script lang="ts">
	import type { PracticePlanProgress } from "$lib/data/activity-progress";
    import type { PracticePlanActivity } from "$lib/model/PracticePlan";
	import type PracticeStep from "$lib/model/PracticeStep";
	import { createEventDispatcher } from "svelte";

    export let activity: PracticePlanActivity;
    export let practicePlanProgress: PracticePlanProgress | undefined = undefined;
    export let suggestedStepId: string | undefined = undefined;
    export let suggestedStepTooltip: string | undefined = undefined;
    export let isVertical: boolean = false;

    export let stepClasses: string = "";

    let dispatch = createEventDispatcher<{
        'practiceStepClicked': { activity: PracticePlanActivity, step: PracticeStep };
    }>();

    function onStepClicked(step: PracticeStep) {
        dispatch('practiceStepClicked', { activity, step });
    }
</script>


<ul class="daisy-steps overflow-visible"
    class:daisy-steps-vertical={isVertical}>
    {#each activity.steps as step, i}
    {@const isStepComplete = practicePlanProgress?.[activity.id]?.[step.id]?.completed ?? false}
    {@const isStepSuggested = suggestedStepId === step.id}
    {@const stepLabel = isStepComplete ? '✓' : (i + 1).toString() }
    <a tabindex=0
        data-content={stepLabel}
        class={`daisy-step text-base-content rounded-box p-1 ${stepClasses}`}
        role="button"
        class:daisy-step-primary={isStepSuggested}
        class:daisy-step-success={!isStepSuggested && isStepComplete}
        on:click={() => onStepClicked(step)}
        >   
        <span

            data-tip={isStepSuggested ? suggestedStepTooltip : ""}
            class="daisy-tooltip-bottom"
            class:daisy-tooltip-accent={isStepSuggested && suggestedStepTooltip}
            class:daisy-tooltip={isStepSuggested && suggestedStepTooltip}
            class:daisy-tooltip-open={isStepSuggested && suggestedStepTooltip}
        >
            {step.title}
        </span>
        <!-- <li 
            class="daisy-step" 
            data-content={stepLabel}
            class:daisy-step-primary={isStepSuggested}
            class:daisy-step-success={!isStepSuggested && isStepComplete}>
            {step.title}
        </li> -->
    </a>
    {/each}
</ul>



