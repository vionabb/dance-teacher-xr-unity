from pathlib import Path
from typing import Optional

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from pytransform3d import rotations as pr
from pytransform3d import transformations as pt
from pytransform3d.transform_manager import TransformManager

from .MecanimHumanoid import HumanoidPositionSkeleton
from .motion_output_provider import (BVHOutputProvider, MotionOutputProvider,
									 NaoTrajectoryOutputProvider)
from .utils import throttle

_HOLISTIC_DATA_LEGACY_SUFFIX = '.holisticdata.csv'
_HOLISTIC_DATA_RAW_SUFFIX = '.holisticdata.raw.csv'


def _clip_stem_from_holistic_csv_path(data_file: Path) -> str:
	name = data_file.name
	for suffix in (_HOLISTIC_DATA_RAW_SUFFIX, _HOLISTIC_DATA_LEGACY_SUFFIX):
		if name.endswith(suffix):
			return name[:-len(suffix)]
	return data_file.stem


def _collect_holistic_data_files(root_folder: Path) -> list[Path]:
	files_by_relative_stem: dict[str, Path] = {}
	for holistic_data_file in root_folder.rglob(_HOLISTIC_DATA_LEGACY_SUFFIX):
		relative_stem = holistic_data_file.relative_to(root_folder).as_posix()[:-len(_HOLISTIC_DATA_LEGACY_SUFFIX)]
		files_by_relative_stem[relative_stem] = holistic_data_file
	for holistic_data_file in root_folder.rglob(_HOLISTIC_DATA_RAW_SUFFIX):
		relative_stem = holistic_data_file.relative_to(root_folder).as_posix()[:-len(_HOLISTIC_DATA_RAW_SUFFIX)]
		files_by_relative_stem[relative_stem] = holistic_data_file
	return list(files_by_relative_stem.values())


def convert_to_jointspace(holistic_data: pd.DataFrame, naocsv_outpath: Path, bvh_filepath: Path, bvhcsv_outpath: Optional[Path] = None, frame_limit = -1) -> None:
	"""
	Concert the holistic data to jointspace and output to bvh file and robot trajectory
	"""

	@throttle(1)
	def print_progress(frame_i, i_max, pretext, posttext = ''):
		percent = frame_i * 100 / i_max
		print(f"{pretext} {percent:.2f}% ({frame_i}/{max_frames}) {posttext}")

	print("Calculating humanoid position skeletons...")
	METERS_TO_CM = 100.
	max_frames = frame_limit if frame_limit > 0 else len(holistic_data)

	def make_pose_and_print(frame_i, row):
		print_progress(frame_i, max_frames, "Step 1/2", "Calculating skeletons")
		return HumanoidPositionSkeleton.from_mp_pose(row)

	skels = [make_pose_and_print(i, row) for i, row in holistic_data.iloc[:max_frames].iterrows()]
	link_lengths = pd.DataFrame(s.get_offsets_and_measurements() for s in skels)    
	avg_offsets_and_measurements = link_lengths.mean(axis=0)
	avg_offsets_and_measurements_cm = avg_offsets_and_measurements * METERS_TO_CM
	print(avg_offsets_and_measurements_cm)

	print("\nConverting to jointspace...")
	bvh_output_provider = BVHOutputProvider(
		avg_offsets_and_measurements_cm,
		bvh_filepath,
		bvhcsv_outpath
	)
	nao_output_provider = NaoTrajectoryOutputProvider(
		naocsv_outpath,
	)

	for i, skel in enumerate(skels[:max_frames]):     
		print_progress(i, max_frames, 'Step 2/2', 'Processing Frames')
		try:
			tfs = skel.get_transforms(plot=False)   
		except:
			tfs = None
		nao_output_provider.process_frame(skel, tfs)
		bvh_output_provider.process_frame(skel, tfs) 
           
	print("\nWriting output...")
	bvh_output_provider.write_output()
	nao_output_provider.write_output()

if __name__ == "__main__":
	import argparse
	from pathlib import Path
	parser = argparse.ArgumentParser()
	parser.add_argument('--bvh_output_folder', type=Path, required=True)
	parser.add_argument('--naocsv_output_folder', type=Path, required=True)
	parser.add_argument('holistic_data', nargs="+", type=Path)
	parser.add_argument('--log_level', type=str, default='INFO')
	parser.add_argument('--frame_limit', type=int, default=-1)
	parser.add_argument('--csv_output_folder', type=Path, default=None)
	args = parser.parse_args()

	args.bvh_output_folder.mkdir(exist_ok=True, parents=True)
	args.naocsv_output_folder.mkdir(exist_ok=True, parents=True)
	if args.csv_output_folder is not None:
		args.csv_output_folder.mkdir(exist_ok=True, parents=True)

	if len(args.holistic_data) == 1 and args.holistic_data[0].is_dir():
		args.holistic_data = _collect_holistic_data_files(args.holistic_data[0])

	for holistic_data in args.holistic_data:
		glob_data = holistic_data.parent.glob(holistic_data.name)
		for data_file in glob_data:
			print(f"Processing {data_file}")
			with data_file.open('r') as f:
				holistic_dataframe = pd.read_csv(f, index_col='frame')
				clip_stem = _clip_stem_from_holistic_csv_path(data_file)
				naocsv_outpath = args.naocsv_output_folder / f'{clip_stem}.nao.csv'
				bvh_out_path = args.bvh_output_folder / f'{clip_stem}.bvh'
				csv_out_path = args.csv_output_folder / f'{clip_stem}.bvh.csv' if args.csv_output_folder is not None else None
				# out_path = args.output_folder / f'{clip_stem}.jointspace'
				convert_to_jointspace(holistic_dataframe, naocsv_outpath, bvh_out_path, bvhcsv_outpath = csv_out_path, frame_limit = args.frame_limit)
                
				print(f"\nDone converting {data_file.name}!")
