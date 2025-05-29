# segmentations_by_name = {
#     'bartender': [0.0, 4.498, 8.997, 13.496, 17.995, 18.866],# [0.0, 5.5, 8.316, 10.85, 13.0, 14.9],
#     'last-christmas-tutorial': [0.0, 4.352, 8.704, 13.056, 15.066], #[0.0, 3.643, 4.3521, 6.731, 8.704, 10.541, 11.3, 13.056, 15.067],
#     'mad-at-disney-tutorial': [0.0, 4.04, 8.08, 12.12, 16.16, 18.15], # [0.0, 1.5, 2.13, 4.04, 6.34, 8.08, 10.20, 12.12, 14.14, 16, 18.15],
#     'pajamaparty-tutorial': [0.0, 2.682, 5.365, 8.048, 10.731, 13.913], #[0, 2.68, 5.368, 6.713, 8.052, 10.736, 12.5, 13.42, 13.96]
# }

# This script segments video files from ./input based on predefined segmentations.
# If the filename is recognized, it'll use ffmpeg to segment the video, 
# outputting the segments as individual files in the ./output directory, with the clip number in
# the filename.

# For example, if bartender.mp4 is in the input directory, it will create files like:
# output/bartender_clip1.mp4 (from 0.0 to 4.498 seconds)
# output/bartender_clip2.mp4 (from 4.498 to 8.997 seconds)
# and so on

#!/bin/bash
# Define the segmentations for each video
declare -A segmentations_by_name=(
    ["bartender"]="0.0 4.498 8.997 13.496 17.995 18.866"
    ["last-christmas-tutorial"]="0.0 4.352 8.704 13.056 15.066"
    ["mad-at-disney-tutorial"]="0.0 4.04 8.08 12.12 16.16 18.15"
    ["pajamaparty-tutorial"]="0.0 2.682 5.365 8.048 10.731 13.913"
)

# Create output directory if it doesn't exist
mkdir -p output

# Variable to store the user's choice for overwriting all or none
overwrite_all_choice=""

# Loop through each video file in the input directory
for video_file in input/*.mp4; do
    # Extract the filename without the extension
    filename=$(basename -- "$video_file")
    name_no_ext="${filename%.*}"

    # Check if segmentation is defined for this video
    if [[ -n "${segmentations_by_name[$name_no_ext]}" ]]; then
        # Check if clips already exist for this video
        existing_clips_check_pattern="output/${name_no_ext}_clip*.mp4"
        shopt -s nullglob
        existing_clips_array=($existing_clips_check_pattern)
        shopt -u nullglob

        proceed_with_current_video=true

        if [ ${#existing_clips_array[@]} -gt 0 ]; then
            if [[ "$overwrite_all_choice" == "all" ]]; then
                echo "Proceeding to overwrite clips for '${name_no_ext}' (previous 'all' choice)."
            elif [[ "$overwrite_all_choice" == "none" ]]; then
                echo "Skipping '${name_no_ext}' (previous 'none' choice)."
                proceed_with_current_video=false
            else
                read -r -p "Clips for '${name_no_ext}' already exist. Overwrite? (y/n/a/x) (a=all, x=none): " user_choice
                case "$user_choice" in
                    [Yy])
                        echo "Proceeding to overwrite clips for '${name_no_ext}'."
                        ;;
                    [Aa])
                        echo "Proceeding to overwrite clips for '${name_no_ext}' and all subsequent videos."
                        overwrite_all_choice="all"
                        ;;
                    [Xx])
                        echo "Skipping '${name_no_ext}' and all subsequent videos with existing clips."
                        overwrite_all_choice="none"
                        proceed_with_current_video=false
                        ;;
                    *)
                        echo "Skipping '${name_no_ext}' as per user choice (not overwriting)."
                        proceed_with_current_video=false
                        ;;
                esac
            fi
        fi

        if ! $proceed_with_current_video; then
            continue
        fi
        
        echo "Processing $video_file..."
        
        # Get the segmentation times for this video
        segment_times_str=${segmentations_by_name[$name_no_ext]}
        # Convert string to array
        read -r -a segment_times <<< "$segment_times_str"
        
        # Loop through the segment times to create clips
        # The last timestamp is the end of the last segment, so we iterate up to N-1 timestamps
        for i in $(seq 0 $((${#segment_times[@]} - 2))); do
            start_time=${segment_times[$i]}
            end_time=${segment_times[$((i + 1))]}
            clip_number=$((i + 1))
            output_filename="output/${name_no_ext}_clip${clip_number}.mp4"
            
            echo "Creating segment $clip_number: from $start_time to $end_time"
            
            # Use ffmpeg to create the segment
            # -ss: start time
            # -to: end time (alternatively, use -t for duration)
            # -c copy: copies the codecs, much faster if no re-encoding is needed
            # -y: overwrite output files without asking
            # -hide_banner -loglevel error: suppress verbose ffmpeg output
            ffmpeg -hide_banner -loglevel error -i "$video_file" -ss "$start_time" -to "$end_time" -c:v libx264 -c:a aac -y "$output_filename"
            
            if [[ $? -eq 0 ]]; then
                echo "Successfully created $output_filename"
            else
                echo "Error creating $output_filename"
            fi
        done
        echo "Finished processing $video_file."
    else
        echo "No segmentation found for $name_no_ext. Skipping."
    fi
done

echo "All videos processed."
