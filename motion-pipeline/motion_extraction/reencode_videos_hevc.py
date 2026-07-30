

from pathlib import Path
from argparse import ArgumentParser
import subprocess
import sys
from datetime import datetime
from contextlib import suppress
from time import sleep

def reencode_videos_hevc(source_glob: str, target_folder: str, overwrite: bool = False):
    
    input = Path(source_glob)
    input = list(input.parent.glob(input.name))

    Path(target_folder).mkdir(parents=True, exist_ok=True)

    for i, source_video_path in enumerate(input):
        print(f"Processing {i+1}/{len(input)}: {source_video_path.name}")
        source_str = source_video_path.as_posix().replace('"', '\\"').replace("'", "\\'").replace(" ", "\\ ").replace("|", "\\|")
        dest_path = Path(target_folder) / (source_video_path.stem + '.mp4')
        if dest_path.exists() and not overwrite:
            print(f"Skipping {source_video_path.name}")
            continue
        dest_str = dest_path.as_posix().replace('"', '\\"').replace("'", "\\'").replace(" ", "\\ ").replace("|", "\\|")

        # command = f'ffmpeg -y -i {source_str}  -c:v libx265 -preset fast -crf 28 -tag:v hvc1 -c:a eac3 -b:a 192k {dest_str}'
        command = f'ffmpeg -y -i {source_str} -vcodec libx264 -preset ultrafast {dest_str}'

        proc = subprocess.Popen(command, shell=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        stime = datetime.now()
        while True:
            proc.poll()            
            if proc.returncode is not None:
                if proc.returncode != 0:
                    output = proc.stderr.read().decode('utf-8')
                    print(f'\tError: {output}', file=sys.stderr)
                break
            sleep(1.0)
            print(f'\t{datetime.now() - stime}')          
            

if __name__ == "__main__":
    argument_parser = ArgumentParser()
    argument_parser.add_argument('--source_glob', type=str, required=True)
    argument_parser.add_argument('--target_folder', type=str, required=True)
    argument_parser.add_argument('--overwrite', action='store_true')
    args = argument_parser.parse_args()

    reencode_videos_hevc(args.source_glob, args.target_folder, args.overwrite)