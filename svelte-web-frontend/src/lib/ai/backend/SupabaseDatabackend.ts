import type { SupabaseClient } from "@supabase/supabase-js";
import type { IDataBackend } from "./IDataBackend";
import type { PracticePlanProgress } from "$lib/data/activity-progress";
import { browser } from "$app/environment";

class SupabaseDataBackend implements IDataBackend {
    constructor(private supabase: SupabaseClient) {}

    async GetPracticePlanProgress(danceId: string, planId: string): Promise<PracticePlanProgress | undefined> {
        if (!browser) return undefined;

        const key = `progress_${danceId}_${planId}`;
        const tree_progress_string = localStorage.getItem(key);
        if (tree_progress_string === null) {
            console.log("no tree_progress_string found in localstorage for:", key)
            return {};
        } 
        console.log('got a tree_progress_string', tree_progress_string, key);
        let localstorage_data = null;
        try {
            if (tree_progress_string !== null) {
                localstorage_data = JSON.parse(tree_progress_string);
            }
            // check to ensure localstorage_data is an object
            if (typeof localstorage_data !== 'object') {
                localstorage_data = null;
            }
        } catch (error) {
            if (error instanceof SyntaxError) {
                console.error('Invalid progress data in localstorage', error.message);
            }
        }
        const progress_data = localstorage_data || {};

        return progress_data
    }

    // Implement the methods defined in the IDataBackend interface
}
export default SupabaseDataBackend;
