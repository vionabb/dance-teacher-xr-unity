import type { PracticePlanProgress } from '$lib/data/activity-progress';
import type { PracticePlan } from '$lib/model/PracticePlan';
import type { Database } from '$lib/ai/backend/SupabaseTypes';
import type { MotionSegmentation } from '$lib/data/dances-store';
import type { VideoRecording } from '../IPracticePage';
import type PracticeStep from '$lib/model/PracticeStep';
/**
 * UserProgressModel represents a record of user progress for a specific video.
 * It stores both the practice plan and the associated progress.
 */

export type MotionVideo = Database['public']['Tables']['motion_video']['Row'];
export type MotionVideoSegmentationDb =
	Database['public']['Tables']['motion_video_segmentation']['Row'];
export type MotionVideoSegmentation = Omit<MotionVideoSegmentationDb, 'data'> & {
	segmentation: MotionSegmentation;
};
export type UserLearningModelDb = Database['public']['Tables']['user_learning_model']['Row'];
export type UserLearningModel = Omit<UserLearningModelDb, 'plan' | 'progress'> & {
	plan: PracticePlan;
	progress: PracticePlanProgress;
};

export type UserPerformanceAttemptDb =
	Database['public']['Tables']['user_performance_attempt']['Row'];
export type UserPerformanceAttemptEvaluation = Record<string, any>;
export type UserPerformanceAttemptSelfReport = Record<string, any>;
export type UserPerformanceAttemptPracticeContext = {
	consecutiveReptitions?: number;
	practiceStep: PracticeStep;
};
export type UserPerformanceAttempt = Omit<
	UserPerformanceAttemptDb,
	'self_report' | 'evaluation' | 'practice_context'
> & {
	evaluation: UserPerformanceAttemptEvaluation;
	self_report: UserPerformanceAttemptSelfReport;
	practice_context: UserPerformanceAttemptPracticeContext;
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
	createUserLearningModel(
		data: Omit<UserLearningModel, 'id' | 'created_at' | 'updated_at' | 'user_id'> & {
			segmentation_id: number;
		}
	): Promise<UserLearningModel>;

	/**Get the most recent user learning model for a particular segmentation */
	getUserLearningModelBySegmentationId(segmentationId: number): Promise<UserLearningModel | null>;
	updateUserLearningModel(id: string | number, data: Partial<UserLearningModel>): Promise<void>;

	/** Save a new performance attempt and return its id */
	createUserPerformanceAttempt(
		data: Omit<UserPerformanceAttempt, 'id' | 'user_id' | 'created_at' | 'video_recording_url'>
	): Promise<UserPerformanceAttempt>;
	/** Retrieve a performance attempt by its id */
	getUserPerformanceAttemptById(id: number): Promise<UserPerformanceAttempt | null>;
	/** Update the video storage path (within the `userPerformanceVideos` bucket)for a performance attempt */
	updateUserPerformanceAttempt(
		id: number,
		updates: Partial<
			Pick<UserPerformanceAttempt, 'video_recording_storagepath' | 'evaluation' | 'self_report'>
		>
	): Promise<UserPerformanceAttempt>;
	/** Get the signed URL for a user's performance video */
	getUserPerformanceVideoUrl(videoStoragePath: string): Promise<string>;

	/** Upload a user's performance video to the supabase bucket, updating the performance attempt record and returning the video storage path */
	uploadUserPerformanceVideo(
		recording: VideoRecording,
		performanceAttempt: UserPerformanceAttempt
	): Promise<UserPerformanceAttempt>;
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
