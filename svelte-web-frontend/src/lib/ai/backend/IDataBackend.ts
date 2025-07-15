import type { PracticePlanProgress } from "$lib/data/activity-progress";

export interface IDataBackend {

    GetPracticePlanProgress(
        danceId: string,
        planId: string,
    ): Promise<PracticePlanProgress | undefined>;
}