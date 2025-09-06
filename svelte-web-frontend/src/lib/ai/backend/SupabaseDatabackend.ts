import type { User, SupabaseClient } from "@supabase/supabase-js";
import type { IDataBackend, MotionVideo, MotionVideoSegmentation, UserLearningModel, UserLearningModelDb } from "./IDataBackend";
import type { ActivityProgress, PracticePlanProgress, StepProgressData } from "$lib/data/activity-progress";
import { browser } from "$app/environment";
import type { Database, Json } from "$lib/ai/backend/SupabaseTypes";
import { getContext } from "svelte";
import { get } from "svelte/store";
import type { PracticePlan } from "$lib/model/PracticePlan";
import type { DanceTree } from "$lib/data/dances-store";

class SupabaseDataBackend implements IDataBackend {
    
    constructor(private supabase: SupabaseClient<Database>, private userId: string | null) {}

    async getMotionVideos(): Promise<MotionVideo[]> {
        const { data, error } = await this.supabase
            .from("motion_video")
            .select("*");
        if (error) {
            throw error;
        }
        return data || [];
    }

    async getMotionVideoById(id: number): Promise<MotionVideo | null> {
        const { data, error } = await this.supabase
            .from("motion_video")
            .select("*")
            .eq("id", id)
            .maybeSingle();
        if (error) {
            throw error;
        }
        return data || null;
    }

    async getMotionVideoSegmentations(videoId: number): Promise<MotionVideoSegmentation[]> {
        const { data, error } = await this.supabase
            .from("motion_video_segmentation")
            .select("*")
            .eq("video_id", videoId);
        if (error) {
            throw error;
        }
        if (!data) return [];

        // map data to replace 'data' field with 'segmentation' field
        const modifiedData = data.map(item => {
            const { data, ...rest } = item;
            return { ...rest, segmentation: data as DanceTree };
        });
        return modifiedData;
    }

    async getMotionVideoSegmentationById(id: number): Promise<MotionVideoSegmentation | null> {
        const { data, error } = await this.supabase
            .from("motion_video_segmentation")
            .select("*")
            .eq("id", id)
            .maybeSingle();
        if (error) {
            throw error;
        }
        if (!data) return null;
        const { data: rawSegmentation, ...rest } = data;
        return { ...rest, segmentation: rawSegmentation as DanceTree };
    }

    async createUserLearningModel(data: Omit<UserLearningModel, "id"> & { segmentation_id: number; }): Promise<UserLearningModel> {
        // Cast plan and progress to unknown as Json for TypeScript
        const insertData = {
            ...data,
            plan: data.plan as unknown as Json,
            progress: data.progress as unknown as Json,
            user_id: this.userId
        };
        const { data: insertedData, error } = await this.supabase
            .from("user_learning_model")
            .insert([insertData])
            .select("*")
            .single();
        if (error) {
            throw error;
        }

        const returnedData = {
            ...insertedData,
            plan: insertedData.plan as unknown as PracticePlan,
            progress: insertedData.progress as unknown as PracticePlanProgress
        };
        return returnedData;
    }

    async getUserLearningModelBySegmentationId(segmentationId: number): Promise<UserLearningModel | null> {
        const { data, error } = await this.supabase
            .from("user_learning_model")
            .select("*")
            .eq("segmentation_id", segmentationId)
            .maybeSingle();
        if (error) {
            throw error;
        }
        if (!data) return null;
        // Return as UserLearningModel (plan/progress are already plain objects)
        return data as unknown as UserLearningModel;
    }

    async updateUserLearningModel(id: string | number, data: Partial<UserLearningModel>): Promise<void> {
        // Cast plan and progress to Json if present
        // Only send fields that match Supabase expectations
        const updateData: { [key: string]: any } = { ...data };
        if (data.plan !== undefined) {
            updateData.plan = data.plan as unknown as Json;
        } else {
            throw new Error("plan must be provided to update UserLearningModel");
        }
        if (data.progress !== undefined) {
            updateData.progress = data.progress as unknown as Json;
        } else {
            throw new Error("progress must be provided to update UserLearningModel");
        }

        // drop user_id if present to avoid accidental changes
        delete updateData.user_id;
        if (updateData.segmentation_id === undefined) {
            throw new Error("segmentation_id must be provided to update UserLearningModel");
        }

        const { error } = await this.supabase
            .from("user_learning_model")
            .update(updateData)
            .eq("id", String(id));
        if (error) {
            throw error;
        }
    }
}

export default SupabaseDataBackend;
// ...existing code...
