import Papa, { type ParseResult } from 'papaparse';

import { PoseLandmarkKeysUpperSnakeCase, type Pose2DPixelLandmarks, type Pose3DLandmarkFrame } from '$lib/webcam/mediapipe-utils';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { MotionVideo } from '$lib/ai/backend/IDataBackend';

export type ValueOf<T> = T[keyof T];

export type MotionSegmentationNode = {
    id: string;
    start_time: number;
    end_time: number;
    alternate_ids: string[];
    children: MotionSegmentationNode[];
    metrics: Record<string, number>;
    events: Record<string, Record<string, any>[]>;
    complexity: number;
}

export type MotionSegmentation = {
    tree_name: string;
    generation_data: Record<string, unknown>;
    root: MotionSegmentationNode;
}

export function findSegmentationSubNode(node: MotionSegmentationNode, subNodeId: string | undefined): MotionSegmentationNode | null {
    if (!subNodeId) return null;
    
    for (const child of node.children) {
        if (child.id === subNodeId) {
            return child as unknown as MotionSegmentationNode;
        }
        const foundNode = findSegmentationSubNode(child as unknown as MotionSegmentationNode, subNodeId);
        if (foundNode) {
            return foundNode;
        }
    }
    return null;
}

export function findSegmentationNode(danceTree: MotionSegmentation, nodeId: string): MotionSegmentationNode | null {
    if (danceTree.root.id === nodeId) {
        return danceTree.root;
    }
    return findSegmentationSubNode(danceTree.root, nodeId);
}

export function getAllNodesInSubtree(node: MotionSegmentationNode): MotionSegmentationNode[] {
    return [
        node,
        ...node.children.flatMap((child) => getAllNodesInSubtree(child as unknown as MotionSegmentationNode))
    ];   
}

export type NodeBooleanFunction = (node: MotionSegmentationNode) => boolean;

export function getAllLeafNodes(node: MotionSegmentationNode, considerLeafCallback?: NodeBooleanFunction): MotionSegmentationNode[] {
    if (node.children.length === 0 || (considerLeafCallback && considerLeafCallback(node))) {
        return [node];
    }

    return [
        ...node.children.flatMap((child) => getAllLeafNodes(child as unknown as MotionSegmentationNode, considerLeafCallback))
    ];   
}

export function getAllNodes(node: MotionSegmentationNode): MotionSegmentationNode[] {
    return [
        node,
        ...node.children.flatMap((child) => getAllNodes(child as unknown as MotionSegmentationNode))
    ];   
}

export function getMotionVideoSrc(supabase: SupabaseClient, motionClipPath: string): string | undefined {
    if (!motionClipPath) {
        return undefined;
    }

    const { data } = supabase.storage
        .from('sourcevideos')
        .getPublicUrl(motionClipPath);

    return data.publicUrl;
}

export function getHolisticDataSrc(supabase: SupabaseClient, motionVideo: MotionVideo): undefined | string {
    if (!motionVideo?.landmarks_holistic_3d_src) {
        return undefined;
    }
    const { data } = supabase.storage
        .from('holisticdata')
        .getPublicUrl(motionVideo.landmarks_holistic_3d_src);
    return data.publicUrl;
}
export function get2DPoseDataSrc(supabase: SupabaseClient, motionVideo: MotionVideo): undefined | string {
    if (!motionVideo?.landmarks_pose_2d_src) {
        return undefined;
    }

    const { data } = supabase.storage
        .from('pose2ddata')
        .getPublicUrl(motionVideo.landmarks_pose_2d_src);
    return data.publicUrl;
}

export function getThumbnailUrl(supabase: SupabaseClient, thumbnailSrc: string | undefined): string | undefined {
    if (!thumbnailSrc) {
        return undefined;
    }

    const { data } = supabase.storage
        .from('thumbnails')
        .getPublicUrl(thumbnailSrc);

    return data.publicUrl;
}

/*
 * Constrain a value to a given range
 * @param val Value to constrain
 * @param min Minimum value
 * @param max Maximum value
 * @returns Constrained value
 */
function constrain(val: number, min: number, max: number) {
    return Math.min(Math.max(val, min), max);
}

/**
 * Reference data for a dance, in the form of an array of 2D pose landmarks for each frame of the dance.
 */
export class PoseReferenceData<T extends Pose2DPixelLandmarks | Pose3DLandmarkFrame> {
    
    /**
     * Create a new Pose2DReferenceData object
     * @param fps Frames per second of the reference data
     * @param frameIndices Frame indices of the reference data (as some frames may be missing)
     * @param poses 2D pose landmarks for each frame of the reference data
     */
    constructor(
        private fps: number, 
        private frameIndices: number[],
        public poses: T[]
    ) {
    }

    /**
     * Get the reference pose information for a given time in the dance.
     * @param timestamp Dance timestamp of the frame to get the pose for
     * @returns Pose information for the frame at the given timestamp, or null if no pose information is available for that frame
     */
    getReferencePoseAtTime(timestamp: number): T | null {

        const targetFrameIndex = Math.floor(timestamp * this.fps);

        // Starting at the estimated frame, search backward for the closest frame with pose information. 
        //   * We're making the assumption that the data may omit frames, but does not contain any duplicate frames. 
        //     Therefore, we can search backward from the estimated frame to find the closest frame with pose information.
        let searchIndex = constrain(targetFrameIndex, 0, this.frameIndices.length - 1);
        
        while(this.frameIndices[searchIndex] > targetFrameIndex && searchIndex > 0) {
            searchIndex--;
        }

        // const frameIndex = this.frameIndices[searchIndex];
        const pose = this.poses[searchIndex];

        return pose ?? null;
    }

/**
 * Retrieves 2D landmarks of a pose at specified timestamps.
 * @param {number[]} frameTimes - An array of timestamps indicating the moments when pose landmarks are needed.
 * @returns {Pose2DPixelLandmarks[]} - An array of 2D pixel landmarks corresponding to the specified timestamps.
 */
    get2DLandmarks(frameTimes: number[]): T[] {
        const poses: T[] = [];

        for (const timestamp of frameTimes) {
            const pose = this.getReferencePoseAtTime(timestamp);
            if (pose !== null) {
                poses.push(pose);
            }
        }

        return poses;
    }
}

export async function loadPoseInformation<T extends Pose2DPixelLandmarks | Pose3DLandmarkFrame>(csvpath: string, fps: number, useFetch: boolean, rowToPose: (row: Record<string, number>) => T | null) {
    let text: string = "";
    if (!useFetch) {
        // use nodefs/promises in tests
        const fs = require('fs').promises;
        text = await fs.readFile(csvpath, 'utf-8');        
    } else {
        const response = await fetch(csvpath);
        text = await response.text();
    }
    
    const data: ParseResult<Record<string, never>> = await new Promise((res, rej) => {       
        Papa.parse(text, {
            header: true,
            worker: true,
            // download: true,
            dynamicTyping: true,
            complete: res,
            error: rej,
        })
    });

    // convert to array of pose information
    return new PoseReferenceData(
        fps, 
        data.data.map((row) => +row[`frame`]), 
        data.data.map((row) => rowToPose(row))
                        .filter((pose) => pose !== null) as T[]
    )
}

/**
 * Get the 2d pose information for a motion video. It downloads a CSV file with the pose2d data, then converts
 * the data into a 2d pixel landmark format
 * @param supabase Supabase client
 * @param motionVideo The video to load the pose information for
 * @returns The pose information for the video
 */
export async function load2DPoseInformation(supabase: SupabaseClient, motionVideo: MotionVideo): Promise<PoseReferenceData<Pose2DPixelLandmarks>> {
    const pose2dCsvPath = get2DPoseDataSrc(supabase, motionVideo);
    if (!pose2dCsvPath) {
        throw new Error("No 2D pose data source available for motionVideo id " + motionVideo.id);
    }
    const useFetch = true; // use fetch, as we're in the browser
    const poseInfo = await loadPoseInformation(pose2dCsvPath, motionVideo.fps, useFetch, GetPixelLandmarksFromPose2DRow);
    return poseInfo;
}

/**
 * Get the 3d pose information for a motion video. It downloads a CSV file with the holistic data, then converts
 * the data into the 3d landmark format that mediapipe uses (but with the added visiblity component that as
 * of 2023-09-18 is only present in the python solution).
 * @param supabase Supabase client
 * @param motionVideo The video to load the pose information for
 * @returns The pose information for the video.
 */
export async function load3DPoseInformation(supabase: SupabaseClient, motionVideo: MotionVideo): Promise<PoseReferenceData<Pose3DLandmarkFrame>> {
    const pose3dCsvPath = getHolisticDataSrc(supabase, motionVideo);
    if (!pose3dCsvPath) {
        throw new Error("No 3D pose data source available for motionVideo id " + motionVideo.id);
    }
    const useFetch = true; // use fetch, as we're in the browser
    return await loadPoseInformation(pose3dCsvPath, motionVideo.fps, useFetch, GetPixelLandmarksFromPose3DRow) as PoseReferenceData<Pose3DLandmarkFrame>;
}

export function GetPixelLandmarksFromPose2DRow(pose2drow: Record<string, number>) : Pose2DPixelLandmarks | null {
    if (!pose2drow) return null;

    return PoseLandmarkKeysUpperSnakeCase.map((key) => {
        return {
            x: pose2drow[`${key}_x`],
            y: pose2drow[`${key}_y`],
            dist_from_camera: pose2drow[`${key}_distance`],
            visibility: pose2drow[`${key}_vis`]
        }
    });
}

export function GetPixelLandmarksFromPose3DRow(pose3drow: Record<string, number>): Pose3DLandmarkFrame | null {
    if (!pose3drow) return null;
    
    return PoseLandmarkKeysUpperSnakeCase.map((key) => {
        return {
            x: pose3drow[`${key}_x`],
            y: pose3drow[`${key}_y`],
            z: pose3drow[`${key}_z`],
            visibility: pose3drow[`${key}_vis`]
        }
    });
}
