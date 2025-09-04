import type { User, SupabaseClient } from "@supabase/supabase-js";
import type { IDataBackend } from "./IDataBackend";
import type { ActivityProgress, PracticePlanProgress, StepProgressData } from "$lib/data/activity-progress";
import { browser } from "$app/environment";
import type { Database, Json } from "$lib/ai/backend/SupabaseTypes";
import { getContext } from "svelte";
import { get } from "svelte/store";
import type { PracticePlan } from "$lib/model/PracticePlan";

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

    async GetPracticePlan(args: { practice_plan_id: string; } | { user_id?: string; demo_video_id?: number; segmentation_id?: number; }): Promise<PracticePlan | undefined> {
        // TODO: this is AI generated, please review and test

        let query = this.supabase.from("motion_userstate").select("*");
        if ("practice_plan_id" in args) {
            query = query.eq("id", args.practice_plan_id);
        } else {
            if (args.user_id) {
                query = query.eq("user_id", args.user_id);
            }
            if (args.demo_video_id) {
                query = query.eq("demo_video_id", args.demo_video_id);
            }
            if (args.segmentation_id) {
                query = query.eq("segmentation_id", args.segmentation_id);
            }
        }
        const { data, error } = await query;
        if (error) {
            console.error("Error fetching practice plan:", error);
            return undefined;
        }
        if (!data || (Array.isArray(data) && data.length === 0)) {
            console.log("No practice plan found with the given criteria.");
            return undefined;
        }
        // Return first plan if multiple results are present.
        if (!Array.isArray(data)) {
            throw new Error("Unexpected data format received from Supabase.");
        }
        if (data.length === 0) {
            return undefined;
        }

        // Sort by updated_at descending to get the most recent plan
        data.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        const newestRow = data[0];
        const newestPlan = newestRow.plan as unknown as PracticePlan;

        return newestPlan;
    }

    async SavePracticePlan(args: { id?: string; user_id: string; demo_video_id: number; segmentation_id: number; plan: PracticePlan; }): Promise<void> {
        // Prepare the row for upsert. We assume the table "practiceplans" has columns that match these keys.
        const row = {
            id: args.id, // optional; if provided, upsert will update the record.
            user_id: args.user_id,
            demo_video_id: args.demo_video_id,
            segmentation_id: args.segmentation_id,
            plan: args.plan as unknown as Json,
            updated_at: new Date().toISOString(), // optional timestamp field
        };

        const { error } = await this.supabase
            .from("motion_userstate")
            .upsert(row, {});
            
        if (error) {
            console.error("Error saving practice plan:", error);
        }
    }

    GetPracticePlanProgress(danceId: string, planId: string): Promise<PracticePlanProgress | undefined> {
        // existing implementation ...
        throw new Error("Method not implemented in selection");
    }

    SaveActivityStepProgress(
        danceId: string,
        practicePlanId: string,
        activityId: string,
        stepId: string,
        progress: StepProgressData,
    ): Promise<void> {
        // existing implementation ...
        throw new Error("Method not implemented in selection");
    }


    // async GetPracticePlanProgress(danceId: string, planId: string): Promise<PracticePlanProgress | undefined> {

    //     const matchingRows = await this.supabase.from('learningstepprogress').select(
    //         'id, timestamp, dance_id, practiceplan_id, activity_id, step_id, state, user_id',
    //     ).eq('dance_id', danceId)
    //     .eq('practiceplan_id', planId)

    //     if (matchingRows.error) {
    //         console.error('Error fetching practice plan progress:', matchingRows.error);
    //         return undefined;
    //     }

    //     const progress: PracticePlanProgress = {};
    //     if (!matchingRows.data || matchingRows.data.length === 0) {
    //         console.log('No progress data found for danceId:', danceId, 'and planId:', planId);
    //         return progress; // Return empty progress if no data found
    //     }

    //     for (const row of matchingRows.data) {
    //         const activityProgress: ActivityProgress = progress[row.activity_id] || {};
    //         const state = row.state as { completed?: boolean; started?: boolean } | null;
    //         const stepProgress: StepProgressData = {
    //             completed: state?.completed ?? false,
    //             started: state?.started ?? true,
    //         };

    //         activityProgress[row.step_id] = stepProgress;
    //         progress[row.activity_id] = activityProgress;
    //     }
    //     return progress;
    // }

    // async SaveActivityStepProgress(
    //     danceId: string,
    //     practicePlanId: string,
    //     activityId: string,
    //     stepId: string,
    //     progress: StepProgressData,
    // ): Promise<void> {

    //     type InsertType = Database["public"]["Tables"]["learningstepprogress"]["Insert"];

    //     if (!this.userId) {
    //         throw new Error("User ID is not set. Cannot save progress without a user ID.");
    //     }
        
    //     const row: InsertType = {
    //         dance_id: danceId,
    //         practiceplan_id: practicePlanId,
    //         activity_id: activityId,
    //         step_id: stepId,
    //         state: {
    //             completed: progress.completed,
    //             started: progress.started,
    //         } as Json,
    //         user_id: this.userId,
    //         timestamp: new Date().toISOString(), // Use current timestamp
    //     };

    //     const { error } = await this.supabase
    //         .from("learningstepprogress")
    //         .upsert(row as InsertType);

    //     if (error) {
    //         console.error("Error saving practice step progress:", error);
    //     }
    // }
}
export default SupabaseDataBackend;
