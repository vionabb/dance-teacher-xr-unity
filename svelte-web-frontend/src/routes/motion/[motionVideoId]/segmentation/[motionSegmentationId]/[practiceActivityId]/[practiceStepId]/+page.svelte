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

	import { GetTeachingAgent } from '$lib/ai/TeachingAgent/TeachingAgent.js';
	import type { AttemptSettings, VideoRecording } from '$lib/ai/IPracticePage.js';
	import type { FrontendEvaluationTrack, FrontendPerformanceSummary } from '$lib/ai/FrontendDanceEvaluator.js';
	import type { TerminalFeedback } from '$lib/model/TerminalFeedback.js';
    import { generateFeedbackNoPerformance } from '$lib/ai/feedback';

    import frontendPerformanceHistory from '$lib/ai/frontendPerformanceHistory';
	import { debugMode, debugMode__addPlaceholderAchievement } from '$lib/model/settings.js';
	import { applyAction } from '$app/forms';

    let { data } = $props();

    function rangeInt(from: number, upTo: number) {
        return Array.from( { length: upTo-from }, (e, i) => i + from );
    }

    // Helper to strip heavy / circular fields from a PracticeStep before persisting
    function cleanPracticeStep(step: PracticeStep) {
        if (!step) return step as any;
        const { motionVideo, motionSegmentation, motionSegmentationNode, feedbackFunction, state, ...rest } = step as any;
        return rest;
    }

    const practicePlan = getContext<Readable<PracticePlan>>('practicePlan');
        
    let practicePage: PracticePage | undefined = $state();
    const practiceActivity = getContext<Readable<PracticePlanActivity>>('practiceActivity');

    const teachingAgent = GetTeachingAgent();

    let parentUrl: string = $derived('/motion/' + data.motionVideo.id + '/segmentation/' + data.motionSegmentation.id + '/');
    let activityBaseUrl: string = $derived(parentUrl + encodeURIComponent(data.practiceActivity.id) + '/');
    $effect(() => {
        navbarProps.update(navProps => ({
            ...navProps,
            collapsed: false,
            pageTitle: data.practiceActivity.title,
            subtitle:  data.practiceStep.title,
            back: {
                url: parentUrl,
                title: `${data.motionVideo.display_name} Home`,
            },
        }));
    });

    let segmentBreaks: number[] = $derived($practicePlan.demoSegmentation?.segmentBreaks ?? []);

    let segmentIsolateIndex = $derived.by(() => {
        if (data.practiceActivity.type === "segment") {
            return data.practiceActivity.segmentIndex as number;
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
            
            if (isolateStartIndex !== -1 && isolateEndIndex !== -1 && isolateStartIndex <= isolateEndIndex) {
                return rangeInt(isolateStartIndex, isolateEndIndex) as number[];
            }
            return undefined;
        }
    });

    let progressBarProps: SegmentedProgressBarPropsWithoutCurrentTime = $derived({
        startTime: $practicePlan.startTime,
        endTime: $practicePlan.endTime,
        breakpoints: $practicePlan.demoSegmentation?.segmentBreaks ?? [],
        labels: $practicePlan.demoSegmentation?.segmentLabels ?? [],
        enableSegmentClick: true,
        isolatedSegments: segmentIsolateIndex,
    });
    

    let currentStepIndex: number = $derived($practiceActivity.steps.findIndex(step => step.id === data.practiceStep.id));
    

    let nextStep: PracticeStep | undefined = $derived($practiceActivity.steps[currentStepIndex + 1]);
    

    async function onNextClicked() {

        try {
            console.log('onNextClicked: updating activity step progress for', data.practiceActivity.id, data.practiceStep.id);
            data.userLearningModel.progress = await $teachingAgent.updateActivityStepProgress(
                data.userLearningModel.progress,
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

    let gettingFeedback: boolean = false;
    async function getFeedback(
        perfSummary: FrontendPerformanceSummary | null, 
        recordedTrack:  FrontendEvaluationTrack | null,
        attemptSettings: AttemptSettings,
    ) {
        if (gettingFeedback) return;
        gettingFeedback = true;

        let feedback: TerminalFeedback | undefined = undefined;

        if (!data.practiceStep?.feedbackFunction) {
            feedback = generateFeedbackNoPerformance(
                $frontendPerformanceHistory,
                data.practiceStep?.motionSegmentationNode?.id ?? '',
            );
        } else {
            feedback = await data.practiceStep.feedbackFunction({
                attemptSettings: {
                    startTime: data.practiceStep?.startTime ?? 0,
                    endTime: data.practiceStep?.endTime ?? data.motionVideo.duration,
                    playbackSpeed: attemptSettings.effectivePlaybackSpeed,
                    referenceVideoVisible: attemptSettings.referenceVideoVisible,
                    userVideoVisible: attemptSettings.userVideoVisible,
                },
                practiceStep: data.practiceStep,
                practicePlan: data.userLearningModel.plan,
                performanceSummary: perfSummary,
                recordedTrack
            });
        }

        gettingFeedback = false;

        if ($debugMode && $debugMode__addPlaceholderAchievement) {
            feedback?.achievements?.push("placeholder achievement");
        }

        return feedback;
    }

     async function onPracticeAttemptCompleted(attempt: {
        motionVideoId: number,
        learningModelId?: string,
        attemptSettings: AttemptSettings,
        attemptDurationsSecs?: number,
        videoRecording?: VideoRecording,
        performanceSummary?: FrontendPerformanceSummary,
    }): Promise<null | TerminalFeedback> {

        let recordedTrack = attempt.performanceSummary?.adjustedTrack ?? null;

    let performanceAttemptPromise = data.databackend.createUserPerformanceAttempt({
            self_report: {},
            evaluation: {},
            duration_secs: attempt.attemptDurationsSecs ?? null,
            motion_id: data.motionVideo.id,
            learningmodel_id: data.userLearningModel.id,
            video_recording_storagepath: null,
            practice_context: {
                practiceStep: cleanPracticeStep(data.practiceStep),
            },
        }).then((attemptRow) => {

            // Queue a video upload if we have a recording
            if (attempt.videoRecording) {
                return data.databackend.uploadUserPerformanceVideo(
                    attempt.videoRecording,
                    attemptRow
                )
            }
            return attemptRow;
        })

        // // Concurrently, get feedback
        // const feedback = await getFeedback(
        //     attempt.performanceSummary ?? null,
        //     recordedTrack,
        //     attempt.attemptSettings,
        // );

        const performanceAttempt = await performanceAttemptPromise;
        
        const currentUrl = new URL(window.location.href);
        const url = 'review/' + performanceAttempt.id + '/';
        const fullUrl = currentUrl + url;
        console.log('Navigating to performance review page:', fullUrl);
        await goto(fullUrl);
        

        return  null;
    }

</script>

<div class="p-4 overflow-hidden">
    <PracticePage 
        bind:this={practicePage}
        backend={data.databackend}
        motionVideo={data.motionVideo}
        userLearningModel={data.userLearningModel}    
        practiceStep={data.practiceStep}
        practicePlan={$practicePlan}
        pageActive={true}
        progressBarProps={progressBarProps}
        on:nextClicked={onNextClicked}
        continueBtnTitle={nextStep ? nextStep.title : "Finish"}
        continueBtnIcon={nextStep ? "nextarrow" : "check"}

        {onPracticeAttemptCompleted}
    />
</div>

<style>
    div {
        height: var(--content_height);
        width: 100%;
        overflow: hidden;
    }
</style>