import type PracticeStep from "$lib/model/PracticeStep";

/**
 * Interface for a practice page, exposing the functionality 
 * available to other components
 */
export interface IPracticePage {


    /** Restarts the current activity */
    restartCurrentActivity(): void;

    /** Load Activity */
    startActivity(practiceStep: PracticeStep): void;
}