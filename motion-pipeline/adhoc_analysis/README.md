# adhoc_analysis

This directory contains **experimental and ad-hoc research scripts** that accumulated
during the early phases of this project.  The code here is **not part of the
`motion_extraction` production pipeline** and should not be relied on as supported
functionality.

## Contents

| Path | Description | Status |
|---|---|---|
| `complexity-metric/adhoc-complexity-calculation.py` | Early prototype of complexity segmentation on synthetic noise data | Superseded by `motion_extraction/complexity_analysis/` |
| `chatgpt-test/` | Quick test of ChatGPT API integration (requires a `secrets.py` with an API key) | Experimental; unmaintained |
| `pyfeat.py` | Emotion detection from video using the `py-feat` library | Experimental; undocumented dependency |
| `study1_error_bars.py` | CHI Study 1 visualisation script | Historical; data in `study1_updated.csv` |
| `chart_plottings/chat_plottings.py` | Misc chart helpers | Incomplete sketch |
| `playback_by_activitystep/` | Segmented video playback tool | Incomplete prototype |
| `convert_files.ps1` / `convert_videos.sh` | One-off ffmpeg conversion helpers | Utility scripts; not maintained |
| `dancetreenode.js` / `dancetrees.html` | Early browser prototype for dance-tree visualisation | Superseded by the SvelteKit frontend |
| `bpm_analysis.xlsx` | Manual BPM analysis spreadsheet | Historical reference artefact |
| `auto_performance_rating.jpg` | Image artefact from early prototyping | Historical |

## What to do with this directory

These files are retained for historical traceability.  If you are new to this
repository, **start with `motion_extraction/`** for all production pipeline code.

If a script here proves useful, the right approach is to clean it up and
integrate it properly into `motion_extraction/scripts/` or the relevant
sub-package rather than running it directly from here.
