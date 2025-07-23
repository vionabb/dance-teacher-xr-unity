import { browser } from "$app/environment";
import type { PracticePlanProgress, StepProgressData } from "$lib/data/activity-progress";
import type { IDataBackend } from "./IDataBackend";

class LocalStorageBackend implements IDataBackend {
    constructor() {}

    async SaveActivityStepProgress(danceId: string, practicePlanId: string, activityId: string, stepId: string, progress: StepProgressData): Promise<void> {
        if (!browser) return;
        const key = `progress_${danceId}_${practicePlanId}_${activityId}_${stepId}`;
        try {
            const progressString = JSON.stringify(progress);
            localStorage.setItem(key, progressString);
            console.log("Saved progress to localStorage for:", key, progress);
        } catch (error) {
            console.error("Error saving progress to localStorage:", error);
        }
    }
    async GetPracticePlanProgress(danceId: string, planId: string): Promise<PracticePlanProgress | {}> {
        if (!browser) return {};
        // Aggregate all progress entries for keys formatted as:
        // "progress_${danceId}_${planId}_${activityId}_${stepId}"
        const baseKey = `progress_${danceId}_${planId}_`;
        const practicePlanProgress: PracticePlanProgress = {};

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(baseKey)) {
                const parts = key.split('_');
                // Expected parts: ["progress", danceId, planId, activityId, stepId]
                if (parts.length >= 5) {
                    const activityId = parts[3];
                    const stepId = parts[4];
                    const progressString = localStorage.getItem(key);
                    if (progressString !== null) {
                        try {
                            const progress: StepProgressData = JSON.parse(progressString);
                            if (!practicePlanProgress[activityId]) {
                                practicePlanProgress[activityId] = {};
                            }
                            practicePlanProgress[activityId][stepId] = progress;
                        } catch (error) {
                            console.error("Error parsing progress data for key:", key, error);
                        }
                    }
                }
            }
        }
        return practicePlanProgress;
    }
}
export default LocalStorageBackend;
