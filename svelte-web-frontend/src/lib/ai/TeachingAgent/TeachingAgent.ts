import { type MotionSegmentation, type MotionSegmentationNode, getAllLeafNodes } from '../../data/dances-store'
import type PracticeStep from '$lib/model/PracticeStep';
import type { PracticeStepModeKey } from '$lib/model/PracticeStep';
import type { CheckpointActivity, DrillActivity, FinaleActivity, PracticePlan, PracticePlanActivity, SegmentActivity } from '$lib/model/PracticePlan';
import { CreateMarkingStep } from './marking-step';
import { CreateDrillStep } from './drill-step';
import { CreateFulloutStep } from './fullout-step';
import { writable, type Writable, type Readable, derived, get, readable, readonly } from 'svelte/store';
import { type PracticePlanProgress, type StepProgressData } from '$lib/data/activity-progress';
import type { IDataBackend, MotionVideo, MotionVideoSegmentation, UserLearningModel } from '../backend/IDataBackend';
import { getContext } from 'svelte';

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
    node: MotionSegmentationNode,
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

function GeneratePracticePlan(
    danceTree: MotionSegmentation,
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

function isActivityComplete(activity: PracticePlanActivity, progress: PracticePlanProgress) {
    return activity.steps.reduce(
        (acc, step) => acc && (
            (progress?.[activity.id]?.[step.id]?.completed) ?? false), 
            true
    );
}

const PROGRESS_REFRESH_MIN_INTERVAL_SECS = 60 * 10; // 10 minutes

class TeachingAgent {
    private motionVideo: MotionVideo;
    private motionSegmentation: MotionVideoSegmentation;
    private dataBackend: IDataBackend;

    private userLearningModel: Writable<UserLearningModel>;
    public practicePlan: Readable<PracticePlan>;
    public progress: Readable<PracticePlanProgress>

    constructor(
        opts: {
            motionSegmentation: MotionVideoSegmentation, 
            motionVideo: MotionVideo, 
            dataBackend: IDataBackend,
            userLearningModel: UserLearningModel
        },
    ) {
        this.motionVideo = opts.motionVideo;
        this.motionSegmentation = opts.motionSegmentation;
        this.dataBackend = opts.dataBackend;

        this.userLearningModel = writable(opts.userLearningModel);
        this.practicePlan = derived(this.userLearningModel, ($model) => $model.plan);
        this.progress = derived(this.userLearningModel, ($model) => $model.progress);
    }

    nextIncompleteActivity(progress: PracticePlanProgress | undefined) {
        
        const plan = get(this.practicePlan);
        if (progress === undefined) {
            return plan.stages[0].activities[0];
        }

        const allActivities = plan.stages.flatMap(stage => stage.activities);
        const firstIncompleteActivity = allActivities.find(
            activity => !isActivityComplete(activity, progress!)
        );

        return firstIncompleteActivity;
    }

    async updateActivityStepProgress(progressModel: PracticePlanProgress, activityId: string, stepId: string, stepProgress: StepProgressData): Promise<PracticePlanProgress> {
        console.debug('TeachingAgent.ts Updating progress for activity', activityId, 'step:', stepId, 'stepProgress:', stepProgress);

        const curProgress = progressModel;

        // Update local progress synchronously
        const newProgress = { ...curProgress };
        newProgress[activityId] = newProgress[activityId] ?? {};
        newProgress[activityId][stepId] = stepProgress;

        this.userLearningModel.update(model => {
            return {
                ...model,
                progress: newProgress,
            }
        });

        // Save to backend asynchronously
        try {
            await this.dataBackend.updateUserLearningModel(
                get(this.userLearningModel).id,
                { progress: newProgress }
            );

        } catch (error) {
            console.error('TeachingAgent.ts Error saving practice step progress:', error);
            throw error;
        }
        return newProgress;
    }

    static generateNewUserLearningModel(
        motionVideo: MotionVideo,
        motionSegmentation: MotionVideoSegmentation,
    ): Omit<UserLearningModel, 'id' | 'created_at' | 'updated_at' | 'user_id'> {
        return {
            progress: {},
            plan: GeneratePracticePlan(motionSegmentation.segmentation),
            segmentation_id: motionSegmentation.id,
            video_id: motionVideo.id,
        }
    }
}

 export default TeachingAgent;

 /**
  * Gets the current TeachingAgent from the Svelte context.
  * Current page must be a child of a TeachingAgentProvider.
  * @returns 
  */
 export function GetTeachingAgent() {  
    const agent = getContext<Readable<TeachingAgent>>('teachingAgent');
    if (!agent) {
        throw new Error('TeachingAgent.ts TeachingAgent not found in context. Ensure you are within a TeachingAgentProvider.');
    }
    return agent;
 }