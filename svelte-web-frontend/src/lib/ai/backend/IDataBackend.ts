import type { PracticePlanProgress, StepProgressData } from "$lib/data/activity-progress";
import type { PracticePlan } from "$lib/model/PracticePlan";

export interface IDataBackend {

    GetPracticePlanProgress(
        danceId: string,
        planId: string,
    ): Promise<PracticePlanProgress | undefined>;

    SaveActivityStepProgress(
        danceId: string,
        practicePlanId: string,
        activityId: string,
        stepId: string,
        progress: StepProgressData,
    ): Promise<void>;

    GetPracticePlan(args: {
        practice_plan_id: string,
    } | {
        user_id?: string,
        demo_video_id?: number,
        segmentation_id?: number
    }): Promise<PracticePlan | undefined>;

    SavePracticePlan(args: {
        id?: string,
        user_id: string,
        demo_video_id: number,
        segmentation_id: number,
        plan: PracticePlan,
    }): Promise<void>;
}