import type { SvelteComponent } from "svelte";
import type { IPracticePage } from "../IPracticePage";
import type { FrontendDanceEvaluator } from "../FrontendDanceEvaluator";

export interface PostActivityUIContentItem {
    text?: string; 
    visual?: HTMLElement;
    actions?: PostActivityAction[];
}
export type PostActivityUIContent = PostActivityUIContentItem[];

export interface PostActivityAction {
    id: string;
    label: string;
    action: () => void; // Function to execute when the option is chosen
}

export interface IPostActivityCoordinator {

    // Called when the practice activity ends
    onActivityComplete(
        practicePage: IPracticePage,
        evaluator: FrontendDanceEvaluator, 
        recordedVideoBlob?: Blob): Promise<void>;

    // Gets the current UI content to display
    getUIContent(): PostActivityUIContent;

    // Handles a user's response to a question or an option selection
    handleUserResponse(response: { questionId?: string, answer?: any, optionId?: string }): Promise<void>;

    // Indicates if the post-activity phase is complete
    isComplete(): boolean;

    // Optional: Called when the post-activity flow is explicitly ended by the user (e.g. clicking "Continue")
    onFlowEnd?(): Promise<void>;
}
