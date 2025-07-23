import type { User, SupabaseClient } from "@supabase/supabase-js";
import type { IDataBackend } from "./IDataBackend";
import type { ActivityProgress, PracticePlanProgress, StepProgressData } from "$lib/data/activity-progress";
import { browser } from "$app/environment";
import type { Database, Json } from "$lib/ai/backend/SupabaseTypes";
import { getContext } from "svelte";
import { get } from "svelte/store";

// for table learningstepprogress
// type LearningStepProgress = {
//     activity_id: string; 
//     dance_id: string;
//     id: number;
//     practiceplan_id: string;
//     state: Json;
//     step_id: string; timestamp: string;
//     user_id: string | null;
// };

class SupabaseDataBackend implements IDataBackend {
    
    constructor(private supabase: SupabaseClient<Database>, private userId: string | null) {}

    async GetPracticePlanProgress(danceId: string, planId: string): Promise<PracticePlanProgress | undefined> {

        const matchingRows = await this.supabase.from('learningstepprogress').select(
            'id, timestamp, dance_id, practiceplan_id, activity_id, step_id, state, user_id',
        ).eq('dance_id', danceId)
        .eq('practiceplan_id', planId)

        if (matchingRows.error) {
            console.error('Error fetching practice plan progress:', matchingRows.error);
            return undefined;
        }

        const progress: PracticePlanProgress = {};
        if (!matchingRows.data || matchingRows.data.length === 0) {
            console.log('No progress data found for danceId:', danceId, 'and planId:', planId);
            return progress; // Return empty progress if no data found
        }

        for (const row of matchingRows.data) {
            const activityProgress: ActivityProgress = progress[row.activity_id] || {};
            const state = row.state as { completed?: boolean; started?: boolean } | null;
            const stepProgress: StepProgressData = {
                completed: state?.completed ?? false,
                started: state?.started ?? true,
            };

            activityProgress[row.step_id] = stepProgress;
            progress[row.activity_id] = activityProgress;
        }
        return progress;
    }

    async SaveActivityStepProgress(
        danceId: string,
        practicePlanId: string,
        activityId: string,
        stepId: string,
        progress: StepProgressData,
    ): Promise<void> {

        type InsertType = Database["public"]["Tables"]["learningstepprogress"]["Insert"];

        if (!this.userId) {
            throw new Error("User ID is not set. Cannot save progress without a user ID.");
        }
        
        const row: InsertType = {
            dance_id: danceId,
            practiceplan_id: practicePlanId,
            activity_id: activityId,
            step_id: stepId,
            state: {
                completed: progress.completed,
                started: progress.started,
            } as Json,
            user_id: this.userId,
            timestamp: new Date().toISOString(), // Use current timestamp
        };

        const { error } = await this.supabase
            .from("learningstepprogress")
            .upsert(row as InsertType);

        if (error) {
            console.error("Error saving practice step progress:", error);
        }
    }
}
export default SupabaseDataBackend;
