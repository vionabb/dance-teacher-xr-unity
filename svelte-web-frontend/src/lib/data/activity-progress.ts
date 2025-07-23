import { browser } from "$app/environment";
import type { SupabaseClient } from "@supabase/supabase-js";

export type StepProgressData = {
    completed: boolean;
    started?: boolean;
}
export type ActivityProgress = {
    [step_id: string]: StepProgressData;
}
export type PracticePlanProgress = {
    [activity_id: string]: ActivityProgress;
}

// export function get_practiceplan_progress(
//     supabase: SupabaseClient,
//     dance_id: string,
//     plan_id: string,
// ): PracticePlanProgress {
//     if (!browser) {
//         return {};
//     }

//     // supabase.from('learningstepprogress')
//     //     .select('*')
//     //     .filter('dance_id', 'eq', dance_id)
//     //     .filter('practiceplan_id', 'eq', plan_id)
//     //     .
    

//     const key = `progress_${dance_id}_${plan_id}`;
//     const tree_progress_string = localStorage.getItem(key);
//     if (tree_progress_string === null) {
//         console.log("no tree_progress_string found in localstorage for:", key)
//         return {};
//     } 
//     console.log('got a tree_progress_string', tree_progress_string, key);
//     let localstorage_data = null;
//     try {
//         if (tree_progress_string !== null) {
//             localstorage_data = JSON.parse(tree_progress_string);
//         }
//         // check to ensure localstorage_data is an object
//         if (typeof localstorage_data !== 'object') {
//             localstorage_data = null;
//         }
//     } catch (error) {
//         if (error instanceof SyntaxError) {
//             console.error('Invalid progress data in localstorage', error.message);
//         }
//     }
//     const progress_data = localstorage_data || {};

//     return progress_data
// }