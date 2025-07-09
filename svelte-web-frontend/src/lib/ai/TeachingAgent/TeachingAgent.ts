import { makeDanceTreeSlug, type Dance, type DanceTree, type DanceTreeNode, getAllLeafNodes } from '../../data/dances-store'
import type PracticeStep from '$lib/model/PracticeStep';
import type { PracticeStepModeKey } from '$lib/model/PracticeStep';
import type { CheckpointActivity, DrillActivity, FinaleActivity, PracticePlan, SegmentActivity } from '$lib/model/PracticePlan';
import { CreateMarkingStep } from './marking-step';
import { CreateDrillStep } from './drill-step';
import { CreateFulloutStep } from './fullout-step';
import { readable } from 'svelte/store';

// export interface UserDancePerformanceLog {
//     // markingByNode: Map<DanceTreeNode["id"], number>;
//     // similarityByNode: Map<DanceTreeNode["id"], number>;
// }

function GenerateMarkDrillFulloutSteps(
    segmentDescription: string,
    startTime: number,
    endTime: number,
    parentActivityId: string,
) {
    const stepBase = {
        segmentDescription: segmentDescription,
        startTime: startTime,
        endTime: endTime,
    } satisfies Partial<PracticeStep>;

    const mark = CreateMarkingStep(segmentDescription, startTime, endTime)
    const drill = CreateDrillStep(segmentDescription, startTime, endTime)
    const fullOut = CreateFulloutStep(segmentDescription, startTime, endTime)

    const steps = [mark, drill, fullOut]
    steps.forEach((step) => { step.parentActivityId = parentActivityId; });
    return steps;
}

function GenerateStepsForSegment(
    node: DanceTreeNode,
    parentActivityId: string,
) {

    const steps = GenerateMarkDrillFulloutSteps(
        node.id,
        node.start_time,
        node.end_time,
        parentActivityId,
    );

    return steps;
}

function getSegementLabel(segmentIndex: number, segmentCountTotal: number) {

    // If there are enough letters in the alphabet to label each segment, use letters
    if (segmentCountTotal < 26) {
        const segmentLabel = String.fromCharCode(65 + segmentIndex); // Uppercase letter at the index of the alphabet
        return segmentLabel;
    }

    // Otherwise, use numbers
    return `${segmentIndex + 1}`;
}

function makeEnglishList(items: string[]) {
    if (items.length == 1) {
        return items[0];
    }
    if (items.length == 2) {
        return items.join(' and ');
    }
    return items.slice(0, items.length - 1).join(', ') + ', and ' + items[items.length - 1];
}

function makeCheckpointActivity(segmentActivities: SegmentActivity[]): CheckpointActivity {
    const segmentLabels = segmentActivities
        .map((segmentActivity) => segmentActivity.segmentTitle);

    const checkpointId = `checkpoint-${segmentLabels.join('-')}`;
    return {
        id: checkpointId,
        type: 'checkpoint',
        title: "Checkpoint (" + makeEnglishList(segmentLabels) + ')',
        steps: GenerateMarkDrillFulloutSteps(
            checkpointId,
            segmentActivities[0].steps[0].startTime,
            segmentActivities[segmentActivities.length - 1].steps[0].endTime,
            checkpointId
        ),
    }
}

function makeFinaleActivity(startTime: number, endTime: number): FinaleActivity {
    const activityId = 'finale';
    return {
        id: activityId,
        type: 'finale',
        title: 'Finale',
        steps: GenerateMarkDrillFulloutSteps(
            `finale-wholesong`,
            startTime,
            endTime,
            activityId
        )
    }
}

export function GeneratePracticePlan(
    dance: Dance,
    danceTree: DanceTree,
): PracticePlan {

    const CHECKPOINT_SEGMENT_COUNT = 3;

    const phraseNodes = getAllLeafNodes(
        danceTree.root,
        (node) => node.id.includes('phrase') && !node.id.includes('group'));

    const stages: PracticePlan['stages'] = [];
    let currentStage: PracticePlan['stages'][0] = {
        // type: '',
        activities: [],
    };
    let currentSegmentIndex = 0;
    phraseNodes.forEach((phraseNode, node_i) => {
        let remainingActivitiesCount = phraseNodes.length - node_i;

        if ((currentStage.activities.length >= CHECKPOINT_SEGMENT_COUNT && remainingActivitiesCount > 1)
            || currentStage.activities.length >= 2 && remainingActivitiesCount == 2) {


            currentStage.activities.push(makeCheckpointActivity(currentStage.activities as SegmentActivity[]));
            stages.push(currentStage);
            currentStage = {
                // type: '',
                activities: [],
            };
        }

        const segmentLabel = getSegementLabel(currentSegmentIndex, phraseNodes.length);
        const activityId = `learn-segment-${phraseNode.id}`;
        const segmentActivity: SegmentActivity = {
            id: activityId,
            type: 'segment',
            title: "Learn Segment " + segmentLabel,
            steps: GenerateStepsForSegment(phraseNode, activityId), // todo: mark > drill > full-out
            segmentTitle: segmentLabel,
            segmentIndex: currentSegmentIndex,
        };
        currentStage.activities.push(segmentActivity);
        currentSegmentIndex += 1;
    })
    currentStage.activities.push(makeCheckpointActivity(currentStage.activities as SegmentActivity[]));
    stages.push(currentStage);

    // Remove checkpoint activity if there is only 1 stage, as
    // the finale activity will serve as the checkpoint.
    if (stages.length == 1 
        && stages[0].activities.length > 0 &&
        stages[0].activities[stages[0].activities.length - 1].type == 'checkpoint') {
            stages[0].activities.pop();
    }

    stages.push({
        // type: '',
        activities: [
            // makeDrillActivity(danceTree.root.start_time, danceTree.root.end_time),
            makeFinaleActivity(danceTree.root.start_time, danceTree.root.end_time),
        ],
    });
    return {
        id: `practiceplan-${danceTree.tree_name.replaceAll(" ", "-")}`,
        startTime: danceTree.root.start_time,
        endTime: danceTree.root.end_time,
        stages: stages,
        demoSegmentation: {
            segmentBreaks: phraseNodes.slice(1).map((node) => node.start_time),
            segmentLabels: phraseNodes.map((node, index) => getSegementLabel(index, phraseNodes.length)),
        },
    }
}

export type GeneratePracticeStepOptions = {
    playbackSpeed: number,
    interfaceMode: PracticeStepModeKey,
    terminalFeedbackEnabled: boolean,
    showUserSkeleton: boolean,
};

export function GeneratePracticeStep(
    dance: Dance,
    danceTree: DanceTree,
    danceTreeNode: DanceTreeNode,
    opts: GeneratePracticeStepOptions
) {
    
    const danceTreeSlug =  makeDanceTreeSlug(danceTree);
    return {
        step: {
            id: 'legacystep',
            title: danceTreeNode.id,
            segmentDescription: danceTreeNode.id,
            startTime: danceTreeNode.start_time,
            endTime: danceTreeNode.end_time,
            interfaceMode: opts.interfaceMode,
            terminalFeedbackEnabled: opts.terminalFeedbackEnabled,
            showUserSkeleton: opts.showUserSkeleton,
            playbackSpeed: opts.playbackSpeed,
            dance: dance,
            danceTree: danceTree,
            danceTreeNode: danceTreeNode,
        } as PracticeStep,
        url: `/teachlesson/${danceTreeSlug}/practicenode/${danceTreeNode.id}?playbackSpeed=${opts.playbackSpeed}&interfaceMode=${opts.interfaceMode}&terminalFeedbackEnabled=${opts.terminalFeedbackEnabled}&showUserSkeleton=${opts.showUserSkeleton}`,
    }
}

// {
//     referenceVideo: {
//         visibility: 'visible',
//         skeleton: 'none',
//         userCanToggleOnOff: false,
//         skeletonColorCoding: false,
//     },
//     userVideo: {
//         visibility: 'visible',
//         skeleton: 'user',
//         userCanToggleOnOff: false,
//         skeletonColorCoding: true,
//     },
//     terminalFeedback: 'enabled',
// },

class TeachingAgent {
    
    private setPracticePlan: (practicePlan: PracticePlan | null) => void = () => { };
    practicePlan = readable(null as PracticePlan | null, (set) => {
        this.setPracticePlan = set;
    });

    constructor(private danceTree: DanceTree, private dance: Dance) {
        const initialPracticePlan = GeneratePracticePlan(dance, danceTree);
        this.setPracticePlan(initialPracticePlan);
    }



}

export default TeachingAgent;