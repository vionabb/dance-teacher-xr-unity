/**
 * syncBundleData.js
 * 
 * @author Jules Blanchet
 * 
 * Synchronizes json files outputted from the motion processing pipeline
 * to the frontend database. This includes:
 *   * `dances.json`, containing information on each dance video 
 *   * `danceTrees.json`, containing recursive segmentations of the various dances
 */

// dances.json contains an array of objects like the following:
// {
//   "title": "club-dance-moves-for-women-who-dont-know-how-to-dance",
//   "clipName": "club-dance-moves-for-women-who-dont-know-how-to-dance",
//   "clipPath": "club-dance-moves-for-women-who-dont-know-how-to-dance.mp4",
//   "clipType": "video",
//   "isTest": false,
//   "manualBPM": 0.0,
//   "frameCount": 14563,
//   "fps": 29.97,
//   "duration": 485.919,
//   "width": 1920,
//   "height": 1080,
//   "startTime": 0,
//   "endTime": 485.919,
//   "poseUpperBodyOnly": false,
//   "tags": [],
//   "landmarkScope": [
//     "pose",
//     "rightHand",
//     "leftHand",
//     "face"
//   ],
//   "thumbnailSrc": "club-dance-moves-for-women-who-dont-know-how-to-dance.jpg",
//   "clipRelativeStem": "club-dance-moves-for-women-who-dont-know-how-to-dance",
//   "debugAudioAnalysis": {
//     "duration": 485.92,
//     "sample_rate": 44100,
//     "tempo_info": {
//       "bpm": 132.51201923076923,
//       "raw_bpm": 132.51201923076923,
//       "plp_bpm": 123.7644709675296,
//       "raw_plp_bpm": 247.5289419350592,
//       "starting_beat_timestamp": 0.058049886621315196,
//       "beat_offset": 0.058049886621315196,
//       "audible_beats": [0.058049886621315196,
//         0.5108390022675737,
//         0.8823582766439909,
//         1.242267573696145,
//         1.6137868480725623,
//         2.124625850340136,
//         ...
//       ],
//       "all_beats": [
//        0.058049886621315196,
//         0.5108390022675737,
//         0.8823582766439909,
//         1.242267573696145,
//         1.6137868480725623,
//         2.124625850340136,
//       ]
//     },
//     "musical_phrases": [
//       {
//         "start_time": 0,
//         "midpoints": [
//           1.8692063492063493
//         ],
//         "end_time": 3.680362811791383
//       },
//       {
//         "start_time": 3.680362811791383,
//         "midpoints": [
//           5.491519274376417
//         ],
//         "end_time": 7.302675736961451
//       },
//       ...
//     ],
//     "phrase_groupings": [
//       [0],
//       [1, 2],
//       ...
//     ],
//   "bpm": 132.51201923076923,
//   "beat_offset": 0.058049886621315196
// }
//
// danceTrees.json contains an object whose keys are the relativeStems of the clips and whose values are an array of recursive segmentation objects, like this:
// {
//   "club-dance-moves-for-women-who-dont-know-how-to-dance": [
//     {
//       "tree_name": "club-dance-moves-for-women-who-dont-know-how-to-dance audio tree",
//       "clip_relativepath": "club-dance-moves-for-women-who-dont-know-how-to-dance",
//       "root": {
//         "id": "wholesong",
//         "start_time": 0.0,
//         "end_time": 485.8858858858859,
//         "alternate_ids": [],
//         "children": [
//           {
//             "id": "phrase0",
//             "start_time": 0.0,
//             "end_time": 3.6703370036703373,
//             "alternate_ids": [
//               "phrasegroup0"
//             ],
//             "children": [
//               {
//                 "id": "bar0",
//                 "start_time": 0.0,
//                 "end_time": 1.8685352018685353,
//                 "alternate_ids": [],
//                 "children": [],
//                 "metrics": {
//                   "time_of_last_complexity_change": 1.8685352018685353
//                 },
//                 "events": {},
//                 "complexity": -0.5773373337956796
//               },
//               {
//                 "id": "bar1",
//                 "start_time": 1.8692063492063493,
//                 "end_time": 3.6703370036703373,
//                 "alternate_ids": [],
//                 "children": [],
//                 "metrics": {
//                   "time_of_last_complexity_change": 3.6703370036703373
//                 },
//                 "events": {},
//                 "complexity": -0.5056337720831051
//               }
//             ],
//             "metrics": {
//               "similarity-to-phrase0": 1.0,
//               "similarity-to-phrase1": 0.22471162912377882,
//               "similarity-to-phrase2": 0.157113236814264,
//               "similarity-to-phrase3": 0.2155587410770122,
//               "similarity-to-phrase4": 0.166818183659251,
//               "similarity-to-phrase5": 0.15786704439643226,
//             },
//             "events": {},
//             "complexity": -1.0829711058787848
//           },
//           {
//             "id": "phrase1",
//             "start_time": 3.680362811791383,
//             "end_time": 7.307307307307307,
//             "alternate_ids": [
//               "phrasegroup1"
//             ],
//             "children": [
//               {
//                 "id": "bar2",
//                 "start_time": 3.680362811791383,
//                 "end_time": 5.505505505505505,
//                 "alternate_ids": [],
//                 "children": [],
//                 "metrics": {
//                   "time_of_last_complexity_change": 5.505505505505505
//                 },
//                 "events": {},
//                 "complexity": -0.3572609948437784
//               },
//               {
//                 "id": "bar3",
//                 "start_time": 5.491519274376417,
//                 "end_time": 7.307307307307307,
//                 "alternate_ids": [],
//                 "children": [],
//                 "metrics": {
//                   "time_of_last_complexity_change": 7.307307307307307
//                 },
//                 "events": {},
//                 "complexity": -0.6843107178606584
//               }
//             ],
//             "metrics": {
//               "similarity-to-phrase0": 0.22471162912377882,
//               "similarity-to-phrase1": 1.0,
//               "similarity-to-phrase2": 0.3542459595728861,
//               "similarity-to-phrase3": 0.4331638141976352,
//               "similarity-to-phrase4": 0.274759079561169,
//               "similarity-to-phrase5": 0.37721433142505534,
//               "similarity-to-phrase6": 0.4717672395144207,
//               "similarity-to-phrase7": 0.46914864758931885,
//               "similarity-to-phrase8": 0.3343882106129636,
//               "similarity-to-phrase9": 0.4223214646101603,
//             },
//             "events": {},
//             "complexity": -1.0415717127044368
//           },
//         ],
//         "generation_data": {
//           "complexity": "mw-decreasing_by_quarter_lmw-balanced_byvisibility_includebase"
//         }
//       }
//     }
//   ],
// }

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config({
    path: 'src/env/.env'
});

/**
 * Syncs dances info to Supabase buckets.
 * @param {Object} args - The arguments for syncing storage assets.
 * @param {string} args.url - The URL of the Supabase project.
 * @param {string} args.key - The service role key for accessing Supabase.
 * @param {string} args.dancesJsonPath - The path to dances.json
 * @param {string} args.danceTreesJsonPath - The path to danceTrees.json
 * @param {boolean} [args.isAsync=false] - Whether do sync one file at a time.
 * @param {boolean} [args.dryRun=false] - Whether to perform a dry run without actually syncing the files.
 * @returns {Promise<void>}
 */
async function syncBundleData(args) {
    const { url, key, dancesJsonPath, danceTreesJsonPath, isAsync = false, dryRun = false } = args;

    /** @type {import('@supabase/supabase-js').SupabaseClient<import('../src/lib/ai/backend/SupabaseTypes').Database>} */
    const supabase = createClient(url, key);

    // Load the dances.json file
    const dances = JSON.parse(fs.readFileSync(dancesJsonPath, 'utf-8'));

    // Load the danceTrees.json file
    const danceTrees = JSON.parse(fs.readFileSync(danceTreesJsonPath, 'utf-8'));

    // Sync the dances and dance trees to Supabase
    let danceCount = 0;
    // Maps clipRelativeStem to motion_video entry id
    let motionVideoEntryIds = {};
    for (const dance of dances) {
        danceCount++;
        const progressStr = `Dance [${danceCount}/${dances.length}] `;

        const matchedEntry = await supabase.from('motion_video')
            .select('*')
            .eq('videoSrc', dance.clipPath)
            .eq('motionStart', dance.startTime)
            .eq('motionEnd', dance.endTime)
            .single();

        const matchedId = matchedEntry.data?.id;

        // Error code 406 means no rows found, which is fine
        if (matchedEntry.error && matchedEntry.status !== 406) {
            throw new Error('Error querying existing entry:', matchedEntry.error);
        }

        if (matchedId) {
            console.log(`${progressStr} Entry for ${dance.clipPath} already exists with id ${matchedId}, skipping insert.`);
            motionVideoEntryIds[dance.clipRelativeStem] = matchedId;
            continue;
        }

        if (dryRun) {
            console.log(`${progressStr} [Dry Run] Would insert entry for ${dance.clipPath}`);
            continue;
        }
    
        //// Table definition for reference:
        //     CREATE TABLE IF NOT EXISTS "public"."motion_video" (
        //     "id" bigint NOT NULL,
        //     "displayName" "text" NOT NULL,
        //     "uploader" "uuid",
        //     "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
        //     "videoSrc" "text" NOT NULL,
        //     "thumbnailSrc" "text" NOT NULL,
        //     "height" integer NOT NULL,
        //     "width" integer NOT NULL,
        //     "videoDuration" double precision NOT NULL,
        //     "motionStart" double precision NOT NULL,
        //     "motionEnd" double precision NOT NULL,
        //     "fps" double precision NOT NULL,
        //     "detectedBpm" double precision,
        //     "detectedBpmOffset" double precision,
        //     "manualBpm" double precision
        // );

        const insertResult = await supabase.from('motion_video')
            .insert({
                displayName: dance.title,
                videoSrc: dance.clipPath,
                thumbnailSrc: dance.thumbnailSrc,
                height: dance.height,
                width: dance.width,
                videoDuration: dance.duration,
                motionStart: dance.startTime,
                motionEnd: dance.endTime,
                fps: dance.fps,
                detectedBpm: dance.bpm || null,
                detectedBpmOffset: dance.beat_offset || null,
                manualBpm: dance.manualBPM || null,
            },
        ).select('id').single();
        
        if (!insertResult.data?.id || insertResult.error) {
            throw new Error(`${progressStr} Error inserting entry for ${dance.clipPath}:`, insertResult.error);
        }

        motionVideoEntryIds[dance.clipRelativeStem] = insertResult.data?.id;
        console.log(`${progressStr} Inserted entry for ${dance.clipPath} successfully.`);
    }

    // Sync the dance trees
    let treeCount = 0;
    for (const [clipRelativeStem, trees] of Object.entries(danceTrees)) {
        treeCount++;
        const progressStr = `Segmentation Tree [${treeCount}/${Object.keys(danceTrees).length}] `;
        
        const motionVideoId = motionVideoEntryIds[clipRelativeStem];
        if (!motionVideoId) {
            console.warn(`${progressStr} No motion video entry found for clipRelativeStem ${clipRelativeStem}, skipping associated dance trees.`);
            continue;
        }
        
        for (const tree of trees) {
            const treeName = tree.tree_name || 'default tree name';
            const matchedTreeEntry = await supabase.from('motion_segmentation')
                .select('*')
                .eq('videoId', motionVideoId)
                .eq('displayName', treeName)
                .single();
                    
            const matchedTreeId = matchedTreeEntry.data?.id;
            // Error code 406 means no rows found, which is fine
            if (matchedTreeEntry.error && matchedTreeEntry.status !== 406) {
                throw new Error('Error querying existing tree entry:', matchedTreeEntry.error);
            }

            if (matchedTreeId) {
                console.log(`${progressStr} Tree entry for motionVideoId ${motionVideoId} with name ${treeName} already exists with id ${matchedTreeId}, skipping insert.`);
                continue;
            }
            
            if (dryRun) {
                console.log(`${progressStr} [Dry Run] Would insert tree entry for motionVideoId ${motionVideoId} with name ${treeName}`);
                continue;
            }
            
            //// Table definition for reference:
            //     CREATE TABLE IF NOT EXISTS "public"."motion_segmentation" (
            //     "id" bigint NOT NULL,
            //     "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
            //     "videoId" bigint, -- references motion_video(id)
            //     "displayName" "text",
            //     "generationInfo" "text" NOT NULL,
            //     "data" "jsonb" NOT NULL,
            //     "createdFor" "uuid"
            // );
            
            const insertTreeResult = await supabase.from('motion_segmentation')
                .insert({
                    videoId: motionVideoId,
                    displayName: treeName,
                    generationInfo: JSON.stringify(tree.generation_data || {}),
                    data: tree,
                },
            ).select('id').single();
            
            if (!insertTreeResult.data?.id || insertTreeResult.error) {
                throw new Error(`${progressStr} Error inserting tree entry for motionVideoId ${motionVideoId} with name ${treeName}:`, insertTreeResult.error);
            }
    
            console.log(`${progressStr} Inserted tree entry for motionVideoId ${motionVideoId} with name ${treeName} successfully.`);
        }
    }
}

async function main() {

    const dryRun = process.argv.includes('--dry-run');
    const onProduction = process.argv.includes('--production');
    const async = process.argv.includes('--async');

    const url = onProduction ? process.env.PRODUCTION_SUPABASE_URL : process.env.NEXT_PUBLIC_SUPABASE_URL;
    let key = onProduction ? process.env.PRODUCTION_SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_SERVICE_ROLE_KEY;

    const defaultDancesJsonPath = 'src/lib/data/bundle/dances.json';
    const defaultDanceTreesJsonPath = 'src/lib/data/bundle/danceTrees.json';

    const args = {
        dancesJsonPath: process.argv.includes('--dances-json-path') ? process.argv[process.argv.indexOf('--dances-json-path') + 1] : defaultDancesJsonPath,
        danceTreesJsonPath: process.argv.includes('--dance-trees-json-path') ? process.argv[process.argv.indexOf('--dance-trees-json-path') + 1] : defaultDanceTreesJsonPath,
        isAsync: async,
        dryRun: dryRun,
    };

    await syncBundleData({ url, key, ...args });
}

const __filename = fileURLToPath(import.meta.url);

if (__filename === process.argv[1]) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}