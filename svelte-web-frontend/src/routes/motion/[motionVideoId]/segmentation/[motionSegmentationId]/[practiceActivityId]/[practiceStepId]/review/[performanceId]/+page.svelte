<script lang="ts">
	import { goto } from '$app/navigation';
	import { GetTeachingAgent, type PostPracticeAttemptAction, buildDefaultNavigationAction } from '$lib/ai/TeachingAgent/TeachingAgent';
    import { navbarProps } from '$lib/elements/NavBar.svelte';
    import { onMount } from 'svelte';
    let { data } = $props();

    const teachingAgent = GetTeachingAgent();

    let displayText = $state('Thinking...')
    let postPracticeAction: PostPracticeAttemptAction | null = $state(null);

    let { performanceAttempt, performanceVideoUrl, motionVideoId, motionSegmentationId } = data as typeof data & { motionVideoId: number, motionSegmentationId: number };
    let hasUserSelfReport = $derived(
        performanceAttempt?.self_report && 
        typeof performanceAttempt.self_report === 'object'
        && Object.keys(performanceAttempt.self_report).length > 0
    );

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
            performanceAttempt,
            userLearningModel: data.userLearningModel,
            practiceActivity: data.practiceActivity,
            practiceStep: data.practiceStep
        }).then(action => {
            postPracticeAction = action;
            if (action?.displayText) {
                displayText = action.displayText;
            } else {
                displayText = "Great job!";
            }
        }).catch(err => {
            console.error("Error deciding post-practice action:", err);
            displayText = "Great job!";
            postPracticeAction = buildDefaultNavigationAction(data.userLearningModel);
        });
    });

    let difficultyRating = $state('')
    async function handleSelfReport(e: SubmitEvent) {
        e.preventDefault();
        // TODO: send `selfReport` to your endpoint, then refresh or update UI
        console.log('User self-report:', difficultyRating)

        if (!performanceAttempt) {
            console.error("No performance attempt to update with self-report");
            return;
        }

        const newAttemptObject = await data.databackend.updateUserPerformanceAttempt(data.performanceAttempt.id, {
          self_report: {
            rated_difficulty: difficultyRating,
          }
        });

        data.performanceAttempt = newAttemptObject;

        const nextActivity = $teachingAgent.nextIncompleteActivity(data.userLearningModel.progress);
        const nextIncompleteStep = nextActivity?.steps[0];
        const url = nextActivity && nextIncompleteStep ? 
            `/motion/${data.motionVideo.id}/segmentation/${data.motionSegmentation.id}/${nextActivity.id}/${nextIncompleteStep.id}` :
            `/motion/${data.motionVideo.id}/segmentation/${data.motionSegmentation.id}/`;
        await goto(url);
    }

    async function executePostPracticeAction(action: PostPracticeAttemptAction) {
        if (action.action === 'immediateRepeat') {
            return;
        } else if (action.action === 'askNavigation') {
            // no need to do anything -- await user navigation decision
            return;
        } else if (action.action === 'reviewFeedback') {
            // no need to do anything -- await feedback self-reports
            return;
        }
    }

    $effect(() => {
        if (postPracticeAction) {
            console.log("Post practice action decided:", postPracticeAction);
            executePostPracticeAction(postPracticeAction)
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

    {#if hasUserSelfReport}
    {:else}
    <form onsubmit={handleSelfReport} class="mt-4">
        <fieldset>
            <legend class="font-medium mb-2">How was that practice attempt?</legend>
            <label class="block">
                <input type="radio" bind:group={difficultyRating} value="too_easy" class="mr-2"/>
                Too easy
            </label>
            <label class="block">
                <input type="radio" bind:group={difficultyRating} value="about_right" class="mr-2"/>
                About right
            </label>
            <label class="block">
                <input type="radio" bind:group={difficultyRating} value="got_it" class="mr-2"/>
                Got it
            </label>
        </fieldset>
        <button type="submit" disabled={!difficultyRating} class="mt-3 px-4 py-2 bg-blue-600 text-white rounded">
            Submit
        </button>
    </form>
    {/if}

</div>