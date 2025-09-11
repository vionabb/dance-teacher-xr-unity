import type { User, SupabaseClient } from "@supabase/supabase-js";
import type { IDataBackend, MotionVideo, MotionVideoSegmentation, UserLearningModel, UserLearningModelDb, UserPerformanceAttempt, UserPerformanceAttemptEvaluation, UserPerformanceAttemptSelfReport } from "./IDataBackend";
import type { ActivityProgress, PracticePlanProgress, StepProgressData } from "$lib/data/activity-progress";
import { browser } from "$app/environment";
import type { Database, Json } from "$lib/ai/backend/SupabaseTypes";
import { getContext } from "svelte";
import { get } from "svelte/store";
import type { PracticePlan } from "$lib/model/PracticePlan";
import type { MotionSegmentation } from "$lib/data/dances-store";

class SupabaseDataBackend implements IDataBackend {

    constructor(private supabase: SupabaseClient<Database>, private userId: string | null) { }

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
            return { ...rest, segmentation: data as MotionSegmentation };
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
        return { ...rest, segmentation: rawSegmentation as MotionSegmentation };
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
        }
        if (data.progress !== undefined) {
            updateData.progress = data.progress as unknown as Json;
        }

        // drop user_id if present to avoid accidental changes
        delete updateData.user_id;

        const { error } = await this.supabase
            .from("user_learning_model")
            .update(updateData)
            .eq("id", String(id));
        if (error) {
            throw error;
        }
    }

    /** Save a new performance attempt and return its id */
    async createUserPerformanceAttempt(data: Omit<UserPerformanceAttempt, 'id' | 'user_id' | 'created_at'>): Promise<UserPerformanceAttempt> {
        if (!this.userId) {
            throw new Error("User not authenticated");
        }
        const insertData = {
            ...data,
            user_id: this.userId,
            evaluation: data.evaluation as unknown as Json,
            self_report: data.self_report as unknown as Json,
        };
        const { data: insertedData, error } = await this.supabase
            .from("user_performance_attempt")
            .insert([insertData])
            .select("*")
            .single();
        if (error) {
            throw error;
        }
        return {
            ...insertedData,
            evaluation: insertedData.evaluation as unknown as UserPerformanceAttemptEvaluation,
            self_report: insertedData.self_report as unknown as UserPerformanceAttemptSelfReport
        };
    }

    async updateUserPerformanceAttemptVideoUrl(id: number, url: string): Promise<void> {
        const { error } = await this.supabase
            .from("user_performance_attempt")
            .update({ video_recording_url: url })
            .eq("id", id);
        if (error) {
            throw error;
        }
    }

    /** Retrieve a performance attempt by its id */
    async getUserPerformanceAttemptById(id: number): Promise<UserPerformanceAttempt | null> {
        const { data, error } = await this.supabase
            .from("user_performance_attempt")
            .select("*")
            .eq("id", id)
            .maybeSingle();
        if (error) {
            throw error;
        }
        if (!data) return null;
        return {
            ...data,
            evaluation: data.evaluation as unknown as UserPerformanceAttemptEvaluation,
            self_report: data.self_report as unknown as UserPerformanceAttemptSelfReport,
        };
    }

    async getPerformanceVideo(videoPath: string): Promise<string> {
        const videoLinkExpiryTimeSecs = 60 * 120; // 2 hours
        const { data, error } = await this.supabase
            .storage
            .from('userPerformanceVideos')
            .createSignedUrl(videoPath, videoLinkExpiryTimeSecs);

        if (error) {
            throw error;
        }
        return data?.signedUrl || '';
    }

    async uploadPerformanceVideo(file: File, destinationPath: string): Promise<string | undefined> {
        const { data, error } = await this.supabase
            .storage
            .from('userPerformanceVideos')
            .upload(destinationPath, file, {
                cacheControl: '3600',
                upsert: true,
                metadata: {
                    owner: this.userId,
                }
            });
        if (error) {
            throw error;
        }
        return data?.path;
    }
}

export default SupabaseDataBackend;
// ...existing code...
