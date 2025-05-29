#!/bin/bash

# Create the output directory if it doesn't exist
mkdir -p ./flipped

# Loop through common video file types in the current directory
# Add or remove extensions as needed (e.g., "*.avi", "*.mkv")
for video_file in *.mp4 *.mov *.webm; do
  # Check if the file exists to avoid errors if no files of a certain type are found
  if [ -f "$video_file" ]; then
    filename=$(basename -- "$video_file")
    output_file="./flipped/$filename"

    echo "Processing $video_file -> $output_file"

    # Use ffmpeg to flip the video horizontally and ensure proper keyframe encoding
    ffmpeg -i "$video_file" \
      -vf "hflip" \
      -c:v libx264 -preset fast -crf 23 -g 30 \
      -c:a copy -y "$output_file"

    echo "Finished processing $video_file"
  fi
done

echo "All videos processed. Flipped videos are in the ./flipped directory."