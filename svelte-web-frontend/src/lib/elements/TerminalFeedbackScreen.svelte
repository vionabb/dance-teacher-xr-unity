<script lang="ts">
    import { run } from 'svelte/legacy';

// TerminalFeedbackDialog.svelte
//
// A component for offering feedback after a user has completed a
// practice attempt of a dance. 
import type { FrontendPerformanceSummary } from '$lib/ai/FrontendDanceEvaluator.ts';
import type { TerminalFeedback } from '$lib/model/TerminalFeedback';
import type { BodyPartHighlight } from '$lib/elements/StaticSkeletonVisual.svelte';
import StaticSkeletonVisual from '$lib/elements/StaticSkeletonVisual.svelte';
import { createEventDispatcher, onMount, tick } from 'svelte';
import { debugMode } from '$lib/model/settings';
import { replaceJSONForStringifyDisplay } from '$lib/utils/formatting';
import Dialog from './Dialog.svelte';
import ProgressEllipses from './ProgressEllipses.svelte';
import SpeechInterface from './SpeechInterface.svelte';
import PerformanceReviewPage from '$lib/pages/PerformanceReviewPage.svelte';

import InfoIcon from 'virtual:icons/mdi/information';
import StarIcon from 'virtual:icons/mdi/star';

    const dispatch = createEventDispatcher();

    interface Props {
        feedback?: TerminalFeedback | null;
        performanceSummary?: FrontendPerformanceSummary | undefined;
    }

    let { feedback = null, performanceSummary = undefined }: Props = $props();

    let showingPerformanceSummary = $state(false);
    let showingLLMOutput = $state(false);
    let showingTerminalFeedbackJson = $state(false);

    let performanceSummaryWithoutTrack = $derived.by(() => {
        if (!performanceSummary) {
            return undefined;
        }
        return {
            ...performanceSummary,
            adjustedTrack: undefined,
        }
    });

    let skeletonHighlights: BodyPartHighlight[] = $derived.by(() => {
        const incorrectHighlights  = (feedback?.incorrectBodyPartsToHighlight ?? []).map((bodyPart) => {
            return { bodyPart, outlineColor: "#F00" }
        })
        const correctHighlights = (feedback?.correctBodyPartsToHighlight ?? []).map((bodyPart) => {
            return { bodyPart, outlineColor: "#0F0" }
        })
        return [...incorrectHighlights, ...correctHighlights];
    });


    function promptDownload(objUrl: string, filename: string) {
        const link = document.createElement('a');
        link.href = objUrl;
        link.download = filename;
        link.click();
    }

    function getTrackDataUrl(track: any, description: string) {
        let trackDictionary = track.asDictWithoutTimeSeriesResults();
        trackDictionary = {
            ...trackDictionary,
            trackDescription: description,
        }
        const trackJson = JSON.stringify(trackDictionary, replaceJSONForStringifyDisplay);
        const blob = new Blob([trackJson], {type: "application/json"});
        return URL.createObjectURL(blob);
    }

// function exportRecordings() {

//     const track = feedback?.debug?.recordedTrack;
//     if (!track) {
//         console.error("No track to export");
//         return;
//     }

//     const trackDescription = prompt('Please describe this track');
//     if (!trackDescription?.length){
//         return;
//     }

//     const filenameRoot = `${trackDescription}.${track?.danceRelativeStem}`.replace(/[^a-z0-9.]/gi, '_').toLowerCase();
//     const url = getTrackDataUrl(track, trackDescription);
//     promptDownload(url, `${filenameRoot}.track.json`)

//     const adjustedTrack = (feedback?.debug?.performanceSummary as any)?.adjustedTrack;
//     if (adjustedTrack) {
//         const url = getTrackDataUrl(adjustedTrack, trackDescription + "-adjusted");
//         promptDownload(url, `${filenameRoot}.adjustedtrack.json`);
//     }

//     const webcamRecording = feedback?.videoRecording?.url;
//     if (webcamRecording) {
//         let extension = 'webm';
//         if (feedback?.videoRecording?.mimeType == 'video/mp4' || webcamRecording.endsWith('.mp4')) {
//             extension = 'mp4';
//         }
//         promptDownload(webcamRecording, `${filenameRoot}.userrecording.${extension}`);
//     }
// }

</script>

<div class="feedbackForm text-xl">
    
    {#if !feedback}<h2>Thinking<ProgressEllipses /></h2>{/if}
    
    {#each feedback?.achievements ?? [] as achivement, i}
        <p class="achievement animate pop"><StarIcon /><span>{achivement}</span></p>
    {/each}

    
    {#if feedback?.paragraphs}
    <div class="paragraphs">
        <SpeechInterface textToSpeak={[
            ...(feedback?.paragraphs ?? []).map(x => x?.trim()),
            ...(feedback.incorrectBodyPartsToHighlight ?? []).map(x => `Try focusing on your ${x} next time.`)
        ].join("\n\n")}/>
    </div>
    {/if}
    
    {#if feedback?.score}
        <p><code>Accuracy Score: {feedback.score.achieved.toFixed(2)} / {feedback.score.maximumPossible.toFixed(2)}</code></p>
    {/if}

    {#if skeletonHighlights.length > 0}
    <div class="skeleton">
        <StaticSkeletonVisual 
            highlights={skeletonHighlights}
        />
    </div>
    {/if}
    
    {#if $debugMode}
        <div class="debug buttons">
            <!-- {#if performanceSummaryWithoutTrack}
            <button class="daisy-btn daisy-btn-small" onclick={() => showingPerformanceSummary = true}>
                View Performance Summary
            </button>
            <Dialog open={showingPerformanceSummary}
              on:dialog-closed={() => showingPerformanceSummary = false}>
                {#snippet title()}
                    <span >Performance Summary</span>
                {/snippet}
                <pre>{JSON.stringify(performanceSummaryWithoutTrack, replaceJSONForStringifyDisplay, 2)}</pre>
            </Dialog>
            {:else if $debugMode}
            <p class="text-gray-500">(No performance summary available)</p>
            {/if} -->
            
            {#if feedback?.debug?.llmOutput || feedback?.debug?.llmInput}
            <button class="daisy-btn daisy-btn-small" onclick={() => showingLLMOutput = true}>View LLM Output</button>
            <Dialog open={showingLLMOutput}
                on:dialog-closed={() => showingLLMOutput = false}>
                {#snippet title()}
                    <span >LLM Data</span>
                {/snippet}
                {#if feedback?.debug?.llmInput}
                    <h3>Input</h3>
                    <pre>{JSON.stringify(feedback?.debug?.llmInput, undefined, 2)}</pre>
                {/if}
                {#if feedback?.debug?.llmOutput}
                    <h3>Output</h3>
                    <pre>{JSON.stringify(feedback?.debug?.llmOutput, undefined, 2)}</pre>
                {/if}
            </Dialog>
            {/if}
            {#if feedback}
            <button class="daisy-btn daisy-btn-small" onclick={() => showingTerminalFeedbackJson = true}>View Terminal Feedback</button>
            <Dialog open={showingTerminalFeedbackJson}
                on:dialog-closed={() => showingTerminalFeedbackJson = false}>
                {#snippet title()}
                    <span >TerminalFeedback JSON</span>
                {/snippet}
                <pre>{JSON.stringify(feedback, undefined, 2)}</pre>
            </Dialog>
            {/if}
            <!-- {#if feedback?.debug?.recordedTrack || feedback?.videoRecording}
            <button class="daisy-btn" on:click={exportRecordings}>
                Export Recorded Track
            </button>
            {/if} -->
        </div>
    {/if}
</div>


<style lang="scss">
.feedbackForm {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    max-height: calc(var(--content_height) - 2rem);
    max-width: 100%;
    flex-shrink: 1;
    flex-grow: 1;
    gap: 0.5rem;
    // overflow: scroll;
    // font-size: 1.5rem;

    & p,h2,.paragraphs {
        max-width: 70ch;
    }
}

.skeleton {
    // min-height: 0;
    width: 100%;
    // flex-grow: 1;
    flex-shrink: 1;
    max-height: 400px;
    text-align: center;
    padding: 1rem;
    flex-basis: auto;
    overflow: hidden;
}
h2, p {
    margin : 0;
}

h2 {
    margin-top: 1rem;
    font-weight: 600;
    font-size: 1.5em;
}
p {
    margin-top: 1rem;
}

.achievement {
    // color: var(--color-theme-1);
    background-color: #EEF;
    padding: 0.5em 1em;
    border-radius: 1em;
    margin-bottom: 1rem;
    display: flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 1em;
}

pre {
    font-size: 0.7em;
}

.debug {
    font-size: 1rem;
}

pre {
    white-space: pre-wrap;
}

// .reviewPageWrapper {
//     width: 80vw;
//     height: calc(80vh - 2rem);
// }
</style>