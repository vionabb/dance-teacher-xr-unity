<script lang="ts">
    import VideoWithSkeleton from '$lib/elements/VideoWithSkeleton.svelte';
	import LearningJourneyTrail from '$lib/elements/LearningJourneyTrailUI.svelte';
	import { getDanceVideoSrc, type Dance, danceTrees } from "$lib/data/dances-store";
    import type { SupabaseClient } from '@supabase/supabase-js';
	import { getContext, onMount, tick } from 'svelte';
	import { danceVideoVolume } from '$lib/model/settings';
	import type { PracticePlan, PracticePlanActivity } from '$lib/model/PracticePlan';
	import Icon from '@iconify/svelte';
	import { goto } from '$app/navigation';
	import type PracticeStep from '$lib/model/PracticeStep';
	import { get_practiceplan_progress, type PracticePlanProgress } from '$lib/data/activity-progress';
    
    let supabase: SupabaseClient = getContext('supabase');

    export let dance: Dance;
    export let practicePlan: PracticePlan;

    let danceSrc: string;
    $: danceSrc = getDanceVideoSrc(supabase, dance);

    let videoElement: VideoWithSkeleton;
    let videoWidth: number;
    let videoHeight: number;
    let videoCurrentTime: number;
    let videoPaused: boolean;
    let segmentBreaks = [] as number[]
    $:  segmentBreaks = practicePlan.demoSegmentation?.segmentBreaks ?? [];
    let focusedSegmentIndex: number | undefined;
    let repeatEnabled = false;
    
    function toggleRepeatMode() {
        repeatEnabled = !repeatEnabled;
    }

    let lastClickedSegmentStartTime: number = -1;
    let lastClickedSegmentEndTime: number = 999999;

    function onSegmentClicked(e: any) {
        if (e?.detail?.start !== undefined) {
            focusedSegmentIndex = e.detail.index;
            lastClickedSegmentStartTime = e.detail.start;
            videoCurrentTime = lastClickedSegmentStartTime
            lastClickedSegmentEndTime = e.detail.end;
            videoPaused = false;
        }
    }

    async function startVideo(startTime?: number) {
        videoPaused = true;
        if (startTime !== undefined) {
            videoCurrentTime = startTime;
        }
        await new Promise(resolve => setTimeout(resolve, 100));

        await videoElement.play();
    }

    $: {
        if (focusedSegmentIndex !== undefined && videoCurrentTime >= lastClickedSegmentEndTime) {
            videoCurrentTime = lastClickedSegmentEndTime;
            videoPaused = true;
        } else if (!repeatEnabled && focusedSegmentIndex === undefined && videoCurrentTime >= practicePlan.endTime) {
            videoCurrentTime = practicePlan.endTime;
            videoPaused = true;
        }
    }

    $: {
        if (repeatEnabled && focusedSegmentIndex !== undefined && videoCurrentTime >= lastClickedSegmentEndTime) {
            startVideo(lastClickedSegmentStartTime);
        }  
        else if (repeatEnabled && focusedSegmentIndex === undefined && videoCurrentTime >= practicePlan.endTime) {
            startVideo(practicePlan.startTime);
        } 
    }

    function clearFocusedSegment() {
        focusedSegmentIndex = undefined;
        lastClickedSegmentEndTime = 999999;
        lastClickedSegmentStartTime = -1;
    }

    function onSkipBackClicked(e: Event) {
        clearFocusedSegment();
    }

    function onPlayPauseClicked(e: Event) {
        if (videoPaused && focusedSegmentIndex !== undefined && videoCurrentTime >= lastClickedSegmentEndTime) {
            clearFocusedSegment();
            if (videoCurrentTime >= practicePlan.endTime) {
                videoCurrentTime = practicePlan.startTime;
            }
            videoPaused = false;
            e.preventDefault();
            
        }  else if (videoPaused && videoCurrentTime >= practicePlan.endTime) {
            videoCurrentTime = practicePlan.startTime;
            videoPaused = false;
            e.preventDefault();
        }   
    }

    function onLearningActivityStepClicked(activity: PracticePlanActivity, step: PracticeStep) {

        const url = `${encodeURIComponent(activity.id)}/${step.id}/`;
        console.log('onLearningActivityStepClicked', activity.id, step.id, 'url:', url);
        goto(url);

    }

    let practicePlanProgress: PracticePlanProgress | undefined;
    onMount(() => {
        practicePlanProgress = get_practiceplan_progress(supabase, dance.clipRelativeStem, practicePlan.id);
    });

</script>

<section class="learning-dashboard p-4 gap-4">
    
    <div class="preview-video-container"
        style:--videoWidth={videoWidth}px
        style:--videoHeight={videoHeight}px
        style:--aspect-ratio={videoWidth / videoHeight}>
        <div class="card p-0 video-wrapper">
            <VideoWithSkeleton 
                bind:this={videoElement}
                dance={dance}
                controls={{
                    showPlayPause: true,
                    showProgressBar: true,
                    enablePlayPause: true,
                    overrideStartTime: practicePlan.startTime,
                    overrideEndTime: practicePlan.endTime,
                    progressBarProps: {
                        enableSegmentClick: true,
                        startTime: practicePlan.startTime,
                        endTime: practicePlan.endTime,
                        breakpoints: segmentBreaks,
                        labels: practicePlan.demoSegmentation?.segmentLabels ?? [],
                        isolatedSegments: focusedSegmentIndex,
                    }
                }}
                volume={$danceVideoVolume}
                bind:currentTime={videoCurrentTime}
                bind:paused={videoPaused}
                bind:videoWidth
                bind:videoHeight
                on:segmentClicked={onSegmentClicked}
                on:skipBackClicked={onSkipBackClicked}
                on:playPauseClicked={onPlayPauseClicked}
                src={danceSrc}
                >
                <source src={danceSrc} type="video/mp4" />
                <span slot="extra-control-buttons">
                    <button class="daisy-btn daisy-btn-square max-md:daisy-btn-sm" on:click={toggleRepeatMode}>
                        <!-- <Icon icon="ic:round-repeat-one" /> -->
                        {#if !repeatEnabled}
                            <span class="iconify-[lucide--repeat] size-6 md:size-7"></span>
                            <span class="absolute iconify-[lucide--slash] size-6 md:size-7 -scale-x-100"></span>
                            <!-- <span class="iconify-[pepicons-pop--repeat-off] size-6 md:size-8"></span> -->
                            <!-- <Icon icon="pepicons-pop:repeat-off" /> -->
                        {:else if focusedSegmentIndex !== undefined}
                            <span class="iconify-[lucide--repeat-1] size-6 md:size-7"></span>
                            <!-- <Icon icon="f7:repeat-1" /> -->
                        {:else}
                            <span class="iconify-[lucide--repeat] size-6 md:size-7"></span>
                            <!-- <Icon icon="f7:repeat" /> -->
                        {/if}
                    </button>
                    <!-- <span>
                        {lastClickedSegmentStartTime.toFixed(1)}-{videoCurrentTime.toFixed(1)}
                    </span> -->
                </span>
            </VideoWithSkeleton>
        </div>
    </div>

    <div class="card learning-journey flex flex-col">
        <h3 class="mb-4 text-xl text-center">Learning Journey</h3>
        
        <LearningJourneyTrail 
            {practicePlan}
            {practicePlanProgress}
            on:practiceStepClicked={(e) => onLearningActivityStepClicked(e.detail.activity, e.detail.step)}/>
    </div>

    <!-- <div class="column is-narrow">
        <div class="box">
            <h3 class="is-size-5">Stats</h3>
            Stats
        </div>
        <div class="box">
            <h3 class="is-size-5">Achievements</h3>
            Achievements
        </div>
    </div> -->
    
</section>


<style lang="scss">
.learning-dashboard {
    height: var(--content_height) - 1rem;
    box-sizing: border-box;
    overflow: hidden;
    display: grid;
    grid-template: 
        'preview journey' 1fr / 
        minmax(320px, auto) minmax(200px, 1fr)
        ;
}

.preview-video-container {
    grid-area: preview;
    overflow: hidden;
    max-height: calc(var(--content_height) - 2rem);
    align-self: start;
    justify-self: right;
    aspect-ratio: var(--aspect-ratio);
}

.video-wrapper {
    display: flex;
    max-height: 100%;
    overflow: hidden;
}

.learning-journey {
    grid-area: journey;
    max-height: calc(var(--content_height) - 2rem);
    overflow: auto;
}
</style>