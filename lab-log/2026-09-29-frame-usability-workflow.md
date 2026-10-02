---
date: 2026-09-29
tags: [human-annotation, frame-usability, pose-tracking, workflow]
artifacts: []
---

# Keep frame-error annotation sparse and familiar

The new follow-up queue covers 49 videos Viona rated `correctable`, including
five study reference segments. Its first interface version introduced a large
separate frame-review panel and required a label on every video frame. Viona
corrected that direction: “you didn't need to design a whole new UI”; the
prior frame-marking flow “was based on the landmark-by-landmark error marking
ui,” with a compact segmented frame-state control and a timeline of frame
error marks. She also specified: “i should only need to mark the frames that
are errors,” while missing-pose frames should already be marked automatically,
with their provenance recorded.

The frame tasks first reused that control and the existing whole-frame timeline.
The three states are Good, Flawed, and Unusable. Unmarked frames implicitly
count as Good, so completion does not demand one action per frame. Missing-pose
frames are automatically Unusable; their frame numbers are stored separately
from manual frame choices. Viona can explicitly mark Good to override an
automatic error without erasing its source. The frame workflow stores responses
separately from the completed video ratings and the earlier detailed-error
drafts.

Viona then chose to do landmark-by-landmark error marking in the same pass:
“after one pass, you'll have the data to determine if you can detect anomolies / errors on a per-landmark-position-stream basis.” Keep the three-level frame
selector, and restore the established landmark timelines, slow replay,
mark-detail popup, and drag-to-mark/correct interaction. Each frame task now
stores landmark error spans and any corrected positions in its frame response
alongside sparse whole-frame labels and automatic missing-pose provenance.
Existing frame responses without landmark marks remain valid. This supplies
human labels for a later per-landmark anomaly-detection evaluation; whether an
automated detector succeeds remains unevaluated.

Viona further specified that correcting a landmark's position should change
an otherwise Good frame to Flawed automatically, while an Unusable frame stays
Unusable. A click or a drag released back at the starting position does not
change the frame rating. The skeleton and video outline on Flawed frames are
orange; red is reserved for Unusable frames. The editor keeps the three-level
frame label and each landmark correction separately in the saved response.

For the current frame tasks, Viona made leg annotation out of scope. The
editor hides knee and ankle timelines, landmarks, and edges connected to
those joints, while retaining hips for torso context and preserving any
earlier leg marks in the saved history. She also requested a bottom “Give up
on video” action for a clip that needs too many corrections. This completes
the frame task with an explicit `unusable` video-rating override in a new
revision, preserving the earlier `correctable` rating and partial frame work.
The override can be undone to resume the task; future curation must use the
latest frame-task override when deriving the effective video rating.

Viona then asked for the phone view to give the video and draggable skeleton
nearly the whole screen. The frame-task phone layout now hides the page header
and queue, enlarges the video with a zoomed view that can be panned to reach
cropped landmarks, and keeps previous frame, slow play, next frame (or Complete
on the final frame), and a two-choice usability action in the bottom bar.
The usable choice resolves to Good or Flawed from whether that frame has a
saved landmark correction; Unusable remains explicit. Playback speed, view
fit/zoom, pan, timeline/notes, skip, and Give up are in an overflow menu.
The full three-state control and landmark timelines remain available on other
layouts; mobile timeline access remains available through the menu. Annotation
history and automatic missing-pose provenance remain separate.

The phone view now has a scrubber immediately above the bottom controls. Its
Auto view follows the visible upper-body pose as the frame changes, smoothing
ordinary frame steps and recentering after a seek. Two-finger dragging pans the
video, and pinching zooms around the gesture center. Auto view retains that
chosen zoom on later frames and seeks while continuing to pan. A one-finger
drag on a landmark retains the correction flow,
and adding a second finger cancels an unfinished landmark drag without saving
it. The overflow menu still offers explicit zoom and one-pointer pan controls.

Viona then asked for keyboard arrows to step one frame, a confirmation when
the phone's final-frame forward action becomes Complete, and return visits to
resume at the frame she left. Arrow keys now step frames outside controls that
already use arrows. The phone completion action confirms before submission.
The cursor is remembered by experiment, annotator, and task in browser storage
as the frame changes; once the server is restarted with this code, normal
annotation saves include the frame in the SQLite response, so another device
can recover the last saved cursor. This navigation
state does not change the frame labels or correction provenance.

The 49-video queue and the paired C4 metric experiment answer different
questions. Frame labels can later evaluate error localization and usable-frame
coverage; they are not evidence that C4 repaired a naturally missing pose or
that an automatic dataset cutoff is valid.
