const state = {
  data: null, taskIndex: 0, annotator: "", timer: null, pendingStatus: null,
  savePromise: null, draggedOverlay: null, groundTruth: {}, initialProfile: "",
  initialGroundTruth: {}, initialLandmarkSources: {}, landmarkInteractions: {}, sourceImage: null,
  sourceObjectUrl: null, dragLandmark: null, dragStart: null, dragMoved: false,
  activePointers: new Map(), selectedLandmark: null, screen: "skeleton",
  canvasPanX: 0, canvasPanY: 0, panStart: null,
  temporalPlaybackRate: 1, errorMarks: [], errorMarkingBadFrames: [], errorMarkingUsableFrames: [], errorMarkingAutoBadFrames: [],
  errorBodyParts: [], errorCauses: [], editingListKind: "body_part",
  activeMarkIndex: null, errorMarkingNoErrorsConfirmed: false,
  errorMarkingVideoUnusable: false, errorMarkingVideoUnusableReason: "", errorMarkingVideoUsabilityRating: "",
  editingBodyParts: false, addingBodyPartEntry: false,
  errorMarkingLandmarks: null, errorMarkingLandmarksTaskId: null,
  errorMarkingLandmarksStatus: "idle",
  skeletonDragLandmark: null, skeletonDragPosition: null, selectedSkeletonLandmark: null,
  errorMarkingFrame: 0, errorMarkingReviewFrame: 0,
  errorMarkingReplayHandle: null, errorMarkingReplayDirection: null,
  errorMarkingReviewReplayHandle: null,
  errorMarkingVisualRefreshHandle: null,
  errorMarkingDirty: false,
  frameUsabilityLabels: {},
  frameVideoDisposition: null,
  frameViewZoom: 1,
  frameViewZoomMode: "auto",
  frameViewAutoZoomOverride: null,
  frameViewPanX: 0,
  frameViewPanY: 0,
  frameViewPanEnabled: false,
  frameViewLastFollowFrame: null,
  frameViewGesturePanFrame: null,
  frameViewPanGestureActive: false,
  frameViewForceRecenter: false,
  frameViewAnchorHistory: [],
  frameViewGeometryKey: null,
  frameViewMobileMode: false,
};
const $ = (id) => document.getElementById(id);

// Both usability widgets use the same segmented-control contract. Keep the
// state-to-visual mapping here so the DOM has one source of truth (`data-state`)
// and the click/keyboard paths cannot drift apart.
const SEGMENTED_CONTROL_STATE_META = {
  "frame-usability": {
    unusable: {fill: "var(--fill-selected-unusable)"},
    flawed: {fill: "var(--fill-selected-correctable)"},
    good: {fill: "var(--fill-selected-usable)"},
  },
  "video-usability": {
    unusable: {fill: "var(--fill-selected-unusable)"},
    marginal: {fill: "var(--fill-selected-marginal)"},
    correctable: {fill: "var(--fill-selected-correctable)"},
    perfect: {fill: "var(--fill-selected-perfect)"},
  },
};
const VIDEO_USABILITY_DESCRIPTIONS = {
  unusable: "Exclude the whole video.",
  marginal: "Usable only with substantial caveats.",
  correctable: "Repair or discount localized problems.",
  perfect: "No meaningful quality concerns.",
};
const POSE_TRACKING_DESCRIPTIONS = {
  unusable: "No person or pose can be assessed, or tracking is too inaccurate to use.",
  marginal: "Pose tracking has extensive errors.",
  correctable: "Pose tracking has localized errors, but most movement is tracked.",
  perfect: "The visible skeleton follows the person accurately.",
};

function segmentedControlOptions(control) {
  return [...control.querySelectorAll(".segmented-control-option")].filter((option) => !(control.classList.contains("legacy-frame-usability") && option.dataset.segmentValue === "flawed"));
}

function setSegmentedControlState(control, stateValue) {
  if (!control) return;
  const options = segmentedControlOptions(control);
  const activeIndex = options.findIndex((option) => option.dataset.segmentValue === stateValue);
  const meta = SEGMENTED_CONTROL_STATE_META[control.dataset.control]?.[stateValue];
  control.dataset.state = stateValue || "";
  control.style.setProperty("--segment-index", String(Math.max(activeIndex, 0)));
  control.style.setProperty("--selected-fill", meta?.fill || "transparent");
  options.forEach((option, index) => {
    const active = index === activeIndex;
    option.setAttribute("aria-checked", String(active));
    option.tabIndex = active || (activeIndex < 0 && index === 0) ? 0 : -1;
  });
}

function selectSegmentedControlOption(control, stateValue) {
  if (!control || !segmentedControlOptions(control).some((option) => option.dataset.segmentValue === stateValue)) return;
  if (control.dataset.control === "frame-usability") {
    flashFrameUsabilityToggle();
    if (isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex])) markFrameUsability(errorMarkingCurrentFrame(), stateValue);
    else if (stateValue === "good") markFrameUsable();
    else if (stateValue === "unusable") markFrameUnusable();
  } else if (control.dataset.control === "video-usability") {
    setErrorMarkingVideoUsabilityRating(stateValue);
  }
}

function attachSegmentedControlHandlers() {
  document.querySelectorAll(".segmented-control").forEach((control) => {
    setSegmentedControlState(control, control.dataset.state || "");
    control.addEventListener("click", (event) => {
      const option = event.target.closest(".segmented-control-option");
      if (option && control.contains(option)) selectSegmentedControlOption(control, option.dataset.segmentValue);
    });
    control.addEventListener("keydown", (event) => {
      const option = event.target.closest(".segmented-control-option");
      if (!option || !control.contains(option)) return;
      const options = segmentedControlOptions(control);
      const currentIndex = options.indexOf(option);
      let nextIndex = currentIndex;
      if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % options.length;
      else if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + options.length) % options.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = options.length - 1;
      else return;
      event.preventDefault();
      const next = options[nextIndex];
      selectSegmentedControlOption(control, next.dataset.segmentValue);
      next.focus();
    });
  });
}

function accessToken() { return sessionStorage.getItem("annotation-access-token") || localStorage.getItem("annotation-access-token") || ""; }
function authenticatedFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (accessToken()) headers.set("X-Annotation-Token", accessToken());
  return fetch(url, {...options, headers});
}

const OCCLUSION_RADIO_COLOR = {non_occluded: "radio-success", semi_occluded: "radio-warning", fully_occluded: "radio-error"};

function openLandmarkDialog(landmark) {
  state.selectedLandmark = landmark;
  $("landmark-dialog-title").textContent = landmark.replaceAll("_", " ");
  $("landmark-occlusion-options").innerHTML = occlusionStates().map((item) => `<label class="label cursor-pointer justify-start gap-2"><input type="radio" class="radio radio-sm ${OCCLUSION_RADIO_COLOR[item.id] || ""}" name="landmark-occlusion" value="${item.id}" ${state.groundTruth[landmark].occlusion === item.id ? "checked" : ""}> ${item.label}</label>`).join("");
  document.querySelectorAll('input[name="landmark-occlusion"]').forEach((input) => input.onchange = (event) => {
    const interaction = state.landmarkInteractions[landmark];
    state.groundTruth[landmark].occlusion = event.target.value;
    interaction.occlusion_change_count += 1;
    interaction.occlusion_changed = event.target.value !== state.initialGroundTruth[landmark]?.occlusion;
    drawEditor(); scheduleSave("started");
    openLandmarkDialog(landmark);
  });
  $("landmark-panel").showPopover?.();
}

function mostDiscrepantLandmark(task) {
  let selected = null, greatestDistance = -1;
  (state.data.landmarks || []).forEach((landmark) => {
    const points = task.overlays.map((overlay) => overlay.keypoints?.[landmark]).filter(Boolean);
    let distance = 0;
    points.forEach((point) => points.forEach((other) => {
      distance = Math.max(distance, Math.hypot(Number(point[0]) - Number(other[0]), Number(point[1]) - Number(other[1])));
    }));
    if (distance > greatestDistance) { selected = landmark; greatestDistance = distance; }
  });
  return selected;
}

async function responseJson(response) {
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `request failed (${response.status})`);
  return data;
}
async function loadState() {
  state.annotator = $("annotator").value.trim();
  if (!state.annotator) return alert("Enter an annotator name or ID.");
  const suppliedToken = $("access-token").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (suppliedToken) {
    sessionStorage.setItem("annotation-access-token", suppliedToken);
    if ($("remember-access-token").checked) {
      localStorage.setItem("annotation-access-token", suppliedToken);
    } else {
      localStorage.removeItem("annotation-access-token");
      localStorage.removeItem("annotation-annotator");
    }
  }
  if ($("remember-access-token").checked) {
    localStorage.setItem("annotation-annotator", state.annotator);
  }
  try {
    const response = await authenticatedFetch(`/api/state?annotator=${encodeURIComponent(state.annotator)}`);
    state.data = await responseJson(response);
  } catch (error) {
    $("save-state").textContent = "unable to load";
    alert(`Could not load annotations: ${error.message}. If this is the LAN server, enter its access code.`);
    return;
  }
  state.errorBodyParts = loadErrorList("body_part");
  state.errorCauses = loadErrorList("cause");
  const resume = state.data.tasks.findIndex((task) => task.task_id === state.data.resume_task_id);
  state.taskIndex = Math.max(0, resume);
  $("login-panel").hidden = true;
  $("user-menu").hidden = false;
  $("logged-in-annotator").textContent = state.annotator;
  $("workspace").hidden = false;
  render();
}

async function loadSourceImage(task) {
  if (state.sourceObjectUrl) URL.revokeObjectURL(state.sourceObjectUrl);
  state.sourceImage = null;
  try {
    const response = await authenticatedFetch(`/artifacts/${task.source_artifact}`);
    if (!response.ok) throw new Error(response.status === 401 ? "access code required" : `image failed (${response.status})`);
    state.sourceObjectUrl = URL.createObjectURL(await response.blob());
    const image = new Image();
    image.onload = () => { state.sourceImage = image; drawEditor(); };
    image.onerror = () => { $("save-state").textContent = "source image could not load"; };
    image.src = state.sourceObjectUrl;
  } catch (error) {
    $("save-state").textContent = `source image unavailable: ${error.message}`;
  }
}

function latest(task) { return state.data.latest_judgments[task.task_id] || null; }
function taskStatus(task) { return latest(task)?.status || "unjudged"; }
function occlusionStates() { return state.data.occlusion_states?.length ? state.data.occlusion_states : [
  {id: "non_occluded", label: "Non-occluded", visibility: 1},
  {id: "semi_occluded", label: "Semi-occluded", visibility: .5},
  {id: "fully_occluded", label: "Fully occluded", visibility: 0},
]; }
function profile(task, id) { return task.overlays.find((item) => item.overlay_id === id); }
function isTemporalTask(task) { return task.task_type === "temporal_pose_comparison"; }
function isTriageTask(task) { return task.task_type === "quality_triage"; }
function isVideoUsabilityTriageTask(task) { return task.task_type === "video_usability_triage"; }
function isVideoRatingOnlyTask(task) { return isVideoUsabilityTriageTask(task) && task.video_rating_only === true; }
function isFrameUsabilityTask(task) { return task?.task_type === "frame_usability"; }
function isErrorMarkingTask(task) { return task?.task_type === "error_marking" || isVideoUsabilityTriageTask(task) || isFrameUsabilityTask(task); }
function isQualityRatingTask(task) { return task.task_type === "video_quality_rating"; }
const ALL_SCREEN_IDS = ["skeleton-screen", "annotation-screen", "temporal-screen", "triage-screen", "error-marking-screen", "quality-rating-screen"];
function hideAllScreens() { stopErrorMarkingReplay(); ALL_SCREEN_IDS.forEach((id) => { $(id).hidden = true; }); $("actions").hidden = true; }

function showFrameScreen(screen) {
  const isAnnotation = screen === "annotation";
  $("skeleton-screen").hidden = isAnnotation;
  $("annotation-screen").hidden = !isAnnotation;
  $("actions").hidden = !isAnnotation;
  if (isAnnotation) window.scrollTo({top: 0, behavior: "smooth"});
}

function temporalVideos() {
  return [...document.querySelectorAll("#temporal-screen video")];
}

function pauseTemporalVideos() {
  temporalVideos().forEach((video) => video.pause());
}

function setTemporalSpeed(rate) {
  state.temporalPlaybackRate = rate;
  temporalVideos().forEach((video) => { video.playbackRate = rate; });
  $("temporal-speed-half").setAttribute("aria-pressed", String(rate === .5));
  $("temporal-speed-normal").setAttribute("aria-pressed", String(rate === 1));
  $("temporal-speed-half").classList.toggle("btn-active", rate === .5);
  $("temporal-speed-normal").classList.toggle("btn-active", rate === 1);
}

async function playTemporalVideos(restart = false) {
  const videos = temporalVideos(), source = $("temporal-source-video");
  if (!videos.length) return;
  if (restart || source.ended) source.currentTime = 0;
  videos.forEach((video) => {
    if (video !== source) video.currentTime = source.currentTime;
    video.playbackRate = state.temporalPlaybackRate;
  });
  await Promise.allSettled(videos.map((video) => video.play()));
}

function temporalResponsePayload() {
  return {
    choice: document.querySelector('input[name="temporal-choice"]:checked')?.value || "",
    confidence: document.querySelector('input[name="temporal-confidence"]:checked')?.value || "",
    note: $("temporal-note").value.trim(),
  };
}

function updateTemporalConfidence() {
  const cannotJudge = document.querySelector('input[name="temporal-choice"]:checked')?.value === "cannot_judge";
  document.querySelectorAll('input[name="temporal-confidence"]').forEach((input) => {
    input.disabled = cannotJudge;
    if (cannotJudge) input.checked = false;
  });
  $("temporal-confidence-help").textContent = cannotJudge
    ? "Confidence is not required for “Cannot judge.”"
    : "Required unless you choose “Cannot judge.”";
}

function renderTemporalTask(task, judgment) {
  pauseTemporalVideos();
  hideAllScreens();
  $("temporal-screen").hidden = false;
  $("actions").hidden = false;
  $("mark-unclear").hidden = true;
  const source = $("temporal-source-video");
  source.src = `/artifacts/${task.source_video}`;
  $("temporal-candidates").innerHTML = (task.candidates || []).map((candidate) =>
    `<article class="temporal-candidate"><h3>Candidate ${candidate.candidate_id}</h3><video preload="auto" playsinline muted aria-label="Candidate ${candidate.candidate_id} pose overlay video" src="/artifacts/${candidate.artifact}"></video></article>`
  ).join("");
  const response = judgment?.temporal_response || {};
  document.querySelectorAll('input[name="temporal-choice"]').forEach((input) => {
    input.checked = input.value === response.choice;
    input.onchange = () => { updateTemporalConfidence(); scheduleSave("started"); };
  });
  document.querySelectorAll('input[name="temporal-confidence"]').forEach((input) => {
    input.checked = input.value === response.confidence;
    input.onchange = () => scheduleSave("started");
  });
  $("temporal-note").value = response.note || "";
  $("temporal-note").oninput = () => scheduleSave("started");
  updateTemporalConfidence();
  setTemporalSpeed(state.temporalPlaybackRate);
  source.ontimeupdate = () => {
    temporalVideos().forEach((video) => {
      if (video !== source && Math.abs(video.currentTime - source.currentTime) > .08) {
        video.currentTime = source.currentTime;
      }
    });
  };
  source.onended = () => {
    pauseTemporalVideos();
    if ($("temporal-loop").checked) playTemporalVideos(true);
  };
  temporalVideos().forEach((video) => video.load());
}

const TRIAGE_CATEGORY_LABELS = {
  crop: "Framing / crop",
  roughness: "Jitter / roughness",
  false_tracking: "Possible false tracking",
  control: "Random control (unflagged)",
};

function renderTriageTask(task, judgment) {
  pauseTemporalVideos();
  hideAllScreens();
  $("triage-screen").hidden = false;
  $("actions").hidden = false;
  $("mark-unclear").hidden = true;

  $("triage-category-badge").textContent = TRIAGE_CATEGORY_LABELS[task.category] || task.category;
  $("triage-signal-value").textContent = Number.isFinite(task.signal_value)
    ? `signal value: ${task.signal_value.toFixed(3)}`
    : "";

  const isFrame = task.review_unit === "frame";
  $("triage-frame-figure").hidden = !isFrame;
  $("triage-clip-figure").hidden = isFrame;
  if (isFrame) {
    $("triage-frame-image").src = `/artifacts/${task.source_artifact}`;
  } else {
    const video = $("triage-clip-video");
    video.pause();
    video.src = `/artifacts/${task.source_artifact}`;
    video.load();
  }

  const response = judgment?.triage_response || {};
  document.querySelectorAll('input[name="triage-verdict"]').forEach((input) => {
    input.checked = input.value === response.verdict;
    input.onchange = () => scheduleSave("started");
  });
  $("triage-note").value = response.note || "";
  $("triage-note").oninput = () => scheduleSave("started");
}

function triageResponsePayload() {
  return {
    verdict: document.querySelector('input[name="triage-verdict"]:checked')?.value || "",
    note: $("triage-note").value.trim(),
  };
}

const ERROR_LIST_STORAGE_KEYS = {
  body_part: "annotation-error-mark-body-parts",
  cause: "annotation-error-mark-causes",
};
const ERROR_LIST_STATE_KEYS = {body_part: "errorBodyParts", cause: "errorCauses"};
const ERROR_LIST_SERVER_KEYS = {body_part: "error_mark_body_part_defaults", cause: "error_mark_cause_defaults"};
const FALLBACK_ERROR_LISTS = {
  body_part: [
    {id: "LEFT_SHOULDER", label: "Left shoulder"},
    {id: "RIGHT_SHOULDER", label: "Right shoulder"},
    {id: "LEFT_ELBOW", label: "Left elbow"},
    {id: "RIGHT_ELBOW", label: "Right elbow"},
    {id: "LEFT_WRIST", label: "Left wrist"},
    {id: "RIGHT_WRIST", label: "Right wrist"},
    {id: "LEFT_HIP", label: "Left hip"},
    {id: "RIGHT_HIP", label: "Right hip"},
    {id: "LEFT_KNEE", label: "Left knee"},
    {id: "RIGHT_KNEE", label: "Right knee"},
    {id: "LEFT_ANKLE", label: "Left ankle"},
    {id: "RIGHT_ANKLE", label: "Right ankle"},
  ],
  cause: [
    {id: "occlusion", label: "Occlusion (limb crosses/hides behind body)"},
    {id: "motion_blur", label: "Motion blur"},
    {id: "background_confusion", label: "Background confusion"},
    {id: "suboptimal_clothing", label: "Suboptimal clothing"},
  ],
};
const LEG_LANDMARKS = new Set(["LEFT_KNEE", "RIGHT_KNEE", "LEFT_ANKLE", "RIGHT_ANKLE"]);
function isOutOfScopeLeg(landmark) {
  return isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex]) && LEG_LANDMARKS.has(landmark);
}

function defaultErrorList(kind) {
  const source = (state.data && state.data[ERROR_LIST_SERVER_KEYS[kind]]) || FALLBACK_ERROR_LISTS[kind];
  return source.map((item) => ({...item}));
}

// Both migrations below only replace a device's already-persisted list when
// it's still exactly a prior shipped default, wholesale -- never touching
// anything an annotator has renamed, added, or removed (they can always
// update by hand via the list's Edit toggle instead).

// 2026-08/09: merges a still-default "Right hip"/"Left hip" pair into one
// "Hips" entry, renames a still-default "Torso" label to "Shoulders", and
// (2026-09-03) replaces the whole coarse-region vocabulary with individual
// landmarks matching what the skeleton overlay actually tracks and draws --
// a region id like "right_arm" doesn't map onto one landmark (it covered
// the shoulder, elbow, and wrist together), so this is a wholesale swap
// rather than a per-entry rename. Already-submitted marks keep their old
// ids and keep displaying either way (see timelineRowGroups()).
const LEGACY_COARSE_BODY_PARTS = [
  {id: "right_arm", label: "Right arm"},
  {id: "left_arm", label: "Left arm"},
  {id: "hips", label: "Hips"},
  {id: "right_leg", label: "Right leg"},
  {id: "left_leg", label: "Left leg"},
  {id: "torso", label: "Shoulders"},
  {id: "head", label: "Head"},
  {id: "other", label: "Other"},
];

function migrateBodyPartDefaults(list) {
  const torso = list.find((item) => item.id === "torso");
  if (torso && torso.label === "Torso") torso.label = "Shoulders";
  const rightHip = list.find((item) => item.id === "right_hip" && item.label === "Right hip");
  const leftHip = list.find((item) => item.id === "left_hip" && item.label === "Left hip");
  if (rightHip && leftHip) {
    rightHip.id = "hips";
    rightHip.label = "Hips";
    list.splice(list.indexOf(leftHip), 1);
  }
  const stillAllCoarseDefaults = LEGACY_COARSE_BODY_PARTS.every((legacy) =>
    list.some((item) => item.id === legacy.id && item.label === legacy.label));
  return stillAllCoarseDefaults ? defaultErrorList("body_part") : list;
}

// 2026-09-03: simplified the cause vocabulary to four causes tied to
// recording conditions rather than tracking-specific jargon. Any cause an
// annotator already added on top of the old defaults (not one of the four
// below) is preserved and carried over onto the new list.
const LEGACY_CAUSES = [
  {id: "occlusion", label: "Occlusion (limb crosses/hides behind body)"},
  {id: "out_of_frame", label: "Out of frame"},
  {id: "missing_tracking", label: "Missing / lost tracking"},
  {id: "other", label: "Other"},
];

function migrateCauseDefaults(list) {
  const stillAllLegacyDefaults = LEGACY_CAUSES.every((legacy) =>
    list.some((item) => item.id === legacy.id && item.label === legacy.label));
  if (!stillAllLegacyDefaults) return list;
  const customized = list.filter((item) =>
    !LEGACY_CAUSES.some((legacy) => legacy.id === item.id && legacy.label === item.label));
  return [...defaultErrorList("cause"), ...customized];
}

function loadErrorList(kind) {
  try {
    const stored = JSON.parse(localStorage.getItem(ERROR_LIST_STORAGE_KEYS[kind]) || "null");
    if (Array.isArray(stored) && stored.length) {
      const migrated = kind === "body_part" ? migrateBodyPartDefaults(stored) : migrateCauseDefaults(stored);
      localStorage.setItem(ERROR_LIST_STORAGE_KEYS[kind], JSON.stringify(migrated));
      return migrated;
    }
  } catch (error) { /* ignore malformed storage, fall through to defaults */ }
  return defaultErrorList(kind);
}

function slugifyErrorListEntry(label) {
  return label.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "item";
}

function errorListArray(kind) { return state[ERROR_LIST_STATE_KEYS[kind]]; }
function labelFor(kind, id) { return (errorListArray(kind).find((item) => item.id === id) || {}).label || id; }
function bodyPartLabel(id) { return labelFor("body_part", id); }

function saveErrorList(kind, list) {
  state[ERROR_LIST_STATE_KEYS[kind]] = list;
  localStorage.setItem(ERROR_LIST_STORAGE_KEYS[kind], JSON.stringify(list));
  const task = state.data?.tasks?.[state.taskIndex];
  if (task && isErrorMarkingTask(task)) renderErrorMarkingTimeline();
  if (kind === "cause" && state.activeMarkIndex != null && $("error-mark-dialog").open) {
    renderErrorMarkDialogCauses(state.errorMarks[state.activeMarkIndex]);
  }
}

function openListManager(kind) {
  state.editingListKind = kind;
  $("list-manager-title").textContent = kind === "body_part" ? "Body parts" : "Error causes";
  renderListManager();
  $("list-manager-dialog").showModal();
}

function renderListManager() {
  const kind = state.editingListKind, list = errorListArray(kind);
  $("list-manager-list").innerHTML = list.map((item, index) =>
    `<li class="list-row items-center gap-2">
      <input type="text" class="input input-sm flex-1" aria-label="Entry label" data-list-label-index="${index}" value="${item.label.replace(/"/g, "&quot;")}">
      <button type="button" class="btn btn-xs btn-ghost" data-list-remove-index="${index}">Remove</button>
    </li>`
  ).join("") || `<li class="list-row text-sm text-base-content/60">No entries defined.</li>`;
  $("list-manager-list").querySelectorAll("[data-list-label-index]").forEach((input) => {
    input.onchange = () => {
      const index = Number(input.dataset.listLabelIndex);
      list[index].label = input.value.trim() || list[index].label;
      saveErrorList(kind, list);
    };
  });
  $("list-manager-list").querySelectorAll("[data-list-remove-index]").forEach((button) => {
    button.onclick = () => {
      list.splice(Number(button.dataset.listRemoveIndex), 1);
      saveErrorList(kind, list);
      renderListManager();
    };
  });
}

function errorMarkingVideo() { return $("error-marking-video"); }
function errorMarkingFps() { return Number(state.data.tasks[state.taskIndex].fps) || 30; }
function errorMarkingFrameCount() { return Number(state.data.tasks[state.taskIndex].frame_count) || 0; }
// Seeking to exactly frame/fps lands right on the boundary between that
// frame and the previous one; the browser's own frame timestamps (from its
// container time base) don't line up with our fps assumption precisely
// enough to guarantee that boundary rounds the way we want. Landing at the
// frame's midpoint instead keeps currentTime safely away from both
// neighboring boundaries.
function frameToTime(frame) { return (frame + 0.5) / errorMarkingFps(); }
// state.errorMarkingFrame, not a live read of video.currentTime -- setting
// currentTime is asynchronous in every browser (not just Safari), so a
// fresh read of it shortly after assigning it is not reliably caught up
// yet. Every call site that performs a deliberate seek sets this directly
// (setErrorMarkingFrame()) instead of relying on reading currentTime back;
// video.ontimeupdate reconciles it from the confirmed, actually-decoded
// position for playback or any settling this missed.
function errorMarkingCurrentFrame() { return state.errorMarkingFrame; }
function frameResumeStorageKey(task = state.data?.tasks?.[state.taskIndex]) {
  if (!task || !isFrameUsabilityTask(task)) return null;
  return `annotation-frame-resume:${state.data.experiment_id || ""}:${state.annotator || ""}:${task.task_id}`;
}
function rememberedFrame(task, savedFrame = null) {
  const key = frameResumeStorageKey(task);
  let frame = Number.isInteger(savedFrame) ? savedFrame : 0;
  try {
    const stored = key ? localStorage.getItem(key) : null;
    const localFrame = stored === null ? null : Number(stored);
    if (Number.isInteger(localFrame) && localFrame >= 0) frame = localFrame;
  } catch { /* Saved response remains the cross-device fallback. */ }
  return Math.max(0, Math.min(Math.max(Number(task.frame_count) - 1, 0), frame));
}
function setErrorMarkingFrame(frame) {
  state.errorMarkingFrame = frame;
  const key = frameResumeStorageKey();
  if (key && Number.isInteger(frame) && frame >= 0) {
    try { localStorage.setItem(key, String(frame)); } catch { /* SQLite autosave remains available. */ }
  }
}

function allBadFrameNumbers() {
  const explicitlyUsable = new Set(state.errorMarkingUsableFrames);
  return [...new Set([...state.errorMarkingBadFrames, ...state.errorMarkingAutoBadFrames])]
    .filter((frame) => !explicitlyUsable.has(frame))
    .sort((a, b) => a - b);
}

function isBadFrame(frame = errorMarkingCurrentFrame()) {
  return allBadFrameNumbers().includes(frame);
}

function frameHasSkeleton(frame = errorMarkingCurrentFrame()) {
  return Boolean(state.errorMarkingLandmarks && Object.keys(skeletonFrameLandmarks(frame)).length);
}

function frameUsabilityRating(frame = errorMarkingCurrentFrame()) {
  return state.frameUsabilityLabels[String(frame)] || (state.errorMarkingAutoBadFrames.includes(frame) ? "unusable" : "good");
}

function updateBadFrameControls(frame = errorMarkingCurrentFrame()) {
  if (isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex])) {
    const rating = frameUsabilityRating(frame);
    const bad = rating !== "good";
    $("error-marking-bad-frame-badge").hidden = !bad;
    $("error-marking-bad-frame-badge").textContent = rating === "flawed" ? "flawed tracking" : "unusable frame";
    $("error-marking-no-pose-badge").hidden = !state.errorMarkingAutoBadFrames.includes(frame) || !bad;
    $("error-marking-video-wrap").classList.toggle("frame-marked-bad", rating === "unusable");
    $("error-marking-video-wrap").classList.toggle("frame-marked-flawed", rating === "flawed");
    updateFrameUsabilityControls(frame);
    return;
  }
  if (isVideoRatingOnlyTask(state.data?.tasks?.[state.taskIndex])) {
    $("error-marking-bad-frame-badge").hidden = true;
    $("error-marking-no-pose-badge").hidden = true;
    $("error-marking-video-wrap").classList.remove("frame-marked-bad");
    $("error-marking-video-wrap").classList.remove("frame-marked-flawed");
    return;
  }
  const bad = isBadFrame(frame);
  const automatic = state.errorMarkingAutoBadFrames.includes(frame);
  const manuallyConfirmed = state.errorMarkingBadFrames.includes(frame);
  const explicitlyUsable = state.errorMarkingUsableFrames.includes(frame);
  const toggle = $("error-marking-frame-usability-toggle");
  setSegmentedControlState(toggle, bad ? "unusable" : "good");
  const usableButton = $("error-marking-mark-frame-good");
  if (usableButton) {
    usableButton.title = automatic && explicitlyUsable
      ? "Manually override the automatic unusable-frame signal."
      : "Record that the current frame is usable.";
  }
  const unusableButton = $("error-marking-mark-frame-unusable");
  if (unusableButton) {
    unusableButton.title = automatic && !manuallyConfirmed
      ? "Missing tracking marked this frame automatically. Click to confirm it manually."
      : "Record that the current frame is unusable.";
  }
  const badge = $("error-marking-bad-frame-badge");
  if (badge) badge.hidden = !bad;
  const noPoseBadge = $("error-marking-no-pose-badge");
  if (noPoseBadge) noPoseBadge.hidden = !bad || frameHasSkeleton(frame);
  $("error-marking-video-wrap")?.classList.toggle("frame-marked-bad", bad);
  $("error-marking-video-wrap")?.classList.remove("frame-marked-flawed");
}

function updateFrameUsabilityControls(frame = errorMarkingCurrentFrame()) {
  const rating = frameUsabilityRating(frame);
  setSegmentedControlState($("error-marking-frame-usability-toggle"), rating);
  state.errorMarkingBadFrames = Object.entries(state.frameUsabilityLabels).filter(([, label]) => label === "flawed" || label === "unusable").map(([number]) => Number(number));
  state.errorMarkingUsableFrames = Object.entries(state.frameUsabilityLabels).filter(([, label]) => label === "good").map(([number]) => Number(number));
  updateFrameMobileControls();
}

function markFrameUsability(frame, rating) {
  if (!isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex])) return;
  stopErrorMarkingReplay();
  errorMarkingVideo().pause();
  state.frameUsabilityLabels[String(frame)] = rating;
  updateBadFrameControls(frame);
  renderSkeletonOverlay(frame);
  renderErrorMarkingTimeline();
  scheduleSave("started", 100);
}

function saveBadFrameState(frame = errorMarkingCurrentFrame()) {
  state.errorMarkingNoErrorsConfirmed = false;
  updateBadFrameControls(frame);
  scheduleSave("started", 100);
  if (state.errorMarkingVisualRefreshHandle) clearTimeout(state.errorMarkingVisualRefreshHandle);
  state.errorMarkingVisualRefreshHandle = setTimeout(() => {
    state.errorMarkingVisualRefreshHandle = null;
    if (!state.data?.tasks?.[state.taskIndex] || !isErrorMarkingTask(state.data.tasks[state.taskIndex])) return;
    renderErrorMarkingTimeline();
    renderSkeletonOverlay(errorMarkingCurrentFrame());
  }, 0);
}

function markFrameUsable(frame = errorMarkingCurrentFrame()) {
  state.errorMarkingBadFrames = state.errorMarkingBadFrames.filter((candidate) => candidate !== frame);
  if (!state.errorMarkingUsableFrames.includes(frame)) state.errorMarkingUsableFrames.push(frame);
  state.errorMarkingUsableFrames.sort((a, b) => a - b);
  saveBadFrameState(frame);
}

function markFrameUnusable(frame = errorMarkingCurrentFrame()) {
  state.errorMarkingUsableFrames = state.errorMarkingUsableFrames.filter((candidate) => candidate !== frame);
  if (!state.errorMarkingBadFrames.includes(frame)) state.errorMarkingBadFrames.push(frame);
  state.errorMarkingBadFrames.sort((a, b) => a - b);
  saveBadFrameState(frame);
}

function toggleBadFrame(frame = errorMarkingCurrentFrame()) {
  if (state.errorMarkingBadFrames.includes(frame)) markFrameUsable(frame);
  else markFrameUnusable(frame);
}

function toggleBadFrameRange(start, end) {
  const frames = Array.from({length: end - start + 1}, (_, index) => start + index);
  const allManuallyConfirmed = frames.every((frame) => state.errorMarkingBadFrames.includes(frame));
  if (allManuallyConfirmed) frames.forEach((frame) => markFrameUsable(frame));
  else frames.forEach((frame) => markFrameUnusable(frame));
}

function hasFiniteTrackingPoint(point) {
  return Array.isArray(point) && point.length >= 2 && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1]));
}

function missingTrackingFrames(data, task) {
  const frameCount = Number(task?.frame_count) || 0;
  const landmarks = data?.landmarks || [];
  const frames = data?.frames || [];
  const missing = [];
  for (let frame = 0; frame < frameCount; frame += 1) {
    const frameData = frames[frame];
    const names = landmarks.length ? landmarks : Object.keys(frameData || {});
    const hasTracking = frameData && typeof frameData === "object" && names.some((landmark) => hasFiniteTrackingPoint(frameData[landmark]));
    if (!hasTracking) missing.push(frame);
  }
  return missing;
}

function refreshAutomaticBadFrames(data, task) {
  const next = missingTrackingFrames(data, task);
  const changed = next.length !== state.errorMarkingAutoBadFrames.length || next.some((frame, index) => frame !== state.errorMarkingAutoBadFrames[index]);
  state.errorMarkingAutoBadFrames = next;
  return changed;
}

function updateVideoUnusableControls() {
  if (isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex])) {
    $("error-marking-video-unusable-reason-wrap").hidden = true;
    $("error-marking-screen").classList.remove("video-marked-unusable");
    $("error-marking-timeline").classList.remove("joint-marking-disabled");
    return;
  }
  const unusable = state.errorMarkingVideoUnusable;
  const reasonField = $("error-marking-video-unusable-reason");
  if (reasonField) reasonField.value = state.errorMarkingVideoUnusableReason;
  const reasonWrap = $("error-marking-video-unusable-reason-wrap");
  if (reasonWrap) reasonWrap.hidden = !unusable;
  const screen = $("error-marking-screen");
  if (screen) screen.classList.toggle("video-marked-unusable", unusable && !isVideoRatingOnlyTask(state.data?.tasks?.[state.taskIndex]));
  const unusableButton = $("error-marking-mark-frame-unusable");
  if (unusableButton) unusableButton.disabled = false;
  const usableButton = $("error-marking-mark-frame-usable");
  if (usableButton) usableButton.disabled = false;
  const usabilityToggle = $("error-marking-usability-toggle");
  setSegmentedControlState(usabilityToggle, state.errorMarkingVideoUsabilityRating || "");
  const descriptions = isVideoRatingOnlyTask(state.data?.tasks?.[state.taskIndex]) ? POSE_TRACKING_DESCRIPTIONS : VIDEO_USABILITY_DESCRIPTIONS;
  const description = $("error-marking-usability-description");
  if (description) description.textContent = descriptions[state.errorMarkingVideoUsabilityRating] || "Choose a rating for this video.";
  const timeline = $("error-marking-timeline");
  if (timeline) timeline.classList.toggle("joint-marking-disabled", unusable && !isVideoRatingOnlyTask(state.data?.tasks?.[state.taskIndex]));
}

function syncErrorMarkingNote(event) {
  const value = event.target.value;
  state.errorMarkingVideoUnusableReason = value;
  const reasonField = $("error-marking-video-unusable-reason");
  const noteField = $("error-marking-note");
  if (reasonField && reasonField.value !== value) reasonField.value = value;
  if (noteField && noteField.value !== value) noteField.value = value;
  scheduleSave("started");
}

function setErrorMarkingVideoUsabilityRating(rating) {
  state.errorMarkingVideoUsabilityRating = rating;
  state.errorMarkingVideoUnusable = rating === "unusable";
  state.errorMarkingNoErrorsConfirmed = false;
  if (state.errorMarkingVideoUnusable) state.editingBodyParts = false;
  updateVideoUnusableControls();
  renderErrorMarkingTimeline();
  renderSkeletonOverlay();
  scheduleSave("started");
}

function markForPartAtFrame(partId, frame) {
  return state.errorMarks.find((mark) => mark.body_part === partId && frame >= mark.start_frame && frame <= mark.end_frame) || null;
}

// Creates a mark covering just `frame` for `bodyPart`, unless one already
// exists there -- in which case an existing mark ending at frame-1 and/or
// starting at frame+1 is extended (and the two merged, if both exist)
// instead of a new, separately-tracked mark being created. Used when
// clicking/dragging a landmark on the skeleton overlay creates or extends
// a mark at the frame it was clicked/dragged on.
function ensureMarkAtFrame(bodyPart, frame) {
  const existing = markForPartAtFrame(bodyPart, frame);
  if (existing) return existing;
  const before = state.errorMarks.find((mark) => mark.body_part === bodyPart && mark.end_frame === frame - 1);
  const after = state.errorMarks.find((mark) => mark.body_part === bodyPart && mark.start_frame === frame + 1);
  let mark;
  if (before && after) {
    before.end_frame = after.end_frame;
    before.causes = [...new Set([...before.causes, ...after.causes])];
    before.positions = {...after.positions, ...before.positions};
    if (!before.note && after.note) before.note = after.note;
    state.errorMarks.splice(state.errorMarks.indexOf(after), 1);
    mark = before;
  } else if (before) {
    before.end_frame = frame;
    mark = before;
  } else if (after) {
    after.start_frame = frame;
    mark = after;
  } else {
    mark = {body_part: bodyPart, start_frame: frame, end_frame: frame, causes: [], note: "", positions: {}};
    state.errorMarks.push(mark);
  }
  state.errorMarkingNoErrorsConfirmed = false;
  return mark;
}

function timelinePlayheadLeftPercent(frame = errorMarkingCurrentFrame()) {
  const frameCount = Math.max(errorMarkingFrameCount() - 1, 1);
  return Math.min((frame / frameCount) * 100, 100);
}

function updateTimelinePlayhead(frame = errorMarkingCurrentFrame()) {
  const playhead = $("error-marking-timeline").querySelector(".timeline-playhead");
  if (playhead) playhead.style.left = `${timelinePlayheadLeftPercent(frame)}%`;
}

// Takes the frame explicitly (rather than always re-deriving it from
// video.currentTime) so a caller that just performed a deliberate seek can
// pass the frame it asked for directly. Reading currentTime back
// synchronously right after assigning it is not reliably up to date across
// browsers (most visibly on Safari), which showed up as the skeleton
// overlay briefly -- or, on a slow decode, not so briefly -- rendering a
// neighboring frame's positions against the frame actually on screen.
// video.ontimeupdate still calls this with no argument for playback/settled
// updates where there's no "just asked for" frame to hand it.
function updateErrorMarkingFrameIndicator(frame = errorMarkingCurrentFrame()) {
  const total = errorMarkingFrameCount();
  $("error-marking-frame-indicator").textContent = `frame ${frame} / ${Math.max(total - 1, 0)}`;
  const scrubber = $("error-marking-scrubber");
  if (scrubber && document.activeElement !== scrubber) scrubber.value = frame;
  const mobileScrubber = $("frame-mobile-scrubber");
  if (mobileScrubber) {
    mobileScrubber.max = String(Math.max(total - 1, 0));
    if (document.activeElement !== mobileScrubber) mobileScrubber.value = frame;
  }
  updateTimelinePlayhead(frame);
  updateBadFrameControls(frame);
  updateFrameMobileControls();
  renderSkeletonOverlay(frame);
  updateFrameViewTransform();
}

function hasFrameCorrection(frame = errorMarkingCurrentFrame()) {
  return state.errorMarks.some((mark) => Object.prototype.hasOwnProperty.call(mark.positions || {}, String(frame)));
}

function updateFrameMobileControls() {
  const bar = $("frame-mobile-bar");
  if (!bar || !isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex])) return;
  const lastFrame = Math.max(errorMarkingFrameCount() - 1, 0);
  const atEnd = errorMarkingCurrentFrame() >= lastFrame;
  const forward = $("frame-mobile-forward");
  forward.textContent = atEnd ? "Complete" : "›";
  forward.setAttribute("aria-label", atEnd ? "Complete case" : "Next frame");
  forward.classList.toggle("btn-success", atEnd);
  const rating = frameUsabilityRating();
  const unusable = $("frame-mobile-unusable"), usable = $("frame-mobile-usable");
  unusable.classList.toggle("is-selected", rating === "unusable");
  usable.classList.toggle("is-selected", rating !== "unusable");
  const adjusted = hasFrameCorrection();
  usable.classList.toggle("is-correctable", adjusted);
  usable.textContent = "✓";
  usable.setAttribute("aria-label", adjusted ? "Mark frame correctable; skeleton adjusted" : "Mark frame perfect; skeleton unchanged");
  usable.title = adjusted ? "Correctable — skeleton adjusted" : "Perfect — skeleton unchanged";
  unusable.setAttribute("aria-pressed", String(rating === "unusable"));
  usable.setAttribute("aria-pressed", String(rating !== "unusable"));
  const play = $("frame-mobile-play");
  const playing = Boolean(state.errorMarkingReplayHandle && state.errorMarkingReplayDirection === 1);
  play.textContent = playing ? "Ⅱ" : "▶";
  play.setAttribute("aria-pressed", String(playing));
  play.setAttribute("aria-label", playing ? "Pause slow playback" : "Play slowly");
  bar.hidden = !(window.matchMedia("(max-width: 700px)").matches);
  $("actions").classList.toggle("frame-mobile-hidden", bar.hidden === false);
  document.body.classList.toggle("frame-usability-task-active", isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex]));
}

function updateFrameViewTransform() {
  const video = $("error-marking-video");
  const overlay = $("error-marking-overlay");
  const wrap = $("error-marking-video-wrap");
  if (!video || !overlay || !wrap) return;
  const rect = wrap.getBoundingClientRect();
  const aspect = video.videoWidth && video.videoHeight ? video.videoWidth / video.videoHeight : 16 / 9;
  const fitScale = Math.min(rect.width / aspect, rect.height);
  const contentWidth = fitScale * aspect;
  const contentHeight = fitScale;
  const autoZoom = () => {
    if (!rect.width || !rect.height) return 1;
    const targetHeight = rect.height * .8;
    const fittedImageHeight = fitScale / (1 + 2 * errorMarkingCanvasBufferRatio());
    return Math.max(1, Math.min(3, targetHeight / Math.max(1, fittedImageHeight)));
  };
  const zoom = state.frameViewZoomMode === "auto"
    ? (state.frameViewAutoZoomOverride ?? autoZoom())
    : state.frameViewZoom;
  state.frameViewZoom = zoom;
  const geometryKey = `${Math.round(rect.width)}x${Math.round(rect.height)}:${zoom.toFixed(3)}`;
  if (geometryKey !== state.frameViewGeometryKey) state.frameViewForceRecenter = true;
  if (state.frameViewZoomMode === "auto" && isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex])
      && state.frameViewGesturePanFrame !== errorMarkingCurrentFrame()) {
    const frame = errorMarkingCurrentFrame();
    const anchor = frameSubjectAnchor(frame);
    if (anchor) {
      let priorFrame = state.frameViewLastFollowFrame;
      if (state.frameViewForceRecenter) {
        state.frameViewAnchorHistory = [];
        state.frameViewLastFollowFrame = null;
        priorFrame = null;
      }
      if (frame !== priorFrame) {
        if (priorFrame == null || Math.abs(frame - priorFrame) > 8) state.frameViewAnchorHistory = [];
        state.frameViewAnchorHistory.push({frame, point:anchor});
        state.frameViewAnchorHistory = state.frameViewAnchorHistory.slice(-5);
      }
      const x = median(state.frameViewAnchorHistory.map(({point}) => point[0]));
      const y = median(state.frameViewAnchorHistory.map(({point}) => point[1]));
      const dimensions = state.errorMarkingLandmarks?.source_dimensions || {};
      const sourceWidth = Number(dimensions.width) || video.videoWidth;
      const sourceHeight = Number(dimensions.height) || video.videoHeight;
      if (sourceWidth > 0 && sourceHeight > 0) {
        const effectiveZoom = zoom / (1 + 2 * errorMarkingCanvasBufferRatio());
        const desiredX = -(x / sourceWidth - .5) * contentWidth * effectiveZoom;
        const desiredY = -(y / sourceHeight - .5) * contentHeight * effectiveZoom;
        const sameFrameSameGeometry = frame === priorFrame && geometryKey === state.frameViewGeometryKey;
        if (!sameFrameSameGeometry || state.frameViewForceRecenter) {
          const adjacent = priorFrame != null && Math.abs(frame - priorFrame) <= 8;
          const blend = state.frameViewForceRecenter ? 1 : adjacent ? .38 : 1;
          state.frameViewPanX += (desiredX - state.frameViewPanX) * blend;
          state.frameViewPanY += (desiredY - state.frameViewPanY) * blend;
          state.frameViewLastFollowFrame = frame;
        }
        state.frameViewGesturePanFrame = null;
        state.frameViewForceRecenter = false;
      }
    }
    // Missing pose data holds the last useful framing.
  }
  const effectiveZoom = zoom / (1 + 2 * errorMarkingCanvasBufferRatio());
  const maxX = Math.max(0, (contentWidth * effectiveZoom - rect.width) / 2);
  const maxY = Math.max(0, (contentHeight * effectiveZoom - rect.height) / 2);
  state.frameViewPanX = Math.max(-maxX, Math.min(maxX, state.frameViewPanX));
  state.frameViewPanY = Math.max(-maxY, Math.min(maxY, state.frameViewPanY));
  const videoScale = zoom / (1 + 2 * errorMarkingCanvasBufferRatio());
  const transform = `translate(${state.frameViewPanX}px, ${state.frameViewPanY}px) scale(${zoom})`;
  video.style.transform = `translate(${state.frameViewPanX}px, ${state.frameViewPanY}px) scale(${videoScale})`;
  overlay.style.transform = transform;
  state.frameViewGeometryKey = geometryKey;
  wrap.classList.toggle("frame-pan-active", state.frameViewPanEnabled);
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// Uses raw pose shoulders and hips so dragging a corrected joint cannot move
// the viewport. Requiring multiple valid torso points rejects sparse frames.
function frameSubjectAnchor(frame) {
  const data = state.errorMarkingLandmarks;
  const points = data?.frames?.[frame];
  if (!points) return null;
  const dimensions = data.source_dimensions || {};
  const width = Number(dimensions.width), height = Number(dimensions.height);
  if (!(width > 0 && height > 0)) return null;
  const torsoNames = (data.landmarks || []).filter((name) => /shoulder|hip/i.test(name));
  const torso = torsoNames.map((name) => points[name]).filter((point) =>
    Array.isArray(point) && point.length >= 2 && point.every(Number.isFinite)
      && point[0] >= -.02 * width && point[0] <= 1.02 * width
      && point[1] >= -.02 * height && point[1] <= 1.02 * height);
  return torso.length >= 2 ? [median(torso.map(([x]) => x)), median(torso.map(([, y]) => y))] : null;
}

function setFrameViewZoom(value) {
  state.frameViewZoomMode = value === "auto" ? "auto" : "manual";
  state.frameViewAutoZoomOverride = null;
  state.frameViewLastFollowFrame = null;
  state.frameViewGesturePanFrame = null;
  state.frameViewForceRecenter = false;
  state.frameViewAnchorHistory = [];
  if (state.frameViewZoomMode === "auto") {
    state.frameViewPanEnabled = false;
    $("frame-mobile-pan").setAttribute("aria-pressed", "false");
    $("frame-mobile-pan").textContent = "Enable pan";
    $("frame-mobile-pan").setAttribute("aria-label", "Enable video panning");
  }
  state.frameViewZoom = value === "auto" ? 1 : (Number(value) || 1);
  if (state.frameViewZoom <= 1) {
    state.frameViewPanX = 0;
    state.frameViewPanY = 0;
    state.frameViewPanEnabled = false;
    $("frame-mobile-pan").setAttribute("aria-pressed", "false");
    $("frame-mobile-pan").textContent = "Enable pan";
    $("frame-mobile-pan").setAttribute("aria-label", "Enable video panning");
  }
  updateFrameViewTransform();
}

function attachFramePanHandlers() {
  const wrap = $("error-marking-video-wrap");
  if (!wrap || wrap.dataset.panHandlersAttached) return;
  wrap.dataset.panHandlersAttached = "1";
  const active = new Map();
  let pointer = null;
  let pinch = null;
  wrap.addEventListener("pointerdown", (event) => {
    if (!isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex])) return;
    active.set(event.pointerId, {x: event.clientX, y: event.clientY, type:event.pointerType});
    if (active.size === 2 && activeTouchPointers(active)) {
      state.frameViewPanGestureActive = true;
      state.cancelSkeletonLandmarkDrag?.();
      const midpoint = pointerMidpoint(active);
      pointer = {midpoint, x: state.frameViewPanX, y: state.frameViewPanY};
      const [first, second] = [...active.values()];
      pinch = {distance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)), zoom: state.frameViewZoom, midpoint};
      state.frameViewGesturePanFrame = errorMarkingCurrentFrame();
      event.preventDefault();
      active.forEach((_, id) => { try { wrap.setPointerCapture(id); } catch {} });
    } else if (state.frameViewPanEnabled && !event.target.closest(".skeleton-landmark")) {
      pointer = {id: event.pointerId, midpoint: {x:event.clientX,y:event.clientY}, x:state.frameViewPanX, y:state.frameViewPanY};
      event.preventDefault();
      wrap.setPointerCapture(event.pointerId);
    }
  });
  wrap.addEventListener("pointermove", (event) => {
    if (event.pointerType === "touch" && state.frameViewPanGestureActive) return;
    if (active.has(event.pointerId)) active.set(event.pointerId, {x:event.clientX,y:event.clientY,type:event.pointerType});
    if (!pointer || (active.size > 1 ? !active.has(event.pointerId) : event.pointerId !== pointer.id)) return;
    const midpoint = active.size > 1 ? pointerMidpoint(active) : {x:event.clientX,y:event.clientY};
    if (active.size > 1) {
      event.preventDefault();
      const [first, second] = [...active.values()];
      const distance = Math.max(1, Math.hypot(second.x - first.x, second.y - first.y));
      if (pinch && pinch.distance > 0) {
        const rect = wrap.getBoundingClientRect();
        const nextZoom = Math.max(1, Math.min(4, pinch.zoom * distance / pinch.distance));
        const ratio = nextZoom / Math.max(.001, pinch.zoom);
        state.frameViewZoom = nextZoom;
        if (state.frameViewZoomMode === "auto") state.frameViewAutoZoomOverride = nextZoom;
        state.frameViewPanX = midpoint.x - (rect.left + rect.width / 2)
          - (pinch.midpoint.x - (rect.left + rect.width / 2) - pointer.x) * ratio;
        state.frameViewPanY = midpoint.y - (rect.top + rect.height / 2)
          - (pinch.midpoint.y - (rect.top + rect.height / 2) - pointer.y) * ratio;
      } else {
        state.frameViewPanX = pointer.x + midpoint.x - pointer.midpoint.x;
        state.frameViewPanY = pointer.y + midpoint.y - pointer.midpoint.y;
      }
    } else {
      state.frameViewPanX = pointer.x + midpoint.x - pointer.midpoint.x;
      state.frameViewPanY = pointer.y + midpoint.y - pointer.midpoint.y;
    }
    updateFrameViewTransform();
  });
  const finish = (event) => {
    active.delete(event.pointerId);
    if (active.size < 2) pinch = null;
    if (active.size < 2) state.frameViewPanGestureActive = false;
    if (active.size < 2 && pointer && pointer.id === event.pointerId) pointer = null;
    if (!active.size) pointer = null;
  };
  wrap.addEventListener("pointerup", finish);
  wrap.addEventListener("pointercancel", finish);
  let touchPan = null;
  wrap.addEventListener("touchstart", (event) => {
    if (event.touches.length < 2 || !isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex])) return;
    event.preventDefault();
    state.cancelSkeletonLandmarkDrag?.();
    state.frameViewPanGestureActive = true;
    state.frameViewGesturePanFrame = errorMarkingCurrentFrame();
    state.frameViewForceRecenter = false;
    const midpoint = touchMidpoint(event.touches);
    const distance = Math.max(1, Math.hypot(event.touches[1].clientX - event.touches[0].clientX, event.touches[1].clientY - event.touches[0].clientY));
    touchPan = {midpoint, distance, zoom:state.frameViewZoom, x:state.frameViewPanX, y:state.frameViewPanY};
  }, {passive:false});
  wrap.addEventListener("touchmove", (event) => {
    if (!touchPan || event.touches.length < 2) return;
    event.preventDefault();
    const midpoint = touchMidpoint(event.touches);
    const distance = Math.max(1, Math.hypot(event.touches[1].clientX - event.touches[0].clientX, event.touches[1].clientY - event.touches[0].clientY));
    const nextZoom = Math.max(1, Math.min(4, touchPan.zoom * distance / touchPan.distance));
    const ratio = nextZoom / Math.max(.001, touchPan.zoom);
    state.frameViewZoom = nextZoom;
    if (state.frameViewZoomMode === "auto") state.frameViewAutoZoomOverride = nextZoom;
    const rect = wrap.getBoundingClientRect();
    state.frameViewPanX = midpoint.x - (rect.left + rect.width / 2)
      - (touchPan.midpoint.x - (rect.left + rect.width / 2) - touchPan.x) * ratio;
    state.frameViewPanY = midpoint.y - (rect.top + rect.height / 2)
      - (touchPan.midpoint.y - (rect.top + rect.height / 2) - touchPan.y) * ratio;
    updateFrameViewTransform();
  }, {passive:false});
  const finishTouchPan = (event) => {
    if (event.touches.length < 2) {
      touchPan = null;
      state.frameViewPanGestureActive = false;
    }
  };
  wrap.addEventListener("touchend", finishTouchPan, {passive:true});
  wrap.addEventListener("touchcancel", finishTouchPan, {passive:true});
}

function activeTouchPointers(points) {
  return [...points.values()].every((point) => point.type === "touch");
}

function pointerMidpoint(points) {
  const values = [...points.values()];
  if (values.length < 2) return values[0] || {x:0,y:0};
  return {x:(values[0].x + values[1].x) / 2, y:(values[0].y + values[1].y) / 2};
}

function touchMidpoint(touches) {
  return {x:(touches[0].clientX + touches[1].clientX) / 2, y:(touches[0].clientY + touches[1].clientY) / 2};
}

function placeFrameMobileTools() {
  const join = document.querySelector(".error-marking-controls-bar .step-buttons-join");
  const extras = $("frame-mobile-extra-controls");
  if (!join || !extras) return;
  const mobile = window.matchMedia("(max-width: 700px)").matches && isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex]);
  const taskPicker = $("task-picker-label");
  const taskPickerTarget = mobile ? $("frame-mobile-navigation-controls") : document.querySelector(".progress-card");
  if (taskPicker && taskPickerTarget && taskPicker.parentElement !== taskPickerTarget) taskPickerTarget.append(taskPicker);
  const userMenu = $("user-menu");
  const accountTarget = mobile ? $("frame-mobile-account-controls") : document.querySelector("header .navbar-end");
  if (userMenu && accountTarget && userMenu.parentElement !== accountTarget) accountTarget.append(userMenu);
  const mobileOrder = ["error-marking-skip-start", "error-marking-step-back-5", "error-marking-replay-backwards", "error-marking-fps-select", "error-marking-step-forward-5"];
  mobileOrder.forEach((id) => {
    const control = $(id);
    if (mobile && control.parentElement !== extras) extras.append(control);
  });
  if (!mobile) ["error-marking-skip-start", "error-marking-step-back-5", "error-marking-step-back-1", "error-marking-replay-backwards", "error-marking-fps-select", "error-marking-replay", "error-marking-step-forward-1", "error-marking-step-forward-5"].forEach((id) => join.append($(id)));
}

function stepErrorMarkingVideo(deltaFrames) {
  stopErrorMarkingReplay();
  const video = errorMarkingVideo(), frameCount = errorMarkingFrameCount();
  const maxFrame = Math.max(frameCount - 1, 0);
  video.pause();
  const targetFrame = Math.max(0, Math.min(maxFrame, errorMarkingCurrentFrame() + deltaFrames));
  state.frameViewForceRecenter = true;
  setErrorMarkingFrame(targetFrame);
  video.currentTime = frameToTime(targetFrame);
  updateErrorMarkingFrameIndicator(targetFrame);
}

// Steps a video through every frame of the current error_marking task at a
// fixed real-time rate, holding each frame long enough to actually see it --
// deliberately not native playbackRate, which can't reliably hold on
// discrete frames at these speeds across browsers. `direction` selects
// forward (1) or backwards (-1) traversal. `onFrame` updates
// whatever overlay/UI is paired with `video` (the live screen's timeline
// and skeleton overlay, or the review dialog's own overlay). Returns a
// handle whose stop() cancels the remaining steps; callers own tearing it
// down (on manual interaction, task change, or dialog close).
function startFrameReplay(video, onFrame, fps, startFrame = 0, onFinish = () => {}, direction = 1) {
  video.pause();
  const maxFrame = Math.max(errorMarkingFrameCount() - 1, 0);
  let frame = Math.max(0, Math.min(startFrame, maxFrame));
  let stopped = false;
  const showFrame = () => { video.currentTime = frameToTime(frame); onFrame(frame); };
  showFrame();
  const timer = setInterval(() => {
    if ((direction > 0 && frame >= maxFrame) || (direction < 0 && frame <= 0)) {
      clearInterval(timer);
      stopped = true;
      onFinish();
      return;
    }
    frame += direction;
    showFrame();
  }, 1000 / fps);
  return {stop: () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
  }};
}

function setErrorMarkingReplayPlaying(playing) {
  const button = $("error-marking-replay");
  button.textContent = playing ? "⏸ Pause" : "▶ Play";
  button.setAttribute("aria-pressed", String(playing));
}

function setErrorMarkingReplayBackwardsPlaying(playing) {
  const button = $("error-marking-replay-backwards");
  button.textContent = playing ? "⏸ Pause" : "◀ Rewind";
  button.setAttribute("aria-label", playing ? "Pause rewind playback" : "Rewind");
  button.setAttribute("aria-pressed", String(playing));
}

function setErrorMarkingReviewReplayPlaying(playing) {
  const button = $("error-marking-review-replay");
  button.textContent = playing ? "⏸ Pause" : "▶ Replay";
  button.setAttribute("aria-pressed", String(playing));
}

// The dropdown's plain numbers (1/2/4/8) are a fixed frame-stepping rate in
// frames/sec, decoupled from the clip's own frame rate -- useful for a
// quick, deliberately choppy scrub through every frame. A "0.5x"/"1x" value
// is instead a fraction of the clip's *own* fps (errorMarkingFps()), so it
// reads as slow motion or true real-time playback rather than a fixed step rate.
function errorMarkingReplayFps() {
  const raw = $("error-marking-fps-select").value;
  if (raw.endsWith("x")) return parseFloat(raw) * errorMarkingFps();
  return Number(raw);
}

function stopErrorMarkingReplay() {
  const wasPlaying = state.errorMarkingReplayDirection != null;
  if (state.errorMarkingReplayHandle) { state.errorMarkingReplayHandle.stop(); state.errorMarkingReplayHandle = null; }
  state.errorMarkingReplayDirection = null;
  setErrorMarkingReplayPlaying(false);
  setErrorMarkingReplayBackwardsPlaying(false);
  if (wasPlaying) renderSkeletonOverlay();
}

function replayErrorMarking() {
  stopErrorMarkingReplay();
  const maxFrame = Math.max(errorMarkingFrameCount() - 1, 0);
  const startFrame = errorMarkingCurrentFrame() >= maxFrame ? 0 : errorMarkingCurrentFrame();
  state.errorMarkingReplayDirection = 1;
  setErrorMarkingReplayPlaying(true);
  state.errorMarkingReplayHandle = startFrameReplay(errorMarkingVideo(), (frame) => {
    setErrorMarkingFrame(frame);
    updateErrorMarkingFrameIndicator(frame);
  }, errorMarkingReplayFps(), startFrame, () => {
    state.errorMarkingReplayHandle = null;
    state.errorMarkingReplayDirection = null;
    setErrorMarkingReplayPlaying(false);
    renderSkeletonOverlay();
  });
}

function replayErrorMarkingBackwards() {
  stopErrorMarkingReplay();
  const maxFrame = Math.max(errorMarkingFrameCount() - 1, 0);
  const startFrame = errorMarkingCurrentFrame() <= 0 ? maxFrame : errorMarkingCurrentFrame();
  state.errorMarkingReplayDirection = -1;
  setErrorMarkingReplayBackwardsPlaying(true);
  state.errorMarkingReplayHandle = startFrameReplay(errorMarkingVideo(), (frame) => {
    setErrorMarkingFrame(frame);
    updateErrorMarkingFrameIndicator(frame);
  }, errorMarkingReplayFps(), startFrame, () => {
    state.errorMarkingReplayHandle = null;
    state.errorMarkingReplayDirection = null;
    setErrorMarkingReplayBackwardsPlaying(false);
    renderSkeletonOverlay();
  }, -1);
}

function stopErrorMarkingReviewReplay() {
  if (state.errorMarkingReviewReplayHandle) { state.errorMarkingReviewReplayHandle.stop(); state.errorMarkingReviewReplayHandle = null; }
  setErrorMarkingReviewReplayPlaying(false);
}

function replayErrorMarkingReview() {
  stopErrorMarkingReviewReplay();
  const maxFrame = Math.max(errorMarkingFrameCount() - 1, 0);
  const startFrame = state.errorMarkingReviewFrame >= maxFrame ? 0 : state.errorMarkingReviewFrame;
  $("error-marking-review-status").textContent = "Replaying at 2 fps…";
  setErrorMarkingReviewReplayPlaying(true);
  state.errorMarkingReviewReplayHandle = startFrameReplay($("error-marking-review-video"), (frame) => {
    state.errorMarkingReviewFrame = frame;
    renderOverlayInto($("error-marking-review-overlay"), state.errorMarkingLandmarks, frame);
  }, 2, startFrame, () => {
    state.errorMarkingReviewReplayHandle = null;
    setErrorMarkingReviewReplayPlaying(false);
    $("error-marking-review-status").textContent = "Replay complete.";
  });
}

// Shown when "Done annotating" is clicked on an error_marking task with
// unreviewed changes (see scheduleSave()'s errorMarkingDirty tracking).
// Reuses the current task's already-loaded landmarks data but plays a
// second, independent <video> so the live screen's own video/scrubber are
// untouched underneath -- closing without completing leaves everything
// exactly as it was.
function openErrorMarkingReviewDialog() {
  const task = state.data.tasks[state.taskIndex];
  const video = $("error-marking-review-video");
  const disposition = $("error-marking-review-disposition");
  $("error-marking-review-title").textContent = state.errorMarkingVideoUnusable ? "Review video disposition" : "Review your marks";
  if (disposition) {
    disposition.hidden = !state.errorMarkingVideoUnusable;
    disposition.textContent = state.errorMarkingVideoUnusable ? `Video marked too flawed to annotate: ${state.errorMarkingVideoUnusableReason.trim() || "reason not yet provided"}` : "";
  }
  state.errorMarkingReviewFrame = 0;
  video.src = `/artifacts/${task.source_artifact}`;
  video.load();
  video.onloadeddata = replayErrorMarkingReview;
  $("error-marking-review-dialog").showModal();
  state.errorMarkingDirty = false;
}

function closeErrorMarkingReviewDialog() {
  stopErrorMarkingReviewReplay();
  $("error-marking-review-dialog").close();
}

const CAUSE_COLOR_PALETTE = ["#e0578c", "#3a8fd9", "#e0a63a", "#5fb87a", "#9366c9", "#e0653a", "#3ab7b0", "#b08c3a"];
const UNSET_CAUSE_COLOR = "#9aa39e";

function causeColor(causeId) {
  const index = errorListArray("cause").findIndex((cause) => cause.id === causeId);
  return CAUSE_COLOR_PALETTE[(index < 0 ? 0 : index) % CAUSE_COLOR_PALETTE.length];
}

function markBackground(mark) {
  if (!mark.causes.length) return UNSET_CAUSE_COLOR;
  if (mark.causes.length === 1) return causeColor(mark.causes[0]);
  const stripe = 10;
  const stops = mark.causes.map(causeColor).flatMap((color, index) => [`${color} ${index * stripe}px`, `${color} ${(index + 1) * stripe}px`]);
  return `repeating-linear-gradient(45deg, ${stops.join(", ")})`;
}

// A solid-color equivalent of markBackground(), for SVG fill/stroke
// attributes (which can't take a CSS gradient like a multi-cause mark's
// timeline color): the first attributed cause's color stands in for all of
// them, which the mark's own popup still shows in full.
function markPointColor(mark) {
  return mark.causes.length ? causeColor(mark.causes[0]) : UNSET_CAUSE_COLOR;
}

function timelineRowGroups() {
  if (isVideoUsabilityTriageTask(state.data?.tasks?.[state.taskIndex])) return [];
  if (isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex])) {
    const names = state.errorMarkingLandmarks?.landmarks || [];
    const parts = names.filter((id) => !LEG_LANDMARKS.has(id)).map((id) => ({id, label: bodyPartLabel(id)}));
    const known = new Set(names);
    errorListArray("body_part").filter((part) => !LEG_LANDMARKS.has(part.id) && !known.has(part.id)).forEach((part) => parts.push(part));
    [...new Set(state.errorMarks.map((mark) => mark.body_part))].filter((id) => !LEG_LANDMARKS.has(id) && !parts.some((part) => part.id === id)).forEach((id) => parts.push({id, label: bodyPartLabel(id)}));
    return parts.map((part) => ({part, indices: state.errorMarks.map((_, index) => index).filter((index) => state.errorMarks[index].body_part === part.id)}));
  }
  const groups = errorListArray("body_part")
    .map((part) => ({part, indices: state.errorMarks.map((_, index) => index).filter((index) => state.errorMarks[index].body_part === part.id)}));
  const knownIds = new Set(groups.map((group) => group.part.id));
  [...new Set(state.errorMarks.map((mark) => mark.body_part))].filter((id) => !knownIds.has(id)).forEach((id) => {
    groups.push({part: {id, label: id}, indices: state.errorMarks.map((_, index) => index).filter((index) => state.errorMarks[index].body_part === id)});
  });
  return groups;
}

const MIN_TIMELINE_PX_PER_FRAME = 6;

function timelineSegmentTitle(mark) {
  const base = `${bodyPartLabel(mark.body_part)}: frames ${mark.start_frame}–${mark.end_frame} (click to set cause, drag edges to adjust)`;
  return mark.note ? `${base}\nNote: ${mark.note}` : base;
}

function renderTimelineSegment(index, frameCount) {
  const mark = state.errorMarks[index];
  const left = Math.min((mark.start_frame / frameCount) * 100, 100);
  const width = Math.max(((mark.end_frame - mark.start_frame) / frameCount) * 100, 1.5);
  return `<div class="timeline-segment" data-mark-index="${index}" style="left:${left}%;width:${width}%;background:${markBackground(mark)}" title="${timelineSegmentTitle(mark)}">
    <span class="timeline-handle timeline-handle-start" data-handle="start" data-mark-index="${index}" role="slider" tabindex="0" aria-label="${bodyPartLabel(mark.body_part)} start frame"></span>
    <span class="timeline-handle timeline-handle-end" data-handle="end" data-mark-index="${index}" role="slider" tabindex="0" aria-label="${bodyPartLabel(mark.body_part)} end frame"></span>
  </div>`;
}

function badFrameRanges() {
  const frames = allBadFrameNumbers();
  const automaticFrames = new Set(state.errorMarkingAutoBadFrames);
  const manuallyConfirmedFrames = new Set(state.errorMarkingBadFrames);
  const ranges = [];
  frames.forEach((frame) => {
    const previous = ranges[ranges.length - 1];
    // Explicit frame labels define the manual severity; missing-pose cues stay
    // separately patterned unless the annotator overrides them.
    const automatic = automaticFrames.has(frame) && !manuallyConfirmedFrames.has(frame);
    const rating = automatic ? "unusable" : state.frameUsabilityLabels[String(frame)] || "unusable";
    if (previous && frame <= previous.end + 1 && previous.automatic === automatic && previous.rating === rating) previous.end = frame;
    else ranges.push({start: frame, end: frame, automatic, rating});
  });
  return ranges;
}

function renderBadFrameSegment(range, frameCount) {
  const left = Math.min((range.start / frameCount) * 100, 100);
  const width = Math.max(((range.end - range.start + 1) / frameCount) * 100, 1.5);
  const current = errorMarkingCurrentFrame() >= range.start && errorMarkingCurrentFrame() <= range.end;
  const severity = range.rating === "flawed" ? "Flawed" : "Unusable";
  const label = range.start === range.end ? `${severity} frame ${range.start}` : `${severity} frames ${range.start} through ${range.end}`;
  const title = range.automatic ? `${label} (automatic: missing pose)` : `${label} (marked manually)`;
  return `<button type="button" class="timeline-bad-frame timeline-bad-frame-${range.rating}${current ? " timeline-bad-frame-current" : ""}${range.automatic ? " timeline-bad-frame-auto" : ""}" data-bad-frame-start="${range.start}" data-bad-frame-end="${range.end}" style="left:${left}%;width:${width}%" aria-label="${label}" title="${title}"></button>`;
}

function updateTimelineSegmentPosition(index) {
  const frameCount = Math.max(errorMarkingFrameCount() - 1, 1);
  const mark = state.errorMarks[index];
  const segment = $("error-marking-timeline").querySelector(`.timeline-segment[data-mark-index="${index}"]`);
  if (!segment) return;
  segment.style.left = `${Math.min((mark.start_frame / frameCount) * 100, 100)}%`;
  segment.style.width = `${Math.max(((mark.end_frame - mark.start_frame) / frameCount) * 100, 1.5)}%`;
  segment.style.background = markBackground(mark);
  segment.title = timelineSegmentTitle(mark);
}

function renderErrorMarkingLegend(includeFrameStates = true) {
  const causes = errorListArray("cause");
  const swatch = (color, label) => `<span class="timeline-legend-item"><span class="timeline-legend-swatch" style="background:${color}"></span>${label}</span>`;
  const frameStates = includeFrameStates
    ? `${swatch("var(--correctable-yellow)", "Manual whole-frame flawed")}${swatch("var(--unusable-red)", "Manual whole-frame unusable")}${swatch("repeating-linear-gradient(135deg, #b3261e66 0, #b3261e66 5px, #b3261e30 5px, #b3261e30 9px)", "Automatic: missing pose")}`
    : "";
  return `<div class="timeline-legend">${frameStates}${swatch(UNSET_CAUSE_COLOR, "No cause set")}${causes.map((cause) => swatch(causeColor(cause.id), cause.label)).join("")}</div>`;
}

function renderErrorMarkingTimeline() {
  const container = $("error-marking-timeline");
  if (isVideoRatingOnlyTask(state.data?.tasks?.[state.taskIndex])) {
    container.innerHTML = `<input id="error-marking-scrubber" class="timeline-scrubber video-rating-scrubber" type="range" min="0" max="${Math.max(errorMarkingFrameCount() - 1, 0)}" step="1" value="${errorMarkingCurrentFrame()}" aria-label="Video frame scrubber">`;
    attachTimelineHandlers();
    return;
  }
  const frameTask = isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex]);
  const groups = timelineRowGroups();
  const frameCount = Math.max(errorMarkingFrameCount() - 1, 1);
  const minTrackWidth = Math.max(1, errorMarkingFrameCount()) * MIN_TIMELINE_PX_PER_FRAME;
  const editing = state.editingBodyParts && !state.errorMarkingVideoUnusable;
  const rowCount = groups.length + 2;

  // Row headers and row tracks are separate DOM subtrees (so the track
  // column alone can scroll horizontally) but must land on the same grid
  // row line-for-line. grid-rows-subgrid on both makes that alignment the
  // grid engine's job instead of something two independently-stacked lists
  // have to be kept in sync by construction. Row 1 is reserved for the
  // frame scrubber (an empty spacer on the header side), so its handle
  // scrolls and scales in lockstep with the track column beneath it and
  // lines up with the playhead at the same frame.
  const headerCells = "<div></div>" + `<div class="timeline-row-header"><span class="timeline-row-label text-error">Whole frame</span></div>` + groups.map(({part}) => `
    <div class="timeline-row-header">
      <span class="timeline-row-label">${part.label}</span>
      ${editing
        ? `<button type="button" class="btn btn-xs btn-circle btn-ghost text-error timeline-add-btn" data-delete-part="${part.id}" aria-label="Remove ${part.label}" title="Remove ${part.label}">⊖</button>`
        : ""}
    </div>`
  ).join("");

  const scrubberRowHTML = `<input id="error-marking-scrubber" class="timeline-scrubber" type="range" min="0" max="${Math.max(errorMarkingFrameCount() - 1, 0)}" step="1" value="${errorMarkingCurrentFrame()}" aria-label="Frame scrubber">`;

  const badFrameTrack = `<div class="timeline-row-track timeline-bad-frame-track" aria-label="Frames marked unusable">${badFrameRanges().map((range) => renderBadFrameSegment(range, frameCount)).join("")}</div>`;
  const trackCells = badFrameTrack + groups.map(({part, indices}) =>
    `<div class="timeline-row-track timeline-joint-track${state.errorMarkingVideoUnusable ? " timeline-joint-track-disabled" : ""}" data-track-part="${part.id}" aria-disabled="${state.errorMarkingVideoUnusable}">${indices.map((index) => renderTimelineSegment(index, frameCount)).join("")}</div>`
  ).join("");

  const footerHTML = (editing
    ? `<div class="flex items-center">${state.addingBodyPartEntry
        ? `<input type="text" id="timeline-add-body-part-input" class="input input-xs timeline-add-input" placeholder="New body part" aria-label="New body part label">`
        : `<button type="button" id="timeline-add-body-part-btn" class="btn btn-xs btn-circle timeline-add-btn" aria-label="Add a new body part" title="Add a new body part">+</button>`}</div>`
    : "") +
    `<button type="button" id="timeline-edit-body-parts-toggle" class="btn btn-xs btn-ghost timeline-edit-toggle" aria-label="${editing ? "Done editing body parts" : "Edit body parts"}" title="${editing ? "Done editing body parts" : "Edit body parts"}">${editing ? "✓ Done" : "Edit"}</button>`;

  container.innerHTML = `<div class="timeline-grid grid gap-x-[.6rem] items-stretch" style="grid-template-columns:auto 1fr;grid-template-rows:auto repeat(${groups.length + 1},1.6rem);row-gap:.4rem">
      <div class="timeline-left-col grid grid-rows-subgrid row-start-1" style="grid-row-end:span ${rowCount}">${headerCells}</div>
      <div class="timeline-scroll grid grid-rows-subgrid row-start-1" style="grid-row-end:span ${rowCount}">
        <div class="timeline-scroll-inner grid grid-rows-subgrid row-start-1" style="grid-row-end:span ${rowCount};min-width:${minTrackWidth}px">${scrubberRowHTML}${trackCells}<div class="timeline-playhead" style="left:${timelinePlayheadLeftPercent()}%"></div></div>
      </div>
    </div>
    <div class="timeline-footer mt-2 flex items-center gap-2">${footerHTML}</div>` + (frameTask
      ? `<div class="timeline-legend"><span>Yellow: manually marked flawed</span><span>Red: manually marked unusable</span><span>Dashed red: automatic missing pose</span></div>${renderErrorMarkingLegend(false)}`
      : renderErrorMarkingLegend());
  attachTimelineHandlers();
  if (state.addingBodyPartEntry) $("timeline-add-body-part-input")?.focus();
}

// Coalesces overlapping or consecutive spans for one body part. The mark
// being resized/created remains the surviving object so any caller holding
// it can still find and open it after the array shrinks. Causes and corrected
// positions are combined, while distinct notes are retained on separate lines.
function mergeTouchingErrorMarks(mark) {
  if (!mark) return null;
  let other;
  while ((other = state.errorMarks.find((candidate) =>
    candidate !== mark &&
    candidate.body_part === mark.body_part &&
    candidate.start_frame <= mark.end_frame + 1 &&
    candidate.end_frame >= mark.start_frame - 1))) {
    mark.start_frame = Math.min(mark.start_frame, other.start_frame);
    mark.end_frame = Math.max(mark.end_frame, other.end_frame);
    mark.causes = [...new Set([...(mark.causes || []), ...(other.causes || [])])];
    mark.positions = {...(other.positions || {}), ...(mark.positions || {})};
    const notes = [mark.note, other.note].filter((note, index, values) => note && values.indexOf(note) === index);
    mark.note = notes.join("\n");
    state.errorMarks.splice(state.errorMarks.indexOf(other), 1);
  }
  return mark;
}

function commitNewBodyPart(rawValue) {
  if (!state.addingBodyPartEntry) return;
  state.addingBodyPartEntry = false;
  const label = rawValue.trim();
  if (!label) { renderErrorMarkingTimeline(); return; }
  const list = errorListArray("body_part");
  const existingIds = new Set(list.map((item) => item.id));
  let id = slugifyErrorListEntry(label), suffix = 1;
  while (existingIds.has(id)) { id = `${slugifyErrorListEntry(label)}_${++suffix}`; }
  list.push({id, label});
  saveErrorList("body_part", list);
}

function attachTimelineHandlers() {
  // Delegated to the stable container (not to individual segments/tracks) so
  // renderErrorMarkingTimeline() can freely replace its children at any time —
  // mid-drag or otherwise — without ever detaching a listener's own element.
  const container = $("error-marking-timeline");
  if (container.dataset.handlersAttached) return;
  container.dataset.handlersAttached = "1";
  container.addEventListener("click", (event) => {
    if (state.errorMarkingVideoUnusable && !event.target.closest("[data-bad-frame-start]")) return;
    if (event.target.closest("#timeline-edit-body-parts-toggle")) {
      state.editingBodyParts = !state.editingBodyParts;
      state.addingBodyPartEntry = false;
      renderErrorMarkingTimeline();
      return;
    }
    if (event.target.closest("#timeline-add-body-part-btn")) {
      state.addingBodyPartEntry = true;
      renderErrorMarkingTimeline();
      return;
    }
    const deleteButton = event.target.closest("[data-delete-part]");
    if (deleteButton) {
      saveErrorList("body_part", errorListArray("body_part").filter((item) => item.id !== deleteButton.dataset.deletePart));
      return;
    }
    const badFrame = event.target.closest("[data-bad-frame-start]");
    if (badFrame) {
      const start = Number(badFrame.dataset.badFrameStart);
      const end = Number(badFrame.dataset.badFrameEnd);
      if (isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex])) {
        stopErrorMarkingReplay();
        errorMarkingVideo().pause();
        setErrorMarkingFrame(start);
        state.frameViewForceRecenter = true;
        errorMarkingVideo().currentTime = frameToTime(start);
        updateErrorMarkingFrameIndicator(start);
        return;
      }
      if (start === end) toggleBadFrame(start);
      else toggleBadFrameRange(start, end);
      return;
    }
    const segment = event.target.closest(".timeline-segment");
    if (!segment || event.target.closest(".timeline-handle")) return;
    openErrorMarkPopup(Number(segment.dataset.markIndex));
  });
  container.addEventListener("input", (event) => {
    if (event.target.id !== "error-marking-scrubber") return;
    stopErrorMarkingReplay();
    const frame = Number(event.target.value);
    state.frameViewForceRecenter = true;
    errorMarkingVideo().pause();
    setErrorMarkingFrame(frame);
    errorMarkingVideo().currentTime = frameToTime(frame);
    updateErrorMarkingFrameIndicator(frame);
  });
  container.addEventListener("keydown", (event) => {
    if (event.target.id === "timeline-add-body-part-input" && event.key === "Enter") {
      event.preventDefault();
      commitNewBodyPart(event.target.value);
    }
  });
  container.addEventListener("focusout", (event) => {
    if (event.target.id === "timeline-add-body-part-input") commitNewBodyPart(event.target.value);
  });
  container.addEventListener("pointerdown", (event) => {
    if (state.errorMarkingVideoUnusable) return;
    const handle = event.target.closest(".timeline-handle");
    if (handle) { startTimelineHandleDrag(event, handle); return; }
    if (event.target.closest(".timeline-segment")) return;
    const track = event.target.closest(".timeline-row-track");
    if (track?.classList.contains("timeline-bad-frame-track")) return;
    if (track) startNewMarkDrag(event, track);
  });
}

function startTimelineHandleDrag(event, handleEl) {
  if (state.errorMarkingVideoUnusable) return;
  event.preventDefault();
  event.stopPropagation();
  const index = Number(handleEl.dataset.markIndex);
  const edge = handleEl.dataset.handle;
  const track = handleEl.closest(".timeline-row-track");
  const frameCount = Math.max(errorMarkingFrameCount() - 1, 1);
  stopErrorMarkingReplay();
  const video = errorMarkingVideo();
  video.pause();
  let dragged = false;

  function frameFromClientX(clientX) {
    const rect = track.getBoundingClientRect();
    const fraction = rect.width ? Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) : 0;
    return Math.round(fraction * frameCount);
  }

  function onMove(moveEvent) {
    dragged = true;
    const frame = frameFromClientX(moveEvent.clientX);
    const mark = state.errorMarks[index];
    if (edge === "start") mark.start_frame = Math.min(frame, mark.end_frame);
    else mark.end_frame = Math.max(frame, mark.start_frame);
    setErrorMarkingFrame(frame);
    video.currentTime = frameToTime(frame);
    updateErrorMarkingFrameIndicator(frame);
    updateTimelineSegmentPosition(index);
  }

  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    if (dragged) {
      mergeTouchingErrorMarks(state.errorMarks[index]);
      renderErrorMarkingTimeline();
      scheduleSave("started");
    } else {
      // A plain tap on a handle, with no movement: on a very short mark the
      // handles can cover its whole visible width, leaving no other spot to
      // click, so this is the only way to reach the popup for it.
      openErrorMarkPopup(index);
    }
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, {once: true});
}

function startNewMarkDrag(event, track) {
  if (state.errorMarkingVideoUnusable) return;
  event.preventDefault();
  const partId = track.dataset.trackPart;
  const frameCount = Math.max(errorMarkingFrameCount() - 1, 1);
  stopErrorMarkingReplay();
  const video = errorMarkingVideo();
  video.pause();

  function frameFromClientX(clientX, liveTrack) {
    const rect = liveTrack.getBoundingClientRect();
    const fraction = rect.width ? Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) : 0;
    return Math.round(fraction * frameCount);
  }

  const originFrame = frameFromClientX(event.clientX, track);
  state.errorMarks.push({body_part: partId, start_frame: originFrame, end_frame: originFrame, causes: [], note: "", positions: {}});
  const index = state.errorMarks.length - 1;
  state.errorMarkingNoErrorsConfirmed = false;
  setErrorMarkingFrame(originFrame);
  video.currentTime = frameToTime(originFrame);
  updateErrorMarkingFrameIndicator(originFrame);
  renderErrorMarkingTimeline();
  // The row just re-rendered, so re-acquire the (new) track element for this
  // body part; it stays attached for the rest of this gesture since nothing
  // else re-renders the timeline until pointerup below.
  const liveTrack = $("error-marking-timeline").querySelector(`.timeline-row-track[data-track-part="${CSS.escape(partId)}"]`) || track;
  let dragged = false;

  function onMove(moveEvent) {
    dragged = true;
    const frame = frameFromClientX(moveEvent.clientX, liveTrack);
    const mark = state.errorMarks[index];
    mark.start_frame = Math.min(originFrame, frame);
    mark.end_frame = Math.max(originFrame, frame);
    setErrorMarkingFrame(frame);
    video.currentTime = frameToTime(frame);
    updateErrorMarkingFrameIndicator(frame);
    updateTimelineSegmentPosition(index);
  }

  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    const mark = mergeTouchingErrorMarks(state.errorMarks[index]);
    renderErrorMarkingTimeline();
    scheduleSave("started");
    openErrorMarkPopup(state.errorMarks.indexOf(mark));
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp, {once: true});
}

function midFrame(mark) { return Math.round((mark.start_frame + mark.end_frame) / 2); }

function seekVideoTo(video, time) {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 1e-3) { resolve(); return; }
    const handler = () => { video.removeEventListener("seeked", handler); resolve(); };
    video.addEventListener("seeked", handler);
    video.currentTime = time;
  });
}

async function captureErrorMarkPreview(mark) {
  const video = errorMarkingVideo(), canvas = $("error-mark-dialog-preview");
  const ctx = canvas.getContext("2d");
  const originalTime = video.currentTime;
  await seekVideoTo(video, frameToTime(midFrame(mark)));
  canvas.width = video.videoWidth || 320;
  canvas.height = video.videoHeight || 180;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  await seekVideoTo(video, originalTime);
}

function renderErrorMarkDialogCauses(mark) {
  $("error-mark-dialog-causes").innerHTML = errorListArray("cause").map((cause) =>
    `<button type="button" class="badge badge-sm ${mark.causes.includes(cause.id) ? "badge-primary" : "badge-outline"}" data-dialog-toggle-cause="${cause.id}">${cause.label}</button>`
  ).join("");
  $("error-mark-dialog-causes").querySelectorAll("[data-dialog-toggle-cause]").forEach((button) => {
    button.onclick = () => {
      const position = mark.causes.indexOf(button.dataset.dialogToggleCause);
      if (position === -1) mark.causes.push(button.dataset.dialogToggleCause); else mark.causes.splice(position, 1);
      renderErrorMarkDialogCauses(mark);
      updateTimelineSegmentPosition(state.activeMarkIndex);
      renderSkeletonOverlay();
      scheduleSave("started");
    };
  });
}

function openErrorMarkPopup(index) {
  if (state.errorMarkingVideoUnusable || isVideoUsabilityTriageTask(state.data?.tasks?.[state.taskIndex])) return;
  stopErrorMarkingReplay();
  state.activeMarkIndex = index;
  const mark = state.errorMarks[index];
  $("error-mark-dialog-title").textContent = bodyPartLabel(mark.body_part);
  $("error-mark-dialog-frames").textContent = `frames ${mark.start_frame}–${mark.end_frame}`;
  renderErrorMarkDialogCauses(mark);
  $("error-mark-dialog-note").value = mark.note || "";
  $("error-mark-dialog").showModal();
  renderErrorMarkDialogOverlay();
  captureErrorMarkPreview(mark).catch(() => {});
}

// --- Skeleton overlay (error-marking screen) ------------------------------
//
// Draws the tracked landmarks over #error-marking-video at the frame the
// video is currently on, color-coded to match the timeline legend, and lets
// the annotator click or drag a landmark directly instead of only using the
// timeline's + buttons. A click creates/extends a mark for that landmark at
// that frame (via ensureMarkAtFrame, same merge-adjacent-marks behavior as
// the timeline); a drag does the same AND records the dragged-to position
// as that mark's corrected position for that one frame, leaving every other
// frame in the mark's range to fall back to the tracked position. This is
// the same interaction split the (single-frame) skeleton editor uses --
// tap opens the detail popup, drag corrects a position -- adapted to a
// per-frame video instead of one static image.

async function loadErrorMarkingLandmarks(task, retry = false) {
  if (!retry && state.errorMarkingLandmarksTaskId === task.task_id) { renderSkeletonOverlay(); return; }
  state.errorMarkingLandmarks = null;
  state.errorMarkingLandmarksTaskId = task.task_id;
  state.errorMarkingLandmarksStatus = "loading";
  const statusMessage = $("frame-landmark-load-status");
  if (statusMessage && isFrameUsabilityTask(task)) { statusMessage.hidden = false; statusMessage.textContent = "Loading pose data for automatic missing-pose marks…"; }
  if (!task.landmarks_artifact) {
    if (!isVideoRatingOnlyTask(task)) { refreshAutomaticBadFrames({frames: []}, task); if (isFrameUsabilityTask(task)) updateFrameUsabilityControls(); }
    state.errorMarkingLandmarksStatus = isFrameUsabilityTask(task) ? "absent" : "loaded";
    if (statusMessage && isFrameUsabilityTask(task)) statusMessage.textContent = "No landmark artifact is available; every frame is marked automatically as missing pose.";
    renderErrorMarkingTimeline();
    updateErrorMarkingFrameIndicator();
    if (!isVideoRatingOnlyTask(task) && !isFrameUsabilityTask(task)) scheduleSave("started");
    renderSkeletonOverlay();
    return;
  }
  try {
    const response = await authenticatedFetch(`/artifacts/${task.landmarks_artifact}`);
    const data = await responseJson(response);
    if (state.data.tasks[state.taskIndex]?.task_id === task.task_id) {
      state.errorMarkingLandmarks = data;
      state.errorMarkingLandmarksStatus = "loaded";
      if (statusMessage) statusMessage.hidden = true;
      if (!isVideoRatingOnlyTask(task) && refreshAutomaticBadFrames(data, task)) {
        if (isFrameUsabilityTask(task)) updateFrameUsabilityControls();
        renderErrorMarkingTimeline();
        updateErrorMarkingFrameIndicator();
        if (!isFrameUsabilityTask(task)) scheduleSave("started");
      }
      if (isFrameUsabilityTask(task)) renderErrorMarkingTimeline();
    }
  } catch (error) {
    if (state.data.tasks[state.taskIndex]?.task_id !== task.task_id) return;
    state.errorMarkingLandmarksStatus = "failed";
    if (statusMessage && isFrameUsabilityTask(task)) {
      statusMessage.hidden = false;
      statusMessage.textContent = `Could not load pose data for automatic missing-pose marks: ${error.message || error}. Retry completion or skip this case.`;
    }
  }
  renderSkeletonOverlay();
}

// The tracked position for a landmark at a frame, overridden by that
// landmark's own mark's corrected position for that exact frame (if any),
// and by an in-progress drag's live position for the current frame.
function skeletonFrameLandmarks(frame) {
  const data = state.errorMarkingLandmarks;
  if (!data || !data.frames[frame]) return {};
  if (isVideoRatingOnlyTask(state.data?.tasks?.[state.taskIndex])) return data.frames[frame];
  const effective = {...data.frames[frame]};
  state.errorMarks.forEach((mark) => {
    if (frame < mark.start_frame || frame > mark.end_frame) return;
    const corrected = mark.positions && mark.positions[String(frame)];
    if (corrected) effective[mark.body_part] = corrected;
  });
  if (state.skeletonDragLandmark && state.skeletonDragPosition && frame === errorMarkingCurrentFrame()) {
    effective[state.skeletonDragLandmark] = state.skeletonDragPosition;
  }
  return effective;
}

// The video no longer has a pose burned into its pixels (see
// attach_error_marking_landmarks.py) -- this overlay draws the entire
// skeleton itself every frame, so an untouched, uncorrected landmark still
// needs a color: the same yellow-green the burned-in overlay used to draw,
// for visual continuity with what annotators are already used to seeing.
const TRACKED_SKELETON_COLOR = "#c6eb28";
const SKELETON_UNUSABLE_COLOR = "#b3261e";
// Reserve 8% of each source dimension on every side of the live video. The
// video is scaled by the reciprocal factor while the SVG viewBox expands by
// this amount, keeping source coordinates aligned exactly and making modestly
// out-of-frame estimates visible and draggable.
const ERROR_MARKING_CANVAS_BUFFER_RATIO = .08;
function errorMarkingCanvasBufferRatio() {
  return ERROR_MARKING_CANVAS_BUFFER_RATIO;
}
// The original (pre-correction) position of a landmark an annotator has
// moved, rendered as a deemphasized "ghost" of the incorrect estimate it
// replaced -- distinct from CAUSE_COLOR_PALETTE/UNSET_CAUSE_COLOR, which
// color a *mark*, not a specific stale position.
const SKELETON_GHOST_COLOR = "rgba(154,163,158,.75)";
// A corrected landmark's effective position and incident segments in the
// previous frame provide temporal context for spotting/correcting jitter.
// The guide appears during the drag and persists with the saved correction;
// blue distinguishes it from the gray pre-correction ghost at this frame.
const SKELETON_PREVIOUS_FRAME_GHOST_COLOR = "#5da9e9";
// Ghosting a correction that landed within a fraction of a pixel of the
// original would just double-draw the same point/line.
const SKELETON_GHOST_MIN_DISTANCE = .5;

// True only when `landmark` has an annotator-supplied corrected position at
// this *exact* frame -- either already saved (mark.positions[frame]) or
// being actively dragged right now -- not merely covered by a mark's
// frame span without having been dragged at this particular frame.
function landmarkMovedAtFrame(landmark, frame) {
  if (state.skeletonDragLandmark === landmark && state.skeletonDragPosition && frame === errorMarkingCurrentFrame()) return true;
  const mark = markForPartAtFrame(landmark, frame);
  return !!(mark && mark.positions && Object.prototype.hasOwnProperty.call(mark.positions, String(frame)));
}

function landmarkChangedAtFrame(original, effective, landmark, frame) {
  if (!landmarkMovedAtFrame(landmark, frame)) return false;
  const from = original[landmark], to = effective[landmark];
  return !!(from && to && Math.hypot(to[0] - from[0], to[1] - from[1]) >= SKELETON_GHOST_MIN_DISTANCE);
}

// A landmark/segment gets a cause-colored halo only once it has actually
// changed from the video *and* been given a cause. The skeleton itself stays
// yellow throughout, so the cause is an annotation around the pose rather
// than a replacement for its normal structural color.
function skeletonLandmarkCauseColor(landmark, frame, changed) {
  if (!changed) return null;
  const mark = markForPartAtFrame(landmark, frame);
  return mark && mark.causes.length ? causeColor(mark.causes[0]) : null;
}

// Builds the skeleton overlay markup for one frame, shared by the live
// video overlay and the mark-detail dialog's read-only preview. `highlight`
// forces a specific landmark to render selected regardless of hover/drag
// state -- used by the dialog to call out the landmark a mark is about.
function skeletonOverlayMarkup(data, frame, highlight = null) {
  const {width, height} = data.source_dimensions;
  const points = skeletonFrameLandmarks(frame);
  const original = data.frames[frame] || {};
  const frameTask = isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex]);
  const legacyBad = !isVideoRatingOnlyTask(state.data?.tasks?.[state.taskIndex]) && !frameTask && isBadFrame(frame);
  const rating = frameTask ? frameUsabilityRating(frame) : null;
  const skeletonColor = rating === "unusable" || legacyBad
    ? SKELETON_UNUSABLE_COLOR
    : rating === "flawed" ? "var(--marginal-orange)" : TRACKED_SKELETON_COLOR;
  const clampX = (x) => Math.min(Math.max(x, -width * .3), width * 1.3);
  const clampY = (y) => Math.min(Math.max(y, -height * .3), height * 1.3);
  const changed = Object.fromEntries(
    (data.landmarks || []).map((landmark) => [
      landmark,
      landmarkChangedAtFrame(original, points, landmark, frame),
    ])
  );

  // Playback should read as one clean moving pose. Comparison layers return
  // immediately on pause/finish, but remain hidden in either play direction.
  const showCorrectionGhosts = state.errorMarkingReplayDirection == null;
  const previousPoints = showCorrectionGhosts ? skeletonFrameLandmarks(frame - 1) : {};
  const guidedLandmarks = new Set((data.landmarks || []).filter((landmark) => changed[landmark] && previousPoints[landmark]));
  const previousFrameGhostPointHTML = [...guidedLandmarks].filter((landmark) => !isOutOfScopeLeg(landmark)).map((landmark) => {
    const point = previousPoints[landmark];
    return `<circle class="skeleton-previous-frame-landmark-ghost" data-landmark="${landmark}"` +
      ` cx="${clampX(point[0])}" cy="${clampY(point[1])}" r="8" fill="none" stroke="${SKELETON_PREVIOUS_FRAME_GHOST_COLOR}"></circle>`;
  }).join("");
  const previousFrameGhostEdgesHTML = (data.pose_edges || []).map(([a, b]) => {
    if (isOutOfScopeLeg(a) || isOutOfScopeLeg(b)) return "";
    if (!guidedLandmarks.has(a) && !guidedLandmarks.has(b)) return "";
    const pa = previousPoints[a], pb = previousPoints[b];
    if (!pa || !pb) return "";
    return `<line class="skeleton-previous-frame-edge-ghost"` +
      ` x1="${clampX(pa[0])}" y1="${clampY(pa[1])}" x2="${clampX(pb[0])}" y2="${clampY(pb[1])}"` +
      ` stroke="${SKELETON_PREVIOUS_FRAME_GHOST_COLOR}"></line>`;
  }).join("");

  const ghostEdgesHTML = (data.pose_edges || []).map(([a, b]) => {
    if (isOutOfScopeLeg(a) || isOutOfScopeLeg(b)) return "";
    if (!showCorrectionGhosts || (!changed[a] && !changed[b])) return "";
    const pa = original[a], pb = original[b];
    if (!pa || !pb) return "";
    return `<line class="skeleton-edge-ghost" x1="${clampX(pa[0])}" y1="${clampY(pa[1])}" x2="${clampX(pb[0])}" y2="${clampY(pb[1])}" stroke="${SKELETON_GHOST_COLOR}"></line>`;
  }).join("");
  const ghostPointsHTML = (data.landmarks || []).filter((landmark) => showCorrectionGhosts && changed[landmark]).map((landmark) => {
    if (isOutOfScopeLeg(landmark)) return "";
    const point = original[landmark];
    return `<circle class="skeleton-landmark-ghost" cx="${clampX(point[0])}" cy="${clampY(point[1])}" r="6" fill="${SKELETON_GHOST_COLOR}"></circle>`;
  }).join("");

  const edgesHTML = (data.pose_edges || []).map(([a, b]) => {
    if (isOutOfScopeLeg(a) || isOutOfScopeLeg(b)) return "";
    const pa = points[a], pb = points[b];
    if (!pa || !pb) return "";
    const causeHalo = skeletonLandmarkCauseColor(a, frame, changed[a]) || skeletonLandmarkCauseColor(b, frame, changed[b]);
    const geometry = `x1="${clampX(pa[0])}" y1="${clampY(pa[1])}" x2="${clampX(pb[0])}" y2="${clampY(pb[1])}"`;
    return `${causeHalo ? `<line class="skeleton-edge-cause-halo" ${geometry} stroke="${causeHalo}"></line>` : ""}` +
      `<line class="skeleton-edge" ${geometry} stroke="${skeletonColor}"></line>`;
  }).join("");

  const pointsHTML = (data.landmarks || []).map((landmark) => {
    if (isOutOfScopeLeg(landmark)) return "";
    const point = points[landmark];
    if (!point) return "";
    const mark = markForPartAtFrame(landmark, frame);
    const selected = highlight ? landmark === highlight : (state.selectedSkeletonLandmark === landmark || state.skeletonDragLandmark === landmark);
    const causeHalo = skeletonLandmarkCauseColor(landmark, frame, changed[landmark]);
    const position = `cx="${clampX(point[0])}" cy="${clampY(point[1])}"`;
    return `${causeHalo ? `<circle class="skeleton-landmark-cause-halo" ${position} r="${mark ? 15 : 12}" fill="${causeHalo}"></circle>` : ""}` +
      `<circle class="skeleton-landmark${selected ? " skeleton-landmark-selected" : ""}" data-landmark="${landmark}"` +
      ` ${position} r="${mark ? 11 : 8}" fill="${skeletonColor}"></circle>`;
  }).join("");

  return {width, height, innerHTML: `<g>${previousFrameGhostEdgesHTML}${ghostEdgesHTML}</g><g>${previousFrameGhostPointHTML}${ghostPointsHTML}</g><g>${edgesHTML}</g><g>${pointsHTML}</g>`};
}

// Shared by every skeleton-overlay surface (the live timeline view, the
// mark-detail dialog's static preview, and the review dialog's replay) --
// each just points this at its own <svg> and frame source.
function renderOverlayInto(svg, data, frame, highlight = null) {
  if (!svg) return;
  if (!data) { svg.innerHTML = ""; return; }
  const {width, height, innerHTML} = skeletonOverlayMarkup(data, frame, highlight);
  const bufferRatio = svg.id === "error-marking-overlay" ? errorMarkingCanvasBufferRatio() : 0;
  const bufferX = width * bufferRatio, bufferY = height * bufferRatio;
  svg.setAttribute("viewBox", `${-bufferX} ${-bufferY} ${width + 2 * bufferX} ${height + 2 * bufferY}`);
  svg.innerHTML = innerHTML;
}

function renderSkeletonOverlay(frame = errorMarkingCurrentFrame()) {
  if (isVideoUsabilityTriageTask(state.data?.tasks?.[state.taskIndex]) && !isVideoRatingOnlyTask(state.data?.tasks?.[state.taskIndex])) {
    $("error-marking-overlay").innerHTML = "";
    renderErrorMarkDialogOverlay();
    return;
  }
  renderOverlayInto($("error-marking-overlay"), state.errorMarkingLandmarks, frame);
  renderErrorMarkDialogOverlay();
}

// Renders the same corrected skeleton onto the mark-detail dialog, at that
// mark's own middle frame, with its body-part landmark highlighted -- so
// attributing a cause can be cross-checked against where the tracking
// actually was (and any per-frame drag correction already recorded) without
// leaving the popup. A no-op while the dialog is closed or has no active mark.
function renderErrorMarkDialogOverlay() {
  const svg = $("error-mark-dialog-overlay");
  const mark = state.activeMarkIndex != null ? state.errorMarks[state.activeMarkIndex] : null;
  if (!svg || !$("error-mark-dialog").open || !mark) { if (svg) svg.innerHTML = ""; return; }
  renderOverlayInto(svg, state.errorMarkingLandmarks, midFrame(mark), mark.body_part);
}

// Inverts the SVG's uniform "meet" (contain) fit, including its live viewBox
// buffer, so a pointer position lands on the same source-space coordinate the
// browser is rendering. Reading the actual viewBox also keeps this correct for
// unbuffered dialog/review overlays.
function svgToContentPoint(svg, clientX, clientY) {
  const rect = svg.getBoundingClientRect();
  const viewBox = svg.viewBox.baseVal;
  const scale = rect.width && rect.height && viewBox.width && viewBox.height
    ? Math.min(rect.width / viewBox.width, rect.height / viewBox.height) : 1;
  const offsetX = (rect.width - viewBox.width * scale) / 2;
  const offsetY = (rect.height - viewBox.height * scale) / 2;
  return {
    x: viewBox.x + (clientX - rect.left - offsetX) / (scale || 1),
    y: viewBox.y + (clientY - rect.top - offsetY) / (scale || 1),
  };
}

const SKELETON_DRAG_THRESHOLD = 3;

function startSkeletonLandmarkDrag(event, landmark) {
  if (state.frameViewPanGestureActive || isOutOfScopeLeg(landmark) || state.errorMarkingVideoUnusable || isVideoUsabilityTriageTask(state.data?.tasks?.[state.taskIndex])) return;
  event.preventDefault();
  const svg = $("error-marking-overlay");
  const data = state.errorMarkingLandmarks;
  const frame = errorMarkingCurrentFrame();
  const startPoint = skeletonFrameLandmarks(frame)[landmark];
  stopErrorMarkingReplay();
  const video = errorMarkingVideo();
  video.pause();
  const pointerId = event.pointerId;
  svg.setPointerCapture?.(pointerId);
  state.selectedSkeletonLandmark = landmark;
  let moved = false;

  function onMove(moveEvent) {
    if (moveEvent.pointerId !== pointerId) return;
    const point = svgToContentPoint(svg, moveEvent.clientX, moveEvent.clientY);
    if (!moved && startPoint && Math.hypot(point.x - startPoint[0], point.y - startPoint[1]) <= SKELETON_DRAG_THRESHOLD) return;
    moved = true;
    state.skeletonDragLandmark = landmark;
    state.skeletonDragPosition = [point.x, point.y];
    renderSkeletonOverlay();
  }

  function onUp(upEvent) {
    if (upEvent.pointerId !== pointerId) return;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    try { svg.releasePointerCapture?.(pointerId); } catch {}
    const mark = ensureMarkAtFrame(landmark, frame);
    const finalPoint = moved ? svgToContentPoint(svg, upEvent.clientX, upEvent.clientY) : null;
    const positionChanged = Boolean(startPoint && finalPoint && Math.hypot(finalPoint.x - startPoint[0], finalPoint.y - startPoint[1]) > .1);
    if (positionChanged) {
      mark.positions = mark.positions || {};
      mark.positions[String(frame)] = [finalPoint.x, finalPoint.y];
      if (isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex]) && frameUsabilityRating(frame) !== "unusable") {
        state.frameUsabilityLabels[String(frame)] = "flawed";
      }
    }
    state.skeletonDragLandmark = null;
    state.skeletonDragPosition = null;
    if (isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex]) && moved && frameUsabilityRating(frame) === "flawed") {
      updateBadFrameControls(frame);
    }
    renderErrorMarkingTimeline();
    renderSkeletonOverlay();
    scheduleSave("started");
    if (!moved) openErrorMarkPopup(state.errorMarks.indexOf(mark));
    state.cancelSkeletonLandmarkDrag = null;
  }

  function onCancel(cancelEvent) {
    if (cancelEvent.pointerId !== pointerId) return;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    try { svg.releasePointerCapture?.(pointerId); } catch {}
    state.skeletonDragLandmark = null;
    state.skeletonDragPosition = null;
    state.cancelSkeletonLandmarkDrag = null;
    renderSkeletonOverlay();
  }

  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  state.cancelSkeletonLandmarkDrag = () => onCancel({pointerId});
}

function attachSkeletonOverlayHandlers() {
  const svg = $("error-marking-overlay");
  if (!svg || svg.dataset.handlersAttached) return;
  svg.dataset.handlersAttached = "1";
  svg.addEventListener("pointerdown", (event) => {
    if (state.errorMarkingVideoUnusable || isVideoUsabilityTriageTask(state.data?.tasks?.[state.taskIndex])) return;
    const circle = event.target.closest(".skeleton-landmark");
    if (!circle || !state.errorMarkingLandmarks) return;
    startSkeletonLandmarkDrag(event, circle.dataset.landmark);
  });
}

function renderErrorMarkingTask(task, judgment) {
  pauseTemporalVideos();
  hideAllScreens();
  $("error-marking-screen").hidden = false;
  const videoRatingOnly = isVideoRatingOnlyTask(task);
  const frameTask = isFrameUsabilityTask(task);
  document.body.classList.toggle("frame-usability-task-active", frameTask);
  $("frame-mobile-bar").hidden = !frameTask || !window.matchMedia("(max-width: 700px)").matches;
  $("frame-mobile-details").open = !frameTask || !window.matchMedia("(max-width: 700px)").matches;
  state.frameViewZoomMode = frameTask && window.matchMedia("(max-width: 700px)").matches ? "auto" : "manual";
  state.frameViewAutoZoomOverride = null;
  state.frameViewZoom = 1;
  state.frameViewMobileMode = frameTask && window.matchMedia("(max-width: 700px)").matches;
  state.frameViewPanX = 0;
  state.frameViewPanY = 0;
  state.frameViewPanEnabled = false;
  state.frameViewLastFollowFrame = null;
  state.frameViewGesturePanFrame = null;
  state.frameViewPanGestureActive = false;
  state.frameViewForceRecenter = false;
  $("frame-mobile-zoom").value = state.frameViewZoomMode === "auto" ? "auto" : "1";
  $("frame-mobile-pan").setAttribute("aria-pressed", "false");
  $("frame-mobile-pan").textContent = "Enable pan";
  $("frame-mobile-pan").setAttribute("aria-label", "Enable video panning");
  $("frame-mobile-timeline").setAttribute("aria-expanded", "false");
  $("frame-mobile-timeline").textContent = "Show timeline and notes";
  $("frame-mobile-timeline").setAttribute("aria-label", "Show timeline and notes");
  $("give-up-video").hidden = !frameTask;
  state.errorMarkingLandmarksStatus = "idle";
  $("frame-landmark-load-status").hidden = true;
  $("error-marking-title").textContent = frameTask ? "Rate frames and mark landmark errors" : videoRatingOnly ? "Rate visible pose tracking" : isVideoUsabilityTriageTask(task) ? "Assess video usability" : "Mark tracking errors";
  $("error-marking-frame-usability-row").hidden = videoRatingOnly || isVideoUsabilityTriageTask(task);
  $("error-marking-frame-usability-toggle").classList.toggle("legacy-frame-usability", !frameTask);
  $("error-marking-usability-rating").hidden = frameTask;
  $("error-marking-usability-rating").querySelector("legend").textContent = videoRatingOnly ? "Overall pose-tracking accuracy (required)" : "Overall video usability (required)";
  $("error-marking-usability-toggle").setAttribute("aria-label", videoRatingOnly ? "Overall pose-tracking accuracy" : "Overall video usability");
  $("error-marking-video-unusable-reason-label").textContent = videoRatingOnly ? "Why is the pose tracking unusable?" : "Why is the video unusable?";
  $("error-marking-video-unusable-reason").placeholder = videoRatingOnly ? "No person or assessable pose, or tracking too inaccurate?" : "Why should this video be excluded?";
  $("error-marking-note").placeholder = frameTask ? "Optional note about this clip" : videoRatingOnly ? "Optional: note tracking errors or a separate reason the video may be unsuitable for movement analysis." : "Anything else worth noting";
  const ratingDescriptions = videoRatingOnly ? POSE_TRACKING_DESCRIPTIONS : VIDEO_USABILITY_DESCRIPTIONS;
  $("error-marking-usability-toggle").querySelectorAll(".video-usability-option").forEach((option) => {
    const rating = option.dataset.segmentValue;
    option.title = `${rating[0].toUpperCase()}${rating.slice(1)} — ${ratingDescriptions[rating]}`;
    option.querySelector(".sr-only").textContent = `${rating[0].toUpperCase()}${rating.slice(1)}. ${ratingDescriptions[rating]}`;
  });
  $("actions").hidden = false;
  $("mark-unclear").hidden = true;

  const video = errorMarkingVideo();
  video.pause();
  video.src = `/artifacts/${task.source_artifact}`;
  video.load();
  video.ontimeupdate = () => {
    setErrorMarkingFrame(Math.floor(video.currentTime * errorMarkingFps()));
    updateErrorMarkingFrameIndicator();
  };
  video.onseeked = () => updateErrorMarkingFrameIndicator();
  video.onloadedmetadata = () => {
    if (frameTask) {
      setErrorMarkingFrame(initialFrame);
      video.currentTime = frameToTime(initialFrame);
      updateErrorMarkingFrameIndicator(initialFrame);
    }
    updateErrorMarkingFrameIndicator();
    renderErrorMarkingTimeline();
    updateFrameViewTransform();
  };
  video.onloadeddata = updateFrameViewTransform;

  const response = judgment?.error_marking_response || {};
  state.errorMarks = structuredClone(response.marks || []).map((mark) => ({causes: [], note: "", positions: {}, ...mark}));
  state.errorMarkingBadFrames = [...new Set((response.bad_frames || []).map(Number))]
    .filter((frame) => Number.isInteger(frame) && frame >= 0)
    .sort((a, b) => a - b);
  state.errorMarkingUsableFrames = [...new Set((response.usable_frames || []).map(Number))]
    .filter((frame) => Number.isInteger(frame) && frame >= 0)
    .sort((a, b) => a - b);
  state.errorMarkingAutoBadFrames = [];
  state.errorMarkingVideoUnusable = Boolean(response.video_unusable);
  state.errorMarkingVideoUsabilityRating = response.video_usability_rating || (state.errorMarkingVideoUnusable ? "unusable" : "");
  state.errorMarkingVideoUnusableReason = response.note || response.video_unusable_reason || "";
  state.errorMarkingNoErrorsConfirmed = Boolean(response.no_errors_found);
  const frameResponse = judgment?.frame_usability_response || {};
  state.frameUsabilityLabels = frameTask ? structuredClone(frameResponse.labels || {}) : {};
  state.frameVideoDisposition = frameTask ? (frameResponse.video_usability_rating_override || null) : null;
  setGiveUpButtonState();
  if (frameTask) state.errorMarks = structuredClone(frameResponse.marks || []).map((mark) => ({causes: [], note: "", positions: {}, ...mark}));
  if (frameTask) { state.errorMarkingBadFrames = Object.entries(state.frameUsabilityLabels).filter(([, label]) => label === "flawed" || label === "unusable").map(([number]) => Number(number)); state.errorMarkingUsableFrames = Object.entries(state.frameUsabilityLabels).filter(([, label]) => label === "good").map(([number]) => Number(number)); }
  state.errorMarkingDirty = false;
  state.editingBodyParts = false;
  state.addingBodyPartEntry = false;
  state.selectedSkeletonLandmark = null;
  state.skeletonDragLandmark = null;
  state.skeletonDragPosition = null;
  const initialFrame = frameTask ? rememberedFrame(task, frameResponse.last_viewed_frame) : 0;
  setErrorMarkingFrame(initialFrame);
  // Called before the renders below (not after) so its synchronous prefix --
  // clearing state.errorMarkingLandmarks and updating
  // state.errorMarkingLandmarksTaskId -- has already run by the time they
  // read it; otherwise a moment of the *previous* task's overlay could
  // render against this task's now-reset frame indicator.
  loadErrorMarkingLandmarks(task);
  attachSkeletonOverlayHandlers();
  attachFramePanHandlers();
  updateFrameViewTransform();
  placeFrameMobileTools();
  const giveUp = $("give-up-video");
  const giveUpProxy = $("frame-mobile-give-up");
  if (giveUpProxy) giveUpProxy.textContent = giveUp?.textContent === "Undo" ? "Undo give up" : "Give up on video";
  const timelineDetails = $("frame-mobile-details");
  const noteField = $("error-marking-note").closest("fieldset");
  if (timelineDetails && noteField && noteField.parentElement !== timelineDetails) timelineDetails.append(noteField);
  renderErrorMarkingTimeline();
  updateErrorMarkingFrameIndicator();
  updateVideoUnusableControls();
  updateFrameMobileControls();
  $("error-marking-note").value = frameTask ? (frameResponse.note || "") : state.errorMarkingVideoUnusableReason;
  $("error-marking-note").oninput = frameTask ? () => scheduleSave("started") : syncErrorMarkingNote;
}

function errorMarkingResponsePayload() {
  const badFrames = isVideoRatingOnlyTask(state.data?.tasks?.[state.taskIndex]) ? state.errorMarkingBadFrames : allBadFrameNumbers();
  const videoUnusable = state.errorMarkingVideoUnusable;
  const note = $("error-marking-note").value.trim();
  return {
    marks: videoUnusable ? [] : state.errorMarks,
    bad_frames: badFrames,
    usable_frames: state.errorMarkingUsableFrames,
    video_unusable: videoUnusable,
    video_unusable_reason: videoUnusable ? note : "",
    video_usability_rating: state.errorMarkingVideoUsabilityRating,
    no_errors_found: !isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex]) && !videoUnusable && state.errorMarks.length === 0 && badFrames.length === 0 && Boolean(state.errorMarkingNoErrorsConfirmed),
    note,
  };
}

function renderQualityRatingTask(task, judgment) {
  pauseTemporalVideos();
  hideAllScreens();
  $("quality-rating-screen").hidden = false;
  $("actions").hidden = false;
  $("mark-unclear").hidden = true;

  $("quality-rating-image").src = `/artifacts/${task.source_artifact}`;

  const response = judgment?.quality_rating_response || {};
  document.querySelectorAll('input[name="quality-rating-lighting"]').forEach((input) => {
    input.checked = input.value === response.lighting;
    input.onchange = () => scheduleSave("started");
  });
  document.querySelectorAll('input[name="quality-rating-clothing"]').forEach((input) => {
    input.checked = input.value === response.clothing;
    input.onchange = () => scheduleSave("started");
  });
  $("quality-rating-note").value = response.note || "";
  $("quality-rating-note").oninput = () => scheduleSave("started");
}

function qualityRatingResponsePayload() {
  return {
    lighting: document.querySelector('input[name="quality-rating-lighting"]:checked')?.value || "",
    clothing: document.querySelector('input[name="quality-rating-clothing"]:checked')?.value || "",
    note: $("quality-rating-note").value.trim(),
  };
}

function renderSourceEvidence(task, judgment) {
  const selectedQuality = judgment?.source_evidence_quality || "";
  const selectedFactors = new Set(judgment?.source_evidence_factors || []);
  const required = Boolean(task.requires_source_evidence_quality || task.requires_evidence_quality);
  const qualities = state.data.source_evidence_quality_definitions || [];
  const factors = state.data.source_evidence_factor_definitions || [];
  $("source-evidence-quality-options").className = "grid gap-1";
  $("source-evidence-quality-options").innerHTML = [`<label class="label cursor-pointer justify-start gap-2"><input class="radio radio-sm" type="radio" name="source-evidence-quality" value="" ${!selectedQuality ? "checked" : ""}> Not classified yet</label>`, ...qualities.map((item) => `<label class="label cursor-pointer justify-start gap-2" title="${item.description || ""}"><input class="radio radio-sm" type="radio" name="source-evidence-quality" value="${item.id}" ${selectedQuality === item.id ? "checked" : ""}> ${item.label}</label>`)].join("") + (required ? `<p class="text-xs text-base-content/60 mt-1">Required to complete this task.</p>` : "");
  $("source-evidence-factor-options").className = "grid gap-1";
  $("source-evidence-factor-options").innerHTML = factors.map((item) => `<label class="label cursor-pointer justify-start gap-2"><input class="checkbox checkbox-sm" type="checkbox" name="source-evidence-factor" value="${item.id}" ${selectedFactors.has(item.id) ? "checked" : ""}> ${item.label}</label>`).join("");
  document.querySelectorAll('input[name="source-evidence-quality"], input[name="source-evidence-factor"]').forEach((input) => input.addEventListener("change", () => scheduleSave("started")));
}

function sourceEvidencePayload() {
  return {
    quality: document.querySelector('input[name="source-evidence-quality"]:checked')?.value || "",
    factors: [...document.querySelectorAll('input[name="source-evidence-factor"]:checked')].map((input) => input.value),
  };
}

function initializedSkeleton(task, profileId) {
  const selected = profile(task, profileId) || task.overlays[0];
  const groundTruth = {}, sources = {};
  (state.data.landmarks || []).forEach((landmark) => {
    let point = selected?.keypoints?.[landmark];
    let source = selected;
    if (!point) {
      source = task.overlays.find((item) => item.keypoints?.[landmark]);
      point = source?.keypoints?.[landmark];
    }
    if (!point) return;
    const visibility = Number(source?.visibility?.[landmark] ?? 0);
    const occlusion = visibility >= .75 ? "non_occluded" : visibility >= .25 ? "semi_occluded" : "fully_occluded";
    groundTruth[landmark] = {x: Number(point[0]), y: Number(point[1]), occlusion};
    sources[landmark] = source.overlay_id;
  });
  return {groundTruth, sources};
}

function blankInteractions(groundTruth) {
  return Object.fromEntries(Object.keys(groundTruth).map((landmark) => [landmark, {
    position_drag_count: 0, position_changed: false,
    occlusion_change_count: 0, occlusion_changed: false,
  }]));
}

function inferredInteractions(initial, final) {
  const interactions = blankInteractions(final);
  Object.entries(final).forEach(([landmark, value]) => {
    const starting = initial[landmark];
    if (!starting) return;
    const positionChanged = Math.hypot(value.x - starting.x, value.y - starting.y) > .5;
    const occlusionChanged = value.occlusion !== starting.occlusion;
    interactions[landmark] = {
      position_drag_count: positionChanged ? 1 : 0,
      position_changed: positionChanged,
      occlusion_change_count: occlusionChanged ? 1 : 0,
      occlusion_changed: occlusionChanged,
    };
  });
  return interactions;
}

function resetSkeleton(saveChange = true) {
  const task = state.data.tasks[state.taskIndex];
  const initialized = initializedSkeleton(task, state.initialProfile);
  state.groundTruth = initialized.groundTruth;
  state.initialLandmarkSources = initialized.sources;
  state.initialGroundTruth = structuredClone(state.groundTruth);
  state.landmarkInteractions = blankInteractions(state.groundTruth);
  drawEditor();
  if (saveChange) scheduleSave("started");
}

function selectLandmark(landmark) {
  state.selectedLandmark = landmark;
  drawEditor();
  openLandmarkDialog(landmark);
}

function editorGeometry() {
  const task = state.data.tasks[state.taskIndex];
  const width = Number(task.source_dimensions.width), height = Number(task.source_dimensions.height);
  const points = Object.values(state.groundTruth || {}).filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y));
  const minX = points.length ? Math.min(...points.map((point) => point.x)) : 0;
  const maxX = points.length ? Math.max(...points.map((point) => point.x)) : width;
  const minY = points.length ? Math.min(...points.map((point) => point.y)) : 0;
  const maxY = points.length ? Math.max(...points.map((point) => point.y)) : height;
  // Keep even invalid initial positions inside the interactive canvas so they
  // can be selected and corrected instead of being stranded outside the view.
  const paddingX = Math.ceil(Math.max(width * .04, -minX + 36, maxX - width + 36));
  const paddingTop = Math.ceil(Math.max(height * .01, -minY + 36));
  const paddingBottom = Math.ceil(Math.max(height * .01, maxY - height + 36));
  return {width, height, paddingX, paddingTop, paddingBottom, canvasWidth: width + 2 * paddingX, canvasHeight: height + paddingTop + paddingBottom};
}

function sourcePoint(event) {
  const canvas = $("ground-truth-canvas");
  const rect = canvas.getBoundingClientRect();
  const geometry = editorGeometry();
  const scaleX = canvas.width / rect.width, scaleY = canvas.height / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX - geometry.paddingX,
    y: (event.clientY - rect.top) * scaleY - geometry.paddingTop,
  };
}

function applyCanvasPan() {
  const canvas = $("ground-truth-canvas");
  canvas.style.transform = `translate(${state.canvasPanX}px, ${state.canvasPanY}px)`;
}

function pointerMidpoint() {
  const pointers = [...state.activePointers.values()].slice(0, 2);
  return pointers.length === 2 ? {
    x: (pointers[0].x + pointers[1].x) / 2,
    y: (pointers[0].y + pointers[1].y) / 2,
  } : null;
}

function cancelLandmarkDrag(restore = false) {
  if (restore && state.dragLandmark && state.dragStart) {
    state.groundTruth[state.dragLandmark] = structuredClone(state.dragStart);
    drawEditor();
  }
  state.dragLandmark = null;
  state.dragStart = null;
  state.dragPointerId = null;
  state.dragMoved = false;
}

function nearestLandmark(point, radius) {
  const nearest = Object.entries(state.groundTruth)
    .map(([name, value]) => [name, Math.hypot(value.x - point.x, value.y - point.y)])
    .sort((a, b) => a[1] - b[1])[0];
  return nearest && nearest[1] <= radius ? nearest[0] : null;
}

function drawEditor() {
  const canvas = $("ground-truth-canvas");
  if (!state.sourceImage?.complete) return;
  const geometry = editorGeometry();
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#26312f";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(state.sourceImage, geometry.paddingX, geometry.paddingTop, geometry.width, geometry.height);
  context.strokeStyle = "#d9e1de";
  context.lineWidth = 1;
  context.strokeRect(geometry.paddingX, geometry.paddingTop, geometry.width, geometry.height);
  context.lineWidth = Math.max(2, canvas.width / 200);
  (state.data.pose_edges || []).forEach(([start, end]) => {
    const a = state.groundTruth[start], b = state.groundTruth[end];
    if (!a || !b) return;
    const edgeStates = new Set([a.occlusion, b.occlusion]);
    context.strokeStyle = edgeStates.has("fully_occluded")
      ? "rgba(255, 102, 117, .42)"
      : edgeStates.has("semi_occluded")
        ? "rgba(255, 209, 102, .72)"
        : "rgba(40, 225, 195, .9)";
    context.beginPath(); context.moveTo(a.x + geometry.paddingX, a.y + geometry.paddingTop); context.lineTo(b.x + geometry.paddingX, b.y + geometry.paddingTop); context.stroke();
  });
  Object.entries(state.groundTruth).forEach(([landmark, point]) => {
    const colors = {non_occluded: "#22e2ac", semi_occluded: "#ffd166", fully_occluded: "#ff6675"};
    const drawX = point.x + geometry.paddingX, drawY = point.y + geometry.paddingTop;
    context.beginPath(); context.arc(drawX, drawY, Math.max(5, canvas.width / 70), 0, Math.PI * 2);
    context.fillStyle = colors[point.occlusion]; context.fill(); context.strokeStyle = "#102b27"; context.stroke();
    if (landmark === state.selectedLandmark) {
      context.beginPath(); context.arc(drawX, drawY, Math.max(10, canvas.width / 48), 0, Math.PI * 2);
      context.strokeStyle = "#ffffff"; context.lineWidth = Math.max(2, canvas.width / 160); context.stroke();
    }
    if (point.occlusion === "fully_occluded") {
      const radius = Math.max(5, canvas.width / 70); context.beginPath();
      context.moveTo(drawX - radius, drawY - radius); context.lineTo(drawX + radius, drawY + radius);
      context.moveTo(drawX + radius, drawY - radius); context.lineTo(drawX - radius, drawY + radius); context.stroke();
    }
  });
}

function configureCanvas() {
  const canvas = $("ground-truth-canvas");
  canvas.onpointerdown = (event) => {
    state.activePointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
    canvas.setPointerCapture?.(event.pointerId);
    if (state.activePointers.size > 1) {
      cancelLandmarkDrag(true);
      const midpoint = pointerMidpoint();
      state.panStart = midpoint && {midpoint, x: state.canvasPanX, y: state.canvasPanY};
      return;
    }
    const point = sourcePoint(event);
    const rect = canvas.getBoundingClientRect();
    const hitRadius = 24 * Math.max(canvas.width / rect.width, canvas.height / rect.height);
    const nearest = nearestLandmark(point, hitRadius);
    if (nearest) {
      state.selectedLandmark = nearest;
      drawEditor();
      state.dragLandmark = nearest;
      state.dragPointerId = event.pointerId;
      state.dragStart = structuredClone(state.groundTruth[state.dragLandmark]);
      state.dragMoved = false;
      canvas.setPointerCapture(event.pointerId);
    }
  };
  canvas.onpointermove = (event) => {
    if (state.activePointers.has(event.pointerId)) state.activePointers.set(event.pointerId, {x: event.clientX, y: event.clientY});
    if (state.activePointers.size >= 2) {
      const midpoint = pointerMidpoint();
      if (!state.panStart && midpoint) state.panStart = {midpoint, x: state.canvasPanX, y: state.canvasPanY};
      if (state.panStart && midpoint) {
        state.canvasPanX = state.panStart.x + midpoint.x - state.panStart.midpoint.x;
        state.canvasPanY = state.panStart.y + midpoint.y - state.panStart.midpoint.y;
        applyCanvasPan();
      }
      return;
    }
    if (!state.dragLandmark || event.pointerId !== state.dragPointerId || state.activePointers.size !== 1) return;
    state.dragMoved = true;
    const point = sourcePoint(event), geometry = editorGeometry();
    const landmark = state.groundTruth[state.dragLandmark];
    const minX = -geometry.paddingX, maxX = geometry.width + geometry.paddingX;
    const minY = -geometry.paddingTop, maxY = geometry.height + geometry.paddingBottom;
    landmark.x = Math.max(minX, Math.min(maxX, point.x));
    landmark.y = Math.max(minY, Math.min(maxY, point.y));
    drawEditor();
  };
  canvas.onpointerup = (event) => {
    const wasPanning = state.activePointers.size >= 2 || Boolean(state.panStart);
    state.activePointers.delete(event.pointerId);
    if (!wasPanning && state.dragLandmark && event.pointerId === state.dragPointerId) {
      const point = state.groundTruth[state.dragLandmark];
      if (Math.hypot(point.x - state.dragStart.x, point.y - state.dragStart.y) > .1) {
        const interaction = state.landmarkInteractions[state.dragLandmark];
        interaction.position_drag_count += 1;
        const initial = state.initialGroundTruth[state.dragLandmark];
        interaction.position_changed = !initial || Math.hypot(point.x - initial.x, point.y - initial.y) > .5;
        scheduleSave("started");
      }
      else if (!state.dragMoved) openLandmarkDialog(state.dragLandmark);
    }
    if (event.pointerId === state.dragPointerId) cancelLandmarkDrag();
    if (state.activePointers.size < 2) state.panStart = null;
    canvas.releasePointerCapture?.(event.pointerId);
  };
  canvas.onpointercancel = (event) => { state.activePointers.delete(event.pointerId); cancelLandmarkDrag(); if (state.activePointers.size < 2) state.panStart = null; };
}

function zoomImage(src, alt) { $("dialog-image").src = src; $("dialog-image").alt = alt; $("image-dialog").showModal(); }
function render() {
  const task = state.data.tasks[state.taskIndex], judgment = latest(task), progress = state.data.progress;
  $("give-up-video").hidden = true;
  $("progress").textContent = `${progress.completed} / ${progress.total} Completed`;
  $("task-picker").innerHTML = state.data.tasks.map((item, index) => `<option value="${index}" ${index === state.taskIndex ? "selected" : ""}>Case ${index + 1}: ${taskStatus(item).replace(/^./, (letter) => letter.toUpperCase())}</option>`).join("");
  if (isTemporalTask(task)) {
    $("triage-screen").hidden = true;
    renderTemporalTask(task, judgment);
    return;
  }
  if (isTriageTask(task)) {
    $("temporal-screen").hidden = true;
    renderTriageTask(task, judgment);
    return;
  }
  if (isErrorMarkingTask(task)) {
    renderErrorMarkingTask(task, judgment);
    return;
  }
  if (isQualityRatingTask(task)) {
    renderQualityRatingTask(task, judgment);
    return;
  }
  pauseTemporalVideos();
  hideAllScreens();
  state.canvasPanX = 0; state.canvasPanY = 0; state.panStart = null;
  applyCanvasPan();
  $("mark-unclear").hidden = false;
  if (!state.selectedLandmark || !state.groundTruth[state.selectedLandmark]) {
    state.selectedLandmark = mostDiscrepantLandmark(task);
  }

  const defaultProfile = task.default_initial_profile || (task.overlays.some((item) => item.overlay_id === "C1") ? "C1" : task.overlays[0].overlay_id);
  state.initialProfile = judgment?.ground_truth_initial_profile || defaultProfile;
  const initialized = initializedSkeleton(task, state.initialProfile);
  const generatedInitial = initialized.groundTruth;
  state.initialGroundTruth = judgment?.initial_ground_truth_landmarks && Object.keys(judgment.initial_ground_truth_landmarks).length ? structuredClone(judgment.initial_ground_truth_landmarks) : structuredClone(generatedInitial);
  state.initialLandmarkSources = judgment?.initial_landmark_sources && Object.keys(judgment.initial_landmark_sources).length ? structuredClone(judgment.initial_landmark_sources) : structuredClone(initialized.sources);
  state.groundTruth = judgment?.ground_truth_landmarks && Object.keys(judgment.ground_truth_landmarks).length ? structuredClone(judgment.ground_truth_landmarks) : structuredClone(generatedInitial);
  state.landmarkInteractions = judgment?.landmark_interactions && Object.keys(judgment.landmark_interactions).length ? structuredClone(judgment.landmark_interactions) : inferredInteractions(state.initialGroundTruth, state.groundTruth);
  const canvas = $("ground-truth-canvas"), geometry = editorGeometry();
  canvas.width = geometry.canvasWidth; canvas.height = geometry.canvasHeight;
  loadSourceImage(task);
  $("frame-note").value = judgment?.notes || "";
  $("frame-note").oninput = () => scheduleSave("started");
  renderSourceEvidence(task, judgment);
  showFrameScreen(state.screen);
}

function payload(status) {
  const task = state.data.tasks[state.taskIndex];
  if (isFrameUsabilityTask(task)) {
    const count = Number(task.frame_count);
    return {
      annotator: state.annotator, task_id: task.task_id, status,
      frame_usability_response: {labels: state.frameUsabilityLabels, automatic_missing_pose_frames: state.errorMarkingAutoBadFrames, marks: state.errorMarks, note: $("error-marking-note").value.trim(), video_usability_rating_override: state.frameVideoDisposition, last_viewed_frame: errorMarkingCurrentFrame()},
      tier_assignments: {},
    };
  }
  if (isTemporalTask(task)) {
    const temporalResponse = temporalResponsePayload();
    if (status === "completed" && !temporalResponse.choice) {
      throw new Error("Choose A, B, C, no discernible difference, or cannot judge.");
    }
    if (status === "completed" && temporalResponse.choice !== "cannot_judge" && !temporalResponse.confidence) {
      throw new Error("Choose low, medium, or high confidence.");
    }
    return {
      annotator: state.annotator,
      task_id: task.task_id,
      status,
      temporal_response: temporalResponse,
      tier_assignments: {},
    };
  }
  if (isTriageTask(task)) {
    const triageResponse = triageResponsePayload();
    if (status === "completed" && !triageResponse.verdict) {
      throw new Error("Choose looks fine, has a problem, or can't judge.");
    }
    return {
      annotator: state.annotator,
      task_id: task.task_id,
      status,
      triage_response: triageResponse,
      tier_assignments: {},
    };
  }
  if (isErrorMarkingTask(task)) {
    const errorMarkingResponse = errorMarkingResponsePayload();
    if (status === "completed" && !errorMarkingResponse.video_usability_rating) {
      throw new Error("Choose an overall video usability rating before completing this case.");
    }
    if (status === "completed" && errorMarkingResponse.video_unusable && !errorMarkingResponse.video_unusable_reason) {
      throw new Error(isVideoRatingOnlyTask(task) ? "Explain why this video is unusable." : "Explain why this entire video is too flawed to annotate.");
    }
    if (status === "completed" && !isVideoRatingOnlyTask(task) && !isFrameUsabilityTask(task) && !errorMarkingResponse.video_unusable && !errorMarkingResponse.marks.length && !errorMarkingResponse.bad_frames.length && !errorMarkingResponse.usable_frames.length && !errorMarkingResponse.no_errors_found) {
      throw new Error('Add at least one error mark, flag an unusable frame, mark the video as too flawed, or check "No errors observed in this clip."');
    }
    return {
      annotator: state.annotator,
      task_id: task.task_id,
      status,
      error_marking_response: errorMarkingResponse,
      tier_assignments: {},
    };
  }
  if (isQualityRatingTask(task)) {
    const qualityRatingResponse = qualityRatingResponsePayload();
    if (status === "completed" && (!qualityRatingResponse.lighting || !qualityRatingResponse.clothing)) {
      throw new Error("Choose a lighting rating and a clothing rating.");
    }
    return {
      annotator: state.annotator,
      task_id: task.task_id,
      status,
      quality_rating_response: qualityRatingResponse,
      tier_assignments: {},
    };
  }
  const sourceEvidence = sourceEvidencePayload();
  return {annotator: state.annotator, task_id: task.task_id, status, tier_assignments: {}, notes: $("frame-note").value.trim(), tags: [], overlay_tags: {}, overlay_notes: {}, source_evidence_quality: sourceEvidence.quality, source_evidence_factors: sourceEvidence.factors, ground_truth_landmarks: state.groundTruth, initial_ground_truth_landmarks: state.initialGroundTruth, initial_landmark_sources: state.initialLandmarkSources, landmark_interactions: state.landmarkInteractions, ground_truth_initial_profile: state.initialProfile};
}
function scheduleSave(status, delayMs = 500) {
  const task = state.data?.tasks?.[state.taskIndex];
  if (task && isErrorMarkingTask(task)) state.errorMarkingDirty = true;
  clearTimeout(state.timer); state.pendingStatus = status; $("save-state").textContent = "unsaved…"; state.timer = setTimeout(() => save(status), delayMs);
}
async function save(status) {
  clearTimeout(state.timer); state.timer = null; state.pendingStatus = null; const submission = payload(status); const previous = state.savePromise || Promise.resolve(true);
  const request = previous.then(async () => { try { const response = await authenticatedFetch("/api/judgments", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(submission)}); const result = await responseJson(response); $("save-state").textContent = `saved revision ${result.revision_id}`; return true; } catch (error) { $("save-state").textContent = "save failed"; alert(`Save failed: ${error.message || error}`); return false; } });
  state.savePromise = request; const succeeded = await request; if (state.savePromise === request) state.savePromise = null; return succeeded;
}
async function flushPendingSave() { if (!state.timer) return state.savePromise ? await state.savePromise : true; const status = state.pendingStatus || "started"; clearTimeout(state.timer); state.timer = null; if (state.savePromise && !(await state.savePromise)) return false; return save(status); }
async function refresh(renderAfter = true) { const response = await authenticatedFetch(`/api/state?annotator=${encodeURIComponent(state.annotator)}`); state.data = await responseJson(response); if (renderAfter) render(); }
async function downloadExport(format) {
  try {
    const response = await authenticatedFetch(`/api/export.${format}`);
    if (!response.ok) throw new Error(response.status === 401 ? "access code required" : `export failed (${response.status})`);
    const blob = await response.blob(), url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = `annotation-revisions.${format}`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { alert(`Could not download export: ${error.message}`); }
}
function lockInteraction(locked) {
  $("workspace").querySelectorAll("button, select, input, textarea").forEach((element) => { element.disabled = locked; });
  $("ground-truth-canvas").style.pointerEvents = locked ? "none" : "auto";
}
async function navigateTo(targetIndex) {
  lockInteraction(true);
  try {
    pauseTemporalVideos();
    if (!(await flushPendingSave())) return;
    await refresh(false);
    state.taskIndex = targetIndex;
    render();
  } catch (error) {
    $("save-state").textContent = "could not load case";
    alert(`Could not load the selected case: ${error.message || error}`);
  } finally {
    lockInteraction(false);
  }
}

$("start").onclick = loadState;
$("task-picker").onchange = (event) => navigateTo(Number(event.target.value)); $("reset-skeleton").onclick = () => resetSkeleton(true); configureCanvas();
$("to-annotation").onclick = () => { state.screen = "annotation"; showFrameScreen(state.screen); };
$("back-to-skeleton").onclick = () => { state.screen = "skeleton"; showFrameScreen(state.screen); };
$("temporal-play").onclick = () => playTemporalVideos(false);
$("temporal-pause").onclick = pauseTemporalVideos;
$("temporal-restart").onclick = () => playTemporalVideos(true);
$("temporal-speed-half").onclick = () => setTemporalSpeed(.5);
$("temporal-speed-normal").onclick = () => setTemporalSpeed(1);
$("logout").onclick = async () => { try { await authenticatedFetch("/api/logout", {method: "POST"}); } finally { pauseTemporalVideos(); localStorage.removeItem("annotation-access-token"); localStorage.removeItem("annotation-annotator"); sessionStorage.removeItem("annotation-access-token"); $("access-token").value = ""; $("annotator").value = ""; $("remember-access-token").checked = false; $("workspace").hidden = true; $("login-panel").hidden = false; $("user-menu").hidden = true; $("save-state").textContent = "logged out"; } };
const rememberedToken = localStorage.getItem("annotation-access-token");
const rememberedAnnotator = localStorage.getItem("annotation-annotator");
if (rememberedToken) $("access-token").value = rememberedToken;
if (rememberedToken || rememberedAnnotator) {
  if (rememberedAnnotator) $("annotator").value = rememberedAnnotator;
  $("remember-access-token").checked = true;
}
// Auto-load needs to know whether the server actually requires a token
// before deciding a remembered annotator alone is enough: on a plain local
// server (no --access-token) there is never a remembered token to check,
// so gating on "both remembered" left local annotators re-clicking "Load /
// resume" by hand on every revisit despite "Remember this device".
fetch("/api/access-info").then(responseJson).then((info) => {
  if (!info.access_token_required) $("access-token-field").hidden = true;
  if (rememberedAnnotator && (rememberedToken || !info.access_token_required)) loadState();
}).catch(() => {
  if (rememberedToken && rememberedAnnotator) loadState();
});
const frameUsabilityToggle = $("error-marking-frame-usability-toggle");
function flashFrameUsabilityToggle() {
  if (!frameUsabilityToggle?.animate) return;
  frameUsabilityToggle.getAnimations().forEach((animation) => animation.cancel());
  frameUsabilityToggle.animate(
    [{transform: "scale(1)"}, {transform: "scale(.97)"}, {transform: "scale(1)"}],
    {duration: 160, easing: "ease-out"},
  );
}
attachSegmentedControlHandlers();
$("error-marking-video-unusable-reason").oninput = syncErrorMarkingNote;
function setGiveUpButtonState() {
  const undo = state.frameVideoDisposition === "unusable";
  $("give-up-video").textContent = undo ? "Undo" : "Give up";
  $("give-up-video").setAttribute("aria-label", undo ? "Undo give up and resume annotation" : "Give up on video");
  $("give-up-video").title = undo ? "Clear the unusable override and resume this video" : "Mark this video unusable and finish this task";
}
document.querySelectorAll(".actions button[data-status]").forEach((button) => button.onclick = async () => {
  const task = state.data?.tasks?.[state.taskIndex];
  if (button.dataset.status === "completed" && isFrameUsabilityTask(task) && !["loaded", "absent"].includes(state.errorMarkingLandmarksStatus)) {
    if (state.errorMarkingLandmarksStatus === "failed") await loadErrorMarkingLandmarks(task, true);
    if (!["loaded", "absent"].includes(state.errorMarkingLandmarksStatus)) {
      alert("Pose data must load before completing this case so automatic missing-pose marks are included. You can retry or skip the case.");
      return;
    }
  }
  if (button.dataset.status === "completed" && task && isErrorMarkingTask(task) && !isFrameUsabilityTask(task) && state.errorMarkingVideoUnusable && !state.errorMarkingVideoUnusableReason.trim()) {
    alert(isVideoRatingOnlyTask(task) ? "Explain why this video is unusable." : "Explain why this entire video is too flawed to annotate.");
    $("error-marking-video-unusable-reason")?.focus();
    return;
  }
  if (button.dataset.status === "completed" && task && isErrorMarkingTask(task) && !isFrameUsabilityTask(task) && !state.errorMarkingVideoUsabilityRating) {
    alert("Choose an overall video usability rating before completing this case.");
    $("error-marking-usability-rating")?.scrollIntoView({behavior: "smooth", block: "center"});
    return;
  }
  if (button.dataset.status === "completed" && task && isErrorMarkingTask(task) && !isVideoRatingOnlyTask(task) && !isFrameUsabilityTask(task) && !state.errorMarkingVideoUnusable && !state.errorMarks.length && !allBadFrameNumbers().length && !state.errorMarkingUsableFrames.length) {
    if (!confirm("No errors or unusable frames were marked for this clip. Complete it as “no errors observed”?")) return;
    state.errorMarkingNoErrorsConfirmed = true;
  }
  // Gate completion on a replay review only when there's something new to
  // look at -- state.errorMarkingDirty tracks edits since the last time this
  // dialog was shown (see scheduleSave() and openErrorMarkingReviewDialog()),
  // not just since the task loaded.
  if (button.dataset.status === "completed" && task && isErrorMarkingTask(task) && !isVideoRatingOnlyTask(task) && !isFrameUsabilityTask(task) && state.errorMarkingDirty) {
    openErrorMarkingReviewDialog();
    return;
  }
  if (button.dataset.status === "completed" && isFrameUsabilityTask(task)) {
    state.frameVideoDisposition = null;
    setGiveUpButtonState();
  }
  await submitStatusAndAdvance(button.dataset.status);
});
$("give-up-video").onclick = async () => {
  if (!isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex])) return;
  if (state.frameVideoDisposition === "unusable") {
    state.frameVideoDisposition = null;
    setGiveUpButtonState();
    lockInteraction(true);
    try {
      if (!(await flushPendingSave())) return;
      const saved = await save("started");
      if (saved) {
        await refresh(false);
        render();
      }
    } catch (error) {
      $("save-state").textContent = "could not resume";
      alert(`Could not clear the unusable override: ${error.message || error}`);
    } finally {
      lockInteraction(false);
    }
    return;
  }
  state.frameVideoDisposition = "unusable";
  setGiveUpButtonState();
  await submitStatusAndAdvance("completed");
};
async function submitStatusAndAdvance(status) {
  lockInteraction(true);
  try {
    if (!(await flushPendingSave())) return;
    const saved = await save(status);
    if (saved) {
      await refresh(false);
      if (state.taskIndex < state.data.tasks.length - 1) state.taskIndex++;
      state.screen = "skeleton";
      render();
    }
  } catch (error) {
    $("save-state").textContent = "could not advance";
    alert(`Could not advance to the next case: ${error.message || error}`);
  } finally {
    lockInteraction(false);
  }
}
$("error-marking-review-replay").onclick = () => {
  if (state.errorMarkingReviewReplayHandle) {
    stopErrorMarkingReviewReplay();
    $("error-marking-review-status").textContent = "Paused.";
  } else replayErrorMarkingReview();
};
$("error-marking-review-edit").onclick = () => closeErrorMarkingReviewDialog();
$("error-marking-review-looks-good").onclick = async () => {
  closeErrorMarkingReviewDialog();
  await submitStatusAndAdvance("completed");
};
$("error-marking-review-dialog").addEventListener("close", stopErrorMarkingReviewReplay);
$("error-marking-skip-start").onclick = () => {
  stopErrorMarkingReplay();
  const video = errorMarkingVideo();
  video.pause();
  setErrorMarkingFrame(0);
  video.currentTime = frameToTime(0);
  updateErrorMarkingFrameIndicator(0);
};
$("frame-mobile-back").onclick = () => stepErrorMarkingVideo(-1);
$("frame-mobile-forward").onclick = () => {
  if (errorMarkingCurrentFrame() >= Math.max(errorMarkingFrameCount() - 1, 0)) {
    if (confirm("Complete this frame annotation task?")) $("complete-case").click();
  } else stepErrorMarkingVideo(1);
};
$("frame-mobile-play").onclick = () => {
  if (state.errorMarkingReplayHandle && state.errorMarkingReplayDirection === 1) stopErrorMarkingReplay();
  else replayErrorMarking();
  updateFrameMobileControls();
};
$("frame-mobile-unusable").onclick = () => markFrameUsability(errorMarkingCurrentFrame(), "unusable");
$("frame-mobile-usable").onclick = () => markFrameUsability(errorMarkingCurrentFrame(), hasFrameCorrection() ? "flawed" : "good");
$("frame-mobile-give-up").onclick = () => $("give-up-video").click();
$("frame-mobile-skip").onclick = () => $("skip-case").click();
$("frame-mobile-zoom").onchange = (event) => setFrameViewZoom(event.target.value);
$("frame-mobile-scrubber").oninput = (event) => {
  stopErrorMarkingReplay();
  const frame = Number(event.target.value);
  state.frameViewForceRecenter = true;
  errorMarkingVideo().pause();
  setErrorMarkingFrame(frame);
  errorMarkingVideo().currentTime = frameToTime(frame);
  state.frameViewLastFollowFrame = null;
  state.frameViewGesturePanFrame = null;
  updateErrorMarkingFrameIndicator(frame);
};
$("frame-mobile-pan").onclick = () => {
  state.frameViewPanEnabled = !state.frameViewPanEnabled && state.frameViewZoom > 1;
  if (state.frameViewPanEnabled) {
    state.frameViewGesturePanFrame = errorMarkingCurrentFrame();
    state.frameViewForceRecenter = false;
  }
  else state.frameViewGesturePanFrame = null;
  $("frame-mobile-pan").setAttribute("aria-pressed", String(state.frameViewPanEnabled));
  $("frame-mobile-pan").textContent = state.frameViewPanEnabled ? "Pan enabled · drag background" : "Enable pan";
  $("frame-mobile-pan").setAttribute("aria-label", state.frameViewPanEnabled ? "Disable video panning" : "Enable video panning");
  updateFrameViewTransform();
};
$("frame-mobile-timeline").onclick = () => {
  const details = $("frame-mobile-details");
  details.open = !details.open;
  $("frame-mobile-timeline").setAttribute("aria-expanded", String(details.open));
  $("frame-mobile-timeline").textContent = details.open ? "Hide timeline and notes" : "Show timeline and notes";
  $("frame-mobile-timeline").setAttribute("aria-label", details.open ? "Hide timeline and notes" : "Show timeline and notes");
  $("frame-mobile-overflow").open = false;
};
window.addEventListener("resize", () => {
  placeFrameMobileTools();
  const mobileMode = isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex]) && window.matchMedia("(max-width: 700px)").matches;
  if (mobileMode !== state.frameViewMobileMode) {
    state.frameViewMobileMode = mobileMode;
    state.frameViewZoomMode = mobileMode ? "auto" : "manual";
    state.frameViewAutoZoomOverride = null;
    state.frameViewZoom = 1;
    state.frameViewPanX = 0;
    state.frameViewPanY = 0;
    $("frame-mobile-zoom").value = state.frameViewZoomMode === "auto" ? "auto" : "1";
  }
  updateFrameViewTransform();
  updateFrameMobileControls();
  if (isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex])) $("frame-mobile-details").open = $("frame-mobile-bar").hidden;
});
$("error-marking-step-back-5").onclick = () => stepErrorMarkingVideo(-5);
$("error-marking-step-back-1").onclick = () => stepErrorMarkingVideo(-1);
$("error-marking-step-forward-1").onclick = () => stepErrorMarkingVideo(1);
$("error-marking-step-forward-5").onclick = () => stepErrorMarkingVideo(5);
document.addEventListener("keydown", (event) => {
  if (!isFrameUsabilityTask(state.data?.tasks?.[state.taskIndex])) return;
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const target = event.target;
  if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true'], [role='slider'], [role='radio'], dialog[open], [popover]:popover-open")) return;
  event.preventDefault();
  stepErrorMarkingVideo(event.key === "ArrowLeft" ? -1 : 1);
});
$("error-marking-replay").onclick = () => {
  if (state.errorMarkingReplayHandle && state.errorMarkingReplayDirection === 1) stopErrorMarkingReplay();
  else replayErrorMarking();
};
$("error-marking-replay-backwards").onclick = () => {
  if (state.errorMarkingReplayHandle && state.errorMarkingReplayDirection === -1) stopErrorMarkingReplay();
  else replayErrorMarkingBackwards();
};
const errorMarkingFpsSelect = $("error-marking-fps-select");
errorMarkingFpsSelect.onpointerdown = () => errorMarkingFpsSelect.classList.add("fps-select-open");
errorMarkingFpsSelect.onkeydown = (event) => {
  if ([" ", "ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End"].includes(event.key)) {
    errorMarkingFpsSelect.classList.add("fps-select-open");
  }
};
errorMarkingFpsSelect.onblur = () => errorMarkingFpsSelect.classList.remove("fps-select-open");
errorMarkingFpsSelect.onchange = () => {
  errorMarkingFpsSelect.classList.remove("fps-select-open");
  const direction = state.errorMarkingReplayDirection;
  if (direction === 1) replayErrorMarking();
  else if (direction === -1) replayErrorMarkingBackwards();
};
$("error-mark-dialog-note").oninput = () => {
  if (state.activeMarkIndex == null) return;
  state.errorMarks[state.activeMarkIndex].note = $("error-mark-dialog-note").value;
  scheduleSave("started");
};
$("error-mark-dialog-remove").onclick = () => {
  if (state.activeMarkIndex == null) return;
  state.errorMarks.splice(state.activeMarkIndex, 1);
  state.activeMarkIndex = null;
  $("error-mark-dialog").close();
  renderErrorMarkingTimeline();
  // The removed mark may own the corrected position shown at the current
  // frame. Repaint immediately so that point, its connected segments, and
  // the original-position ghost all return to their unmarked state.
  renderSkeletonOverlay();
  scheduleSave("started");
};
$("error-marking-manage-causes").onclick = () => openListManager("cause");
$("list-manager-add").onclick = () => {
  const input = $("list-manager-new-label");
  const label = input.value.trim();
  if (!label) return;
  const kind = state.editingListKind, list = errorListArray(kind);
  const existingIds = new Set(list.map((item) => item.id));
  let id = slugifyErrorListEntry(label), suffix = 1;
  while (existingIds.has(id)) { id = `${slugifyErrorListEntry(label)}_${++suffix}`; }
  list.push({id, label});
  saveErrorList(kind, list);
  renderListManager();
  input.value = "";
};
$("list-manager-new-label").onkeydown = (event) => { if (event.key === "Enter") { event.preventDefault(); $("list-manager-add").click(); } };
$("list-manager-reset").onclick = () => {
  const kind = state.editingListKind;
  saveErrorList(kind, defaultErrorList(kind));
  renderListManager();
};
$("access-token").oninput = (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); };
document.querySelectorAll(".export-button").forEach((button) => button.onclick = () => downloadExport(button.dataset.export));
