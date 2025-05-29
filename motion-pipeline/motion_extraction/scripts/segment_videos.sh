# This script segments video files from ./input based on consistent spacing.
# It calculates segment times dynamically and processes any video without predefined segmentations.

# For example, if bartender.mp4 is in the input directory, it will create files like:
# output/bartender_clip1.mp4 (from 0.0 to 4.5 seconds)
# output/bartender_clip2.mp4 (from 4.5 to 9.0 seconds)
# and so on

#!/bin/bash

# Enable or disable horizontal mirroring (set to true or false)
mirror_horizontally=true

# Create output directory if it doesn't exist
mkdir -p output

# Define the consistent spacing for each video
declare -A segment_spacing_by_name=(
    ["bartender"]="4.498"
    ["last-christmas-tutorial"]="4.352"
    ["mad-at-disney-tutorial"]="4.04"
    ["pajamaparty-tutorial"]="2.682"
)

# Loop through each video file in the input directory
for video_file in input/*.mp4; do
    # Extract the filename without the extension
    filename=$(basename -- "$video_file")
    name_no_ext="${filename%.*}"

    echo "Processing $video_file..."

    # Get the total duration of the video using ffprobe
    total_duration=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$video_file")

    # Get the segment spacing for the current video
    segment_spacing=${segment_spacing_by_name[$name_no_ext]}

    if [[ -z "$segment_spacing" ]]; then
        echo "No segment spacing defined for $name_no_ext. Skipping."
        continue
    fi

    # Initialize start time and clip number
    start_time=0.0
    clip_number=1

    # Loop to create segments based on consistent spacing
    while (( $(echo "$start_time < $total_duration" | bc -l) )); do
        end_time=$(echo "$start_time + $segment_spacing" | bc -l)
        if (( $(echo "$end_time > $total_duration" | bc -l) )); then
            end_time=$total_duration
        fi

        output_filename="output/${name_no_ext}.clip-${clip_number}.mp4"

        echo "Creating segment $clip_number: from $start_time to $end_time"

        # Apply horizontal mirroring if the flag is enabled
        if [[ "$mirror_horizontally" == true ]]; then
            ffmpeg -hide_banner -loglevel error -i "$video_file" -ss "$start_time" -to "$end_time" -vf "hflip" -c:v libx264 -c:a aac -y "$output_filename"
        else
            ffmpeg -hide_banner -loglevel error -i "$video_file" -ss "$start_time" -to "$end_time" -c:v libx264 -c:a aac -y "$output_filename"
        fi

        if [[ $? -eq 0 ]]; then
            echo "Successfully created $output_filename"
        else
            echo "Error creating $output_filename"
        fi

        # Update start time and clip number
        start_time=$end_time
        clip_number=$((clip_number + 1))
    done

    echo "Finished processing $video_file."
done

echo "All videos processed."
