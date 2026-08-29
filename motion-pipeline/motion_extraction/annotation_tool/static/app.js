const state = {
  data: null, taskIndex: 0, annotator: "", timer: null, pendingStatus: null,
  savePromise: null, draggedOverlay: null, groundTruth: {}, initialProfile: "",
  initialGroundTruth: {}, initialLandmarkSources: {}, landmarkInteractions: {}, sourceImage: null,
  sourceObjectUrl: null, dragLandmark: null, dragStart: null, dragMoved: false,
  activePointers: new Map(), selectedLandmark: null, screen: "skeleton",
  temporalPlaybackRate: 1,
};
const $ = (id) => document.getElementById(id);

function accessToken() { return sessionStorage.getItem("annotation-access-token") || localStorage.getItem("annotation-access-token") || ""; }
function authenticatedFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (accessToken()) headers.set("X-Annotation-Token", accessToken());
  return fetch(url, {...options, headers});
}

function openLandmarkDialog(landmark) {
  state.selectedLandmark = landmark;
  $("landmark-dialog-title").textContent = landmark.replaceAll("_", " ");
  $("landmark-occlusion-options").innerHTML = occlusionStates().map((item) => `<label><input type="radio" name="landmark-occlusion" value="${item.id}" ${state.groundTruth[landmark].occlusion === item.id ? "checked" : ""}> ${item.label}</label>`).join("");
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
  $("skeleton-screen").hidden = true;
  $("annotation-screen").hidden = true;
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
  $("skeleton-screen").hidden = true;
  $("annotation-screen").hidden = true;
  $("temporal-screen").hidden = true;
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

function renderSourceEvidence(task, judgment) {
  const selectedQuality = judgment?.source_evidence_quality || "";
  const selectedFactors = new Set(judgment?.source_evidence_factors || []);
  const required = Boolean(task.requires_source_evidence_quality || task.requires_evidence_quality);
  const qualities = state.data.source_evidence_quality_definitions || [];
  const factors = state.data.source_evidence_factor_definitions || [];
  $("source-evidence-quality-options").className = "source-evidence-options";
  $("source-evidence-quality-options").innerHTML = [`<label><input class="radio" type="radio" name="source-evidence-quality" value="" ${!selectedQuality ? "checked" : ""}> Not classified yet</label>`, ...qualities.map((item) => `<label title="${item.description || ""}"><input class="radio" type="radio" name="source-evidence-quality" value="${item.id}" ${selectedQuality === item.id ? "checked" : ""}> ${item.label}</label>`)].join("") + (required ? `<p class="source-evidence-help">Required to complete this task.</p>` : "");
  $("source-evidence-factor-options").className = "source-evidence-options";
  $("source-evidence-factor-options").innerHTML = factors.map((item) => `<label><input class="checkbox" type="checkbox" name="source-evidence-factor" value="${item.id}" ${selectedFactors.has(item.id) ? "checked" : ""}> ${item.label}</label>`).join("");
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
  pauseTemporalVideos();
  $("temporal-screen").hidden = true;
  $("triage-screen").hidden = true;
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
function lockInteraction(locked) { $("workspace").querySelectorAll("button, select, input, textarea").forEach((element) => { element.disabled = locked; }); $("ground-truth-canvas").style.pointerEvents = locked ? "none" : "auto"; }
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
$("close-dialog").onclick = () => $("image-dialog").close(); $("image-dialog").onclick = (event) => { if (event.target === $("image-dialog")) $("image-dialog").close(); };
$("access-token").oninput = (event) => { event.target.value = event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6); };
document.querySelectorAll(".export-button").forEach((button) => button.onclick = () => downloadExport(button.dataset.export));
