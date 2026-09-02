const state = {
  data: null, taskIndex: 0, annotator: "", timer: null, pendingStatus: null,
  savePromise: null, draggedOverlay: null, groundTruth: {}, initialProfile: "",
  initialGroundTruth: {}, initialLandmarkSources: {}, landmarkInteractions: {}, sourceImage: null,
  sourceObjectUrl: null, dragLandmark: null, dragStart: null, dragMoved: false,
  activePointers: new Map(), selectedLandmark: null, screen: "skeleton",
  temporalPlaybackRate: 1, errorMarks: [],
  errorBodyParts: [], errorCauses: [], editingListKind: "body_part",
  activeMarkIndex: null, errorMarkingNoErrorsConfirmed: false,
  editingBodyParts: false, addingBodyPartEntry: false,
};
const $ = (id) => document.getElementById(id);

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
  // Keep the editor interactive so another landmark can be selected directly.
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
function isErrorMarkingTask(task) { return task.task_type === "error_marking"; }
function isQualityRatingTask(task) { return task.task_type === "video_quality_rating"; }
const ALL_SCREEN_IDS = ["skeleton-screen", "annotation-screen", "temporal-screen", "triage-screen", "error-marking-screen", "quality-rating-screen"];
function hideAllScreens() { ALL_SCREEN_IDS.forEach((id) => { $(id).hidden = true; }); }

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
    {id: "right_arm", label: "Right arm"},
    {id: "left_arm", label: "Left arm"},
    {id: "hips", label: "Hips"},
    {id: "right_leg", label: "Right leg"},
    {id: "left_leg", label: "Left leg"},
    {id: "torso", label: "Shoulders"},
    {id: "head", label: "Head"},
    {id: "other", label: "Other"},
  ],
  cause: [
    {id: "occlusion", label: "Occlusion (limb crosses/hides behind body)"},
    {id: "out_of_frame", label: "Out of frame"},
    {id: "missing_tracking", label: "Missing / lost tracking"},
    {id: "other", label: "Other"},
  ],
};

function defaultErrorList(kind) {
  const source = (state.data && state.data[ERROR_LIST_SERVER_KEYS[kind]]) || FALLBACK_ERROR_LISTS[kind];
  return source.map((item) => ({...item}));
}

// One-time forward-migration for a device's already-persisted body-part list:
// merges a still-default "Right hip"/"Left hip" pair into one "Hips" entry,
// and renames a still-default "Torso" label to "Shoulders" (same id, so any
// already-submitted marks tagged with it keep displaying correctly under the
// new label). Only touches entries an annotator hasn't already customized
// away from the shipped defaults.
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
  return list;
}

function loadErrorList(kind) {
  try {
    const stored = JSON.parse(localStorage.getItem(ERROR_LIST_STORAGE_KEYS[kind]) || "null");
    if (Array.isArray(stored) && stored.length) {
      if (kind !== "body_part") return stored;
      const migrated = migrateBodyPartDefaults(stored);
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
function errorMarkingCurrentFrame() { return Math.round(errorMarkingVideo().currentTime * errorMarkingFps()); }

function frameCoveredForPart(partId, frame) {
  return state.errorMarks.some((mark) => mark.body_part === partId && frame >= mark.start_frame && frame <= mark.end_frame);
}

function updateTimelineAddButtons() {
  const frame = errorMarkingCurrentFrame();
  $("error-marking-timeline").querySelectorAll("[data-add-part]").forEach((button) => {
    button.disabled = frameCoveredForPart(button.dataset.addPart, frame);
  });
}

function updateErrorMarkingFrameIndicator() {
  const total = errorMarkingFrameCount();
  const frame = errorMarkingCurrentFrame();
  $("error-marking-frame-indicator").textContent = `frame ${frame} / ${Math.max(total - 1, 0)}`;
  const scrubber = $("error-marking-scrubber");
  if (document.activeElement !== scrubber) scrubber.value = frame;
  updateTimelineAddButtons();
}

function stepErrorMarkingVideo(deltaFrames) {
  const video = errorMarkingVideo(), fps = errorMarkingFps(), frameCount = errorMarkingFrameCount();
  const maxTime = frameCount ? (frameCount - 1) / fps : (video.duration || 0);
  video.pause();
  video.currentTime = Math.max(0, Math.min(maxTime, video.currentTime + deltaFrames / fps));
  updateErrorMarkingFrameIndicator();
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

function timelineRowGroups() {
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

function renderErrorMarkingLegend() {
  const causes = errorListArray("cause");
  const swatch = (color, label) => `<span class="timeline-legend-item"><span class="timeline-legend-swatch" style="background:${color}"></span>${label}</span>`;
  return `<div class="timeline-legend">${swatch(UNSET_CAUSE_COLOR, "No cause set")}${causes.map((cause) => swatch(causeColor(cause.id), cause.label)).join("")}</div>`;
}

function renderErrorMarkingTimeline() {
  const container = $("error-marking-timeline");
  const groups = timelineRowGroups();
  const frameCount = Math.max(errorMarkingFrameCount() - 1, 1);
  const currentFrame = errorMarkingCurrentFrame();
  const minTrackWidth = Math.max(1, errorMarkingFrameCount()) * MIN_TIMELINE_PX_PER_FRAME;
  const editing = state.editingBodyParts;

  // Row headers and row tracks are separate DOM subtrees (so the track
  // column alone can scroll horizontally) but must land on the same grid
  // row line-for-line. grid-rows-subgrid on both makes that alignment the
  // grid engine's job instead of something two independently-stacked lists
  // have to be kept in sync by construction.
  const headerCells = groups.map(({part}) => `
    <div class="timeline-row-header">
      <span class="timeline-row-label">${part.label}</span>
      ${editing
        ? `<button type="button" class="btn btn-xs btn-circle btn-ghost text-error timeline-add-btn" data-delete-part="${part.id}" aria-label="Remove ${part.label}" title="Remove ${part.label}">⊖</button>`
        : `<button type="button" class="btn btn-xs btn-circle timeline-add-btn" data-add-part="${part.id}" aria-label="Start a new ${part.label} error at the current frame" title="Start a new ${part.label} error at the current frame" ${frameCoveredForPart(part.id, currentFrame) ? "disabled" : ""}>+</button>`}
    </div>`
  ).join("");

  const trackCells = groups.map(({part, indices}) =>
    `<div class="timeline-row-track" data-track-part="${part.id}">${indices.map((index) => renderTimelineSegment(index, frameCount)).join("")}</div>`
  ).join("");

  const footerHTML = (editing
    ? `<div class="flex items-center">${state.addingBodyPartEntry
        ? `<input type="text" id="timeline-add-body-part-input" class="input input-xs timeline-add-input" placeholder="New body part" aria-label="New body part label">`
        : `<button type="button" id="timeline-add-body-part-btn" class="btn btn-xs btn-circle timeline-add-btn" aria-label="Add a new body part" title="Add a new body part">+</button>`}</div>`
    : "") +
    `<button type="button" id="timeline-edit-body-parts-toggle" class="btn btn-xs btn-ghost timeline-edit-toggle" aria-label="${editing ? "Done editing body parts" : "Edit body parts"}" title="${editing ? "Done editing body parts" : "Edit body parts"}">${editing ? "✓ Done" : "Edit"}</button>`;

  container.innerHTML = `<div class="mb-1 text-xs font-bold uppercase tracking-widest text-base-content/60">Click + to start a new error at the current frame, or click-drag an empty part of the timeline. Click an existing span to set its cause; drag its edges to adjust.</div>` +
    `<div class="timeline-grid grid gap-x-[.6rem] items-stretch" style="grid-template-columns:auto 1fr;grid-template-rows:repeat(${groups.length},1.6rem);row-gap:.4rem">
      <div class="timeline-left-col grid grid-rows-subgrid row-start-1" style="grid-row-end:span ${groups.length}">${headerCells}</div>
      <div class="timeline-scroll grid grid-rows-subgrid row-start-1" style="grid-row-end:span ${groups.length}">
        <div class="timeline-scroll-inner grid grid-rows-subgrid row-start-1" style="grid-row-end:span ${groups.length};min-width:${minTrackWidth}px">${trackCells}</div>
      </div>
    </div>
    <div class="timeline-footer mt-2 flex items-center gap-2">${footerHTML}</div>` + renderErrorMarkingLegend();
  attachTimelineHandlers();
  if (state.addingBodyPartEntry) $("timeline-add-body-part-input")?.focus();
}

function addMarkAtCurrentFrame(partId) {
  const frame = errorMarkingCurrentFrame();
  if (frameCoveredForPart(partId, frame)) return;
  state.errorMarks.push({body_part: partId, start_frame: frame, end_frame: frame, causes: [], note: ""});
  const index = state.errorMarks.length - 1;
  state.errorMarkingNoErrorsConfirmed = false;
  renderErrorMarkingTimeline();
  scheduleSave("started");
  openErrorMarkPopup(index);
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
    const addButton = event.target.closest("[data-add-part]");
    if (addButton) { if (!addButton.disabled) addMarkAtCurrentFrame(addButton.dataset.addPart); return; }
    const segment = event.target.closest(".timeline-segment");
    if (!segment || event.target.closest(".timeline-handle")) return;
    openErrorMarkPopup(Number(segment.dataset.markIndex));
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
    const handle = event.target.closest(".timeline-handle");
    if (handle) { startTimelineHandleDrag(event, handle); return; }
    if (event.target.closest(".timeline-segment")) return;
    const track = event.target.closest(".timeline-row-track");
    if (track) startNewMarkDrag(event, track);
  });
}

function startTimelineHandleDrag(event, handleEl) {
  event.preventDefault();
  event.stopPropagation();
  const index = Number(handleEl.dataset.markIndex);
  const edge = handleEl.dataset.handle;
  const track = handleEl.closest(".timeline-row-track");
  const frameCount = Math.max(errorMarkingFrameCount() - 1, 1);
  const fps = errorMarkingFps();
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
    video.currentTime = Math.max(0, frame / fps);
    updateErrorMarkingFrameIndicator();
    updateTimelineSegmentPosition(index);
  }

  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    if (dragged) {
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
  event.preventDefault();
  const partId = track.dataset.trackPart;
  const frameCount = Math.max(errorMarkingFrameCount() - 1, 1);
  const fps = errorMarkingFps();
  const video = errorMarkingVideo();
  video.pause();

  function frameFromClientX(clientX, liveTrack) {
    const rect = liveTrack.getBoundingClientRect();
    const fraction = rect.width ? Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1) : 0;
    return Math.round(fraction * frameCount);
  }

  const originFrame = frameFromClientX(event.clientX, track);
  state.errorMarks.push({body_part: partId, start_frame: originFrame, end_frame: originFrame, causes: [], note: ""});
  const index = state.errorMarks.length - 1;
  state.errorMarkingNoErrorsConfirmed = false;
  video.currentTime = Math.max(0, originFrame / fps);
  updateErrorMarkingFrameIndicator();
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
    video.currentTime = Math.max(0, frame / fps);
    updateErrorMarkingFrameIndicator();
    updateTimelineSegmentPosition(index);
  }

  function onUp() {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    renderErrorMarkingTimeline();
    scheduleSave("started");
    openErrorMarkPopup(index);
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
  await seekVideoTo(video, midFrame(mark) / errorMarkingFps());
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
      scheduleSave("started");
    };
  });
}

function openErrorMarkPopup(index) {
  state.activeMarkIndex = index;
  const mark = state.errorMarks[index];
  $("error-mark-dialog-title").textContent = bodyPartLabel(mark.body_part);
  $("error-mark-dialog-frames").textContent = `frames ${mark.start_frame}–${mark.end_frame}`;
  renderErrorMarkDialogCauses(mark);
  $("error-mark-dialog-note").value = mark.note || "";
  $("error-mark-dialog").showModal();
  captureErrorMarkPreview(mark).catch(() => {});
}

function renderErrorMarkingTask(task, judgment) {
  pauseTemporalVideos();
  hideAllScreens();
  $("error-marking-screen").hidden = false;
  $("mark-unclear").hidden = true;

  $("error-marking-category-badge").textContent = TRIAGE_CATEGORY_LABELS[task.category] || task.category || "";

  const video = errorMarkingVideo();
  video.pause();
  video.src = `/artifacts/${task.source_artifact}`;
  video.load();
  video.ontimeupdate = updateErrorMarkingFrameIndicator;
  video.onloadedmetadata = () => {
    $("error-marking-scrubber").max = Math.max(errorMarkingFrameCount() - 1, 0);
    updateErrorMarkingFrameIndicator();
    renderErrorMarkingTimeline();
  };

  const response = judgment?.error_marking_response || {};
  state.errorMarks = structuredClone(response.marks || []).map((mark) => ({causes: [], note: "", ...mark}));
  state.errorMarkingNoErrorsConfirmed = false;
  state.editingBodyParts = false;
  state.addingBodyPartEntry = false;
  renderErrorMarkingTimeline();
  updateErrorMarkingFrameIndicator();
  $("error-marking-note").value = response.note || "";
  $("error-marking-note").oninput = () => scheduleSave("started");
}

function errorMarkingResponsePayload() {
  return {
    marks: state.errorMarks,
    no_errors_found: state.errorMarks.length === 0 && Boolean(state.errorMarkingNoErrorsConfirmed),
    note: $("error-marking-note").value.trim(),
  };
}

function renderQualityRatingTask(task, judgment) {
  pauseTemporalVideos();
  hideAllScreens();
  $("quality-rating-screen").hidden = false;
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
    if (state.activePointers.size > 1) return;
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
    state.activePointers.delete(event.pointerId);
    if (state.dragLandmark && event.pointerId === state.dragPointerId) {
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
    if (event.pointerId === state.dragPointerId) {
      state.dragLandmark = null; state.dragStart = null; state.dragPointerId = null;
    }
    canvas.releasePointerCapture?.(event.pointerId);
  };
  canvas.onpointercancel = (event) => { state.activePointers.delete(event.pointerId); state.dragLandmark = null; state.dragStart = null; state.dragPointerId = null; };
}

function zoomImage(src, alt) { $("dialog-image").src = src; $("dialog-image").alt = alt; $("image-dialog").showModal(); }
function render() {
  const task = state.data.tasks[state.taskIndex], judgment = latest(task), progress = state.data.progress;
  $("progress").textContent = `${progress.completed} / ${progress.total} Completed`;
  $("task-picker").innerHTML = state.data.tasks.map((item, index) => `<option value="${index}" ${index === state.taskIndex ? "selected" : ""}>Case ${index + 1}: ${taskStatus(item).replace(/^./, (letter) => letter.toUpperCase())}</option>`).join("");
  $("previous-case").hidden = state.taskIndex === 0;
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
  $("skeleton-screen").hidden = false;
  $("annotation-screen").hidden = false;
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
  if (state.selectedLandmark) openLandmarkDialog(state.selectedLandmark);
  const canvas = $("ground-truth-canvas"), geometry = editorGeometry();
  canvas.width = geometry.canvasWidth; canvas.height = geometry.canvasHeight;
  loadSourceImage(task);
  $("frame-note").value = judgment?.notes || "";
  $("frame-note").oninput = () => scheduleSave("started");
  renderSourceEvidence(task, judgment);
}

function payload(status) {
  const task = state.data.tasks[state.taskIndex];
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
    if (status === "completed" && !errorMarkingResponse.marks.length && !errorMarkingResponse.no_errors_found) {
      throw new Error('Add at least one error mark, or check "No errors observed in this clip."');
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
function scheduleSave(status) { clearTimeout(state.timer); state.pendingStatus = status; $("save-state").textContent = "unsaved…"; state.timer = setTimeout(() => save(status), 500); }
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
  // Unlocking re-enables every control indiscriminately; task screens with a
  // control that should stay conditionally disabled (the per-body-part "+"
  // buttons when the current frame is already covered) must re-apply their
  // own disabled state.
  if (!locked) {
    const task = state.data?.tasks?.[state.taskIndex];
    if (task && isErrorMarkingTask(task)) updateTimelineAddButtons();
  }
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
$("temporal-play").onclick = () => playTemporalVideos(false);
$("temporal-pause").onclick = pauseTemporalVideos;
$("temporal-restart").onclick = () => playTemporalVideos(true);
$("temporal-speed-half").onclick = () => setTemporalSpeed(.5);
$("temporal-speed-normal").onclick = () => setTemporalSpeed(1);
$("previous-case").onclick = () => navigateTo(state.taskIndex - 1);
$("logout").onclick = async () => { try { await authenticatedFetch("/api/logout", {method: "POST"}); } finally { pauseTemporalVideos(); localStorage.removeItem("annotation-access-token"); localStorage.removeItem("annotation-annotator"); sessionStorage.removeItem("annotation-access-token"); $("access-token").value = ""; $("annotator").value = ""; $("remember-access-token").checked = false; $("workspace").hidden = true; $("login-panel").hidden = false; $("user-menu").hidden = true; $("save-state").textContent = "logged out"; } };
fetch("/api/access-info").then(responseJson).then((info) => {
  if (!info.access_token_required) $("access-token-field").hidden = true;
}).catch(() => {});
const rememberedToken = localStorage.getItem("annotation-access-token");
const rememberedAnnotator = localStorage.getItem("annotation-annotator");
if (rememberedToken) $("access-token").value = rememberedToken;
if (rememberedToken || rememberedAnnotator) {
  if (rememberedAnnotator) $("annotator").value = rememberedAnnotator;
  $("remember-access-token").checked = true;
}
if (rememberedToken && rememberedAnnotator) loadState();
document.querySelectorAll(".actions button[data-status]").forEach((button) => button.onclick = async () => {
  const task = state.data?.tasks?.[state.taskIndex];
  if (button.dataset.status === "completed" && task && isErrorMarkingTask(task) && !state.errorMarks.length) {
    if (!confirm("No errors were marked for this clip. Complete it as “no errors observed”?")) return;
    state.errorMarkingNoErrorsConfirmed = true;
  }
  lockInteraction(true);
  try {
    if (!(await flushPendingSave())) return;
    const saved = await save(button.dataset.status);
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
});
$("error-marking-step-back-5").onclick = () => stepErrorMarkingVideo(-5);
$("error-marking-step-back-1").onclick = () => stepErrorMarkingVideo(-1);
$("error-marking-step-forward-1").onclick = () => stepErrorMarkingVideo(1);
$("error-marking-step-forward-5").onclick = () => stepErrorMarkingVideo(5);
$("error-marking-scrubber").oninput = () => {
  const video = errorMarkingVideo(), fps = errorMarkingFps();
  video.pause();
  video.currentTime = Number($("error-marking-scrubber").value) / fps;
  updateErrorMarkingFrameIndicator();
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
