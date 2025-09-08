import type { PracticePlanProgress, StepProgressData } from "$lib/data/activity-progress";
import type { PracticePlan } from "$lib/model/PracticePlan";
import type { Database } from '$lib/ai/backend/SupabaseTypes';
import type { MotionSegmentation } from "$lib/data/dances-store";
/**
 * UserProgressModel represents a record of user progress for a specific video.
 * It stores both the practice plan and the associated progress.
 */

export type MotionVideo = Database['public']['Tables']['motion_video']['Row'];
export type MotionVideoSegmentationDb = Database['public']['Tables']['motion_video_segmentation']['Row'];
export type MotionVideoSegmentation = Omit<MotionVideoSegmentationDb, 'data'> & {
    segmentation: MotionSegmentation,
};
export type UserLearningModelDb = Database['public']['Tables']['user_learning_model']['Row'];
export type UserLearningModel = Omit<UserLearningModelDb, 'plan' | 'progress'> & {
    plan: PracticePlan;
    progress: PracticePlanProgress;
};

/** A service for CRUD operations on app data */
export interface IDataBackend {
    // no create for now, videos are created via the Supabase dashboard or other means

    /** Fetch all motion videos available in the database. */
    getMotionVideos(): Promise<MotionVideo[]>;
    getMotionVideoById(id: number): Promise<MotionVideo | null>;

    /** Fetch all segmentations for a particular video */
    getMotionVideoSegmentations(videoId: number): Promise<MotionVideoSegmentation[]>;
    getMotionVideoSegmentationById(id: number): Promise<MotionVideoSegmentation | null>;

    /** Create a new user learning model */
    createUserLearningModel(data: Omit<UserLearningModel, 'id' | 'created_at' | 'updated_at' | 'user_id'> & { segmentation_id: number }): Promise<UserLearningModel>;

    /**Get the most recent user learning model for a particular segmentation */
    getUserLearningModelBySegmentationId(segmentationId: number): Promise<UserLearningModel | null>;
    updateUserLearningModel(id: string | number, data: Partial<UserLearningModel>): Promise<void>;
}

// /** A backend for storing and manipulating user progress data */
// export interface IDataBackend {

//     getDataService(): IDataService;

//     getPracticePlanAndProgress(args: {
//         userId: string,
//         segmentationId: number
//     }): Promise<{ practicePlan: PracticePlan | null, progress: PracticePlanProgress | undefined }>;

//     SaveActivityStepProgress(
//         danceId: string,
//         practicePlanId: string,
//         activityId: string,
//         stepId: string,
//         progress: StepProgressData,
//     ): Promise<void>;

//     GetPracticePlan(args: {
//         practice_plan_id: string,
//     } | {
//         user_id?: string,
//         demo_video_id?: number,
//         segmentation_id?: number
//     }): Promise<PracticePlan | undefined>;

//     SavePracticePlan(args: {
//         id?: string,
//         user_id: string,
//         demo_video_id: number,
//         segmentation_id: number,
//         plan: PracticePlan,
//     }): Promise<void>;
// }