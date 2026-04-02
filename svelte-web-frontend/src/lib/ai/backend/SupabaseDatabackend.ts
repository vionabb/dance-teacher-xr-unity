import type { User, SupabaseClient } from '@supabase/supabase-js';
import type {
	IDataBackend,
	MotionVideo,
	MotionVideoSegmentation,
	UserLearningModel,
	UserLearningModelDb,
	UserPerformanceAttempt,
	UserPerformanceAttemptDb,
	UserPerformanceAttemptEvaluation,
	UserPerformanceAttemptSelfReport,
	UserPerformanceAttemptPracticeContext
} from './IDataBackend';
import type {
	ActivityProgress,
	PracticePlanProgress,
	StepProgressData
} from '$lib/data/activity-progress';
import type { Database, Json } from '$lib/ai/backend/SupabaseTypes';
import { getContext } from 'svelte';
import { get } from 'svelte/store';
import type { PracticePlan } from '$lib/model/PracticePlan';
import type { MotionSegmentation } from '$lib/data/dances-store';
import type { VideoRecording } from '../IPracticePage';

function toUserPerformanceAttempt(data: UserPerformanceAttemptDb): UserPerformanceAttempt {
	return {
		...data,
		evaluation: data.evaluation as unknown as UserPerformanceAttemptEvaluation,
		self_report: data.self_report as unknown as UserPerformanceAttemptSelfReport,
		practice_context: data.practice_context as unknown as UserPerformanceAttemptPracticeContext
	};
}

/**
 * Strip heavy / circular / non-serialisable fields from a PracticeStep object prior to persistence.
 * (Mirrors cleanPracticeStep used at call-sites so backend is resilient if caller forgets to clean.)
 * We intentionally drop: motionVideo, motionSegmentation, motionSegmentationNode, feedbackFunction, state
 */
function sanitizePracticeStep(step: any) {
	if (!step || typeof step !== 'object') return step;
	const {
		motionVideo,
		motionSegmentation,
		motionSegmentationNode,
		feedbackFunction,
		state,
		...rest
	} = step;
	return rest;
}

function sanitizePracticeContext(ctx: any): UserPerformanceAttemptPracticeContext | null {
	if (!ctx) return null as any;
	const cleaned: UserPerformanceAttemptPracticeContext = {
		...ctx,
		practiceStep: sanitizePracticeStep(ctx.practiceStep)
	};
	return cleaned;
}

class SupabaseDataBackend implements IDataBackend {
	constructor(
		private supabase: SupabaseClient<Database>,
		private userId: string | null
	) {}

	async getMotionVideos(): Promise<MotionVideo[]> {
		const { data, error } = await this.supabase.from('motion_video').select('*');
		if (error) {
			throw error;
		}
		return data || [];
	}

	async getMotionVideoById(id: number): Promise<MotionVideo | null> {
		const { data, error } = await this.supabase
			.from('motion_video')
			.select('*')
			.eq('id', id)
			.maybeSingle();
		if (error) {
			throw error;
		}
		return data || null;
	}

	async getMotionVideoSegmentations(videoId: number): Promise<MotionVideoSegmentation[]> {
		const { data, error } = await this.supabase
			.from('motion_video_segmentation')
			.select('*')
			.eq('video_id', videoId);
		if (error) {
			throw error;
		}
		if (!data) return [];

		// map data to replace 'data' field with 'segmentation' field
		const modifiedData = data.map((item) => {
			const { data, ...rest } = item;
			const segmentation = data as MotionSegmentation;
			segmentation.id = item.id; // ensure id is set on segmentation
			return { ...rest, segmentation };
		});
		return modifiedData;
	}

	async getMotionVideoSegmentationById(id: number): Promise<MotionVideoSegmentation | null> {
		const { data, error } = await this.supabase
			.from('motion_video_segmentation')
			.select('*')
			.eq('id', id)
			.maybeSingle();
		if (error) {
			throw error;
		}
		if (!data) return null;
		const { data: rawSegmentation, ...rest } = data;
		const segmentation = rawSegmentation as MotionSegmentation;
		segmentation.id = data.id; // ensure id is set on segmentation
		return { ...rest, segmentation };
	}

	async createUserLearningModel(
		data: Omit<UserLearningModel, 'id'> & { segmentation_id: number }
	): Promise<UserLearningModel> {
		// Cast plan and progress to unknown as Json for TypeScript
		const insertData = {
			...data,
			plan: data.plan as unknown as Json,
			progress: data.progress as unknown as Json,
			user_id: this.userId
		};
		const { data: insertedData, error } = await this.supabase
			.from('user_learning_model')
			.insert([insertData])
			.select('*')
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

	async getUserLearningModelBySegmentationId(
		segmentationId: number
	): Promise<UserLearningModel | null> {
		const { data, error } = await this.supabase
			.from('user_learning_model')
			.select('*')
			.eq('segmentation_id', segmentationId)
			.maybeSingle();
		if (error) {
			throw error;
		}
		if (!data) return null;
		// Return as UserLearningModel (plan/progress are already plain objects)
		return data as unknown as UserLearningModel;
	}

	async updateUserLearningModel(
		id: string | number,
		data: Partial<UserLearningModel>
	): Promise<void> {
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
			.from('user_learning_model')
			.update(updateData)
			.eq('id', String(id));
		if (error) {
			throw error;
		}
	}

	/** Save a new performance attempt and return its id */
	async createUserPerformanceAttempt(
		data: Omit<UserPerformanceAttempt, 'id' | 'user_id' | 'created_at'>
	): Promise<UserPerformanceAttempt> {
		if (!this.userId) {
			throw new Error('User not authenticated');
		}
		// Ensure practice_context is sanitized & JSON serialisable
		const sanitizedPracticeContext = sanitizePracticeContext(data.practice_context);
		const insertData = {
			...data,
			user_id: this.userId,
			evaluation: data.evaluation as unknown as Json,
			self_report: data.self_report as unknown as Json,
			practice_context: sanitizedPracticeContext as unknown as Json
		};
		const { data: insertedData, error } = await this.supabase
			.from('user_performance_attempt')
			.insert([insertData])
			.select('*')
			.single();
		if (error) {
			throw error;
		}
		return toUserPerformanceAttempt(insertedData);
	}

	async updateUserPerformanceAttempt(
		id: number,
		updates: Partial<
			Pick<UserPerformanceAttempt, 'self_report' | 'evaluation' | 'video_recording_storagepath'>
		>
	): Promise<UserPerformanceAttempt> {
		const { error, data } = await this.supabase
			.from('user_performance_attempt')
			.update(updates)
			.eq('id', id)
			.select('*')
			.single();
		if (error) {
			throw error;
		}
		return toUserPerformanceAttempt(data);
	}

	/** Retrieve a performance attempt by its id */
	async getUserPerformanceAttemptById(id: number): Promise<UserPerformanceAttempt | null> {
		const { data, error } = await this.supabase
			.from('user_performance_attempt')
			.select('*')
			.eq('id', id)
			.maybeSingle();
		if (error) {
			throw error;
		}
		if (!data) return null;

		return {
			...data,
			evaluation: data.evaluation as unknown as UserPerformanceAttemptEvaluation,
			self_report: data.self_report as unknown as UserPerformanceAttemptSelfReport,
			practice_context: data.practice_context as unknown as UserPerformanceAttemptPracticeContext
		};
	}

	async getUserPerformanceVideoUrl(videoStoragePath: string): Promise<string> {
		const videoLinkExpiryTimeSecs = 60 * 120; // 2 hours
		const { data, error } = await this.supabase.storage
			.from('userPerformanceVideos')
			.createSignedUrl(videoStoragePath, videoLinkExpiryTimeSecs);

		if (error) {
			throw error;
		}
		return data?.signedUrl || '';
	}

	/** Upload a user's performance video to the supabase bucket, updating the performance attempt record and returning the video storage path */
	async uploadUserPerformanceVideo(
		recording: VideoRecording,
		performanceAttempt: UserPerformanceAttempt
	): Promise<UserPerformanceAttempt> {
		const videoStoragePath = `userPerformanceVideos/${performanceAttempt.id}.mp4`;

		const fileEnding = recording.mimeType === 'video/webm' ? '.webm' : '.mp4';
		const file = new File([recording.blob], `${performanceAttempt.id}${fileEnding}`, {
			type: recording.mimeType
		});

		const { error } = await this.supabase.storage
			.from('userPerformanceVideos')
			.upload(videoStoragePath, file);

		if (error) {
			throw error;
		}

		await this.updateUserPerformanceAttempt(performanceAttempt.id, {
			video_recording_storagepath: videoStoragePath
		});

		return performanceAttempt;
	}

	//     await this.updateUserPerformanceAttempt(performanceAttempt.id, {
	//         video_recording_storagepath: videoStoragePath
	//     });

	//     return videoStoragePath;

	async uploadPerformanceVideo(file: File, destinationPath: string): Promise<string | undefined> {
		const { data, error } = await this.supabase.storage
			.from('userPerformanceVideos')
			.upload(destinationPath, file, {
				cacheControl: '3600',
				upsert: true,
				metadata: {
					owner: this.userId
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
