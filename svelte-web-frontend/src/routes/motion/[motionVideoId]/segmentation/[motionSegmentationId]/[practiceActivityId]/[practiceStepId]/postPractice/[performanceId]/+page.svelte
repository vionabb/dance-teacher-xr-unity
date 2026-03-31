<script lang="ts">
	import { goto } from '$app/navigation';
	import Jules2DPoseEvaluationMetric from '$lib/ai/motionmetrics/Jules2DPoseEvaluationMetric.js';
	import { GetTeachingAgent, type PostPracticeAttemptAction, type PostPracticeAttemptAction_Review, type PostPracticeAttemptSelfReportQuestion, buildDefaultNavigationAction } from '$lib/ai/TeachingAgent/TeachingAgent';
    import { navbarProps } from '$lib/elements/NavBar.svelte';
	import { getPracticeStepUrl } from '$lib/utils/appurls.js';
	import { waitSecs } from '$lib/utils/async.js';
    import { onMount } from 'svelte';
	import { get } from 'svelte/store';
	import { actions } from '../../../../../../../../account/+page.server.js';
    let { data } = $props();

    const teachingAgent = GetTeachingAgent();

    let displayText = $state(data.action.displayText ?? "Loading...");

    let { performanceAttempt, performanceVideoUrl, motionVideoId, motionSegmentationId } = data as typeof data & { motionVideoId: number, motionSegmentationId: number };

    let priorSelfReportSelection = data.performanceAttempt?.self_report?.selection as string | undefined;

    // Configure navbar back button to segmentation landing page
    onMount(() => {
        navbarProps.update(p => ({
            ...p,
            back: {
                url: `/motion/${motionVideoId}/segmentation/${motionSegmentationId}/`,
                title: 'Back'
            },
            pageTitle: 'Performance Review'
        }));

        $teachingAgent.decidePostPracticeAttemptAction({
            motionVideo: data.motionVideo,
            motionSegmentation: data.motionSegmentation,
            performanceAttempt,
            userLearningModel: data.userLearningModel,
            practiceActivity: data.practiceActivity,
            practiceStep: data.practiceStep
        }).then(action => {
            data.action = action;
            displayText = action?.displayText ?? "Great job!";
        }).catch(err => {
            console.error("Error deciding post-practice action:", err);
            displayText = "Great job!";
            data.action = buildDefaultNavigationAction({
                motionVideo: data.motionVideo,
                segmentation: data.motionSegmentation,
                userLearningModel: data.userLearningModel,
                currentPracticeActivityId: data.practiceActivity.id,
                currentPracticeStepId: data.practiceStep.id,
                priorPerformanceAttempt: performanceAttempt,
                requestingURL: new URL(window.location.href),
            });
        });
    });

    /** The teaching agent incorporates feedback from self-reports when deciding what to do.
     * Therefore, after a self-report is submitted (and therefore, the performanceAttempt object 
     * is updated), we need to recalculate the post-practice action. 
    */
    async function recalculateActionAfterSelfReport() {
        const nextAction = await $teachingAgent.decidePostPracticeAttemptAction({
            motionVideo: data.motionVideo,
            motionSegmentation: data.motionSegmentation,
            performanceAttempt,
            userLearningModel: data.userLearningModel,
            practiceActivity: data.practiceActivity,
            practiceStep: data.practiceStep
        });        
        data.action = nextAction;
    }

    async function handleSelfReport(e: SubmitEvent) {
        e.preventDefault();

        const target = e.target as HTMLFormElement;
        const prompt = target['prompt']?.value;
        const question_class = target['question_class']?.value;
        const selection = target['selection']?.value;

        // Get the human readable text label that was shown to the user
        const selectionLabel = (data.action as PostPracticeAttemptAction_Review).selfReports?.find(q => q.prompt === prompt)?.options.find(o => o.value === selection)?.label;
        
        if (!performanceAttempt) {
            console.error("No performance attempt to update with self-report");
            return;
        }

        const newAttemptObject = await data.databackend.updateUserPerformanceAttempt(data.performanceAttempt.id, {
          self_report: {
            prompt: prompt,
            question_class: question_class,
            selection: selection,
            selection_label: selectionLabel ?? selection,
          }
        });

        data.performanceAttempt = newAttemptObject;

        await recalculateActionAfterSelfReport();
    }

    async function executePostPracticeAction(action: PostPracticeAttemptAction) {
        if (action.action === 'immediateRepeat') {
            const practiceStepUrl = getPracticeStepUrl({
                motionVideoId: data.motionVideo.id,
                motionSegmentationId: data.motionSegmentation.id,
                practiceActivityId: data.practiceActivity.id,
                practiceStepId: data.practiceStep.id,
            });

            const displayTextBase = "Repeating this in ";
            displayText = `${displayTextBase}${action.delaySecs.toFixed(0)}`;

            let waitRemaining = action.delaySecs;
            while (waitRemaining > 0) {
                let waitInterval = Math.min(1, waitRemaining);
                await waitSecs(waitInterval);
                waitRemaining -= waitInterval;
                displayText = `${displayTextBase}${waitRemaining.toFixed(0)}`;
            }

            
            const currentConsecutiveAttemptNumber = data.performanceAttempt?.consecutive_attempt_number ?? 0;
            const nextConsecutiveAttemptNumber = currentConsecutiveAttemptNumber + 1;
            practiceStepUrl.searchParams.set('consecutiveAttemptNumber', nextConsecutiveAttemptNumber.toString());
            practiceStepUrl.searchParams.set('previousAttemptId', data.performanceAttempt.id);

            try {
                await goto(practiceStepUrl);
            } catch (error) {
                console.error("Error navigating to URL:", error);
                displayText = "Error navigating to practice step";
            }
        } else if (action.action === 'askNavigation') {
            // no need to do anything -- await user navigation decision
            return;
        } else if (action.action === 'reviewFeedback') {
            // no need to do anything -- await feedback self-reports
            return;
        }
    }

    $effect(() => {
        if (data.action) {
            console.log("Post practice action decided:", data.action);
            executePostPracticeAction(data.action)
                .catch(err => {
                    console.error("Error executing post-practice action:", err);
                });
        }
    })

</script>

<div class="p-4">
    <h2 class="text-2xl font-bold mb-4">{data.practiceActivity.id} {data.practiceStep.id}</h2>
    <p>{displayText}</p>
    {#if performanceVideoUrl}
    <!-- svelte-ignore a11y_media_has_caption -->
    <video controls src="{performanceVideoUrl}"></video>
    {/if}

    {#if priorSelfReportSelection}
        <p>Your previous feedback: <code>{priorSelfReportSelection}</code></p>
    {/if}

    {#if data.action?.action === "reviewFeedback" && data.action?.selfReports}
        {#each data.action.selfReports as report}
            <form onsubmit={handleSelfReport}>
                <input type="hidden" name="prompt" value={report.prompt} />
                <input type="hidden" name="question_class" value={report.question_class} />
                <p class="font-semibold">{report.prompt}</p>
                {#each report.options as option}
                    <div>
                        <label>
                            <input type="radio" name="selection" value={option.value} />
                            {option.label}
                        </label>
                    </div>
                {/each}
                <button type="submit" class="btn btn-primary mt-2">Submit Feedback</button>
            </form>
        {/each}
    {/if}

    {#if data.action?.action === 'askNavigation'}
        <ul>
        {#each data.action.navigationOptions as option}
           <li><a href={option.url.toString()}>{option.displayText}</a></li>
        {/each}
        </ul>
    {/if}

    <pre>
        {JSON.stringify(data.action, null, 2)}
    </pre>
</div>