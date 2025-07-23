import type { PracticePlanProgress, StepProgressData } from "$lib/data/activity-progress";

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
}