"use strict";

// Blinded repair-case review. The server sends only blind IDs, frame, fps,
// landmark, and the tracked point; selection arm, proposal, and rule values
// never reach this page. Every save appends a new server-side revision.

const $ = (id) => document.getElementById(id);
const state = {
  annotator: "",
  token: "",
  cases: [],
  latest: {},
  index: 0,
  frame: 0,
  corrected: null,
  viewed: new Set(),
  dragging: false,
};

function headers(extra = {}) {
  return state.token ? { ...extra, "X-Annotation-Token": state.token } : extra;
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: headers(options.headers || {}), credentials: "same-origin" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `request failed (${response.status})`);
  return body;
}

function currentCase() {
  return state.cases[state.index];
}

function verdictValue() {
  const checked = document.querySelector('input[name="verdict"]:checked');
  return checked ? checked.value : null;
}

function judgedCount() {
  return state.cases.filter((c) => state.latest[c.blind_id]).length;
}

function renderProgress() {
  const badge = $("progress");
  badge.hidden = false;
  badge.textContent = `${judgedCount()} / ${state.cases.length} judged`;
  const list = $("case-list");
  list.replaceChildren(
    ...state.cases.map((c, i) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "link link-hover";
      const done = state.latest[c.blind_id];
      button.textContent = `${c.blind_id}${done ? " ✓" : ""}`;
      button.setAttribute("aria-current", String(i === state.index));
      button.addEventListener("click", () => openCase(i));
      item.append(button);
      return item;
    }),
  );
}

function openCase(index) {
  state.index = Math.max(0, Math.min(state.cases.length - 1, index));
  const c = currentCase();
  const previous = state.latest[c.blind_id];
  state.corrected = previous && previous.corrected_point ? [...previous.corrected_point] : null;
  state.viewed = new Set();
  $("case-id").textContent = c.blind_id;
  $("case-landmark").textContent = c.landmark.replace("_", " ").toLowerCase();
  document.querySelectorAll('input[name="verdict"]').forEach((input) => {
    input.checked = previous ? input.value === previous.verdict : false;
  });
  $("note").value = previous ? previous.note : "";
  $("save-status").textContent = previous ? `Saved ${new Date(previous.server_saved_at).toLocaleString()}` : "";
  updateCorrectionHint();
  const video = $("video");
  video.src = `/media/${encodeURIComponent(c.blind_id)}`;
  video.addEventListener(
    "loadedmetadata",
    () => {
      $("scrubber").max = String(Math.max(0, Math.floor(video.duration * c.fps) - 1));
      // Size the stage to the clip so portrait phone recordings stay large.
      const stage = $("stage");
      stage.style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
      stage.style.width = `min(100%, calc(75vh * ${video.videoWidth / video.videoHeight}))`;
      seek(c.frame_index);
    },
    { once: true },
  );
  renderProgress();
}

function seek(frame) {
  const c = currentCase();
  const video = $("video");
  const max = Number($("scrubber").max) || frame;
  state.frame = Math.max(0, Math.min(max, frame));
  state.viewed.add(state.frame);
  video.currentTime = (state.frame + 0.5) / c.fps;
  $("scrubber").value = String(state.frame);
  const offset = state.frame - c.frame_index;
  $("frame-label").textContent = offset === 0 ? `Case frame ${state.frame}` : `Frame ${state.frame} (${offset > 0 ? "+" : ""}${offset})`;
  $("frame-label").className = offset === 0 ? "badge badge-primary" : "badge";
}

function videoRect() {
  const video = $("video");
  const canvas = $("overlay");
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const vw = video.videoWidth || 16;
  const vh = video.videoHeight || 9;
  const scale = Math.min(width / vw, height / vh);
  return { x: (width - vw * scale) / 2, y: (height - vh * scale) / 2, w: vw * scale, h: vh * scale };
}

function toCanvas(point) {
  const r = videoRect();
  return [r.x + point[0] * r.w, r.y + point[1] * r.h];
}

function fromCanvas(x, y) {
  const r = videoRect();
  const clamp = (v) => Math.max(-0.5, Math.min(1.5, v));
  return [clamp((x - r.x) / r.w), clamp((y - r.y) / r.h)];
}

function drawDot(ctx, point, radius, fill, stroke) {
  const [x, y] = toCanvas(point);
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function draw() {
  const canvas = $("overlay");
  const ratio = window.devicePixelRatio || 1;
  if (canvas.width !== canvas.clientWidth * ratio || canvas.height !== canvas.clientHeight * ratio) {
    canvas.width = canvas.clientWidth * ratio;
    canvas.height = canvas.clientHeight * ratio;
  }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
  const c = currentCase();
  // Tracked positions are known only for the case frame, so draw them there.
  if (c && state.frame === c.frame_index) {
    Object.values(c.context_points || {}).forEach((p) => drawDot(ctx, p, 4, "rgba(200,200,200,.7)", "rgba(0,0,0,.6)"));
    drawDot(ctx, c.point, 7, state.corrected ? "rgba(250,204,21,.35)" : "rgba(250,204,21,.95)", "#000");
    if (state.corrected) drawDot(ctx, state.corrected, 7, "rgba(56,189,248,.95)", "#000");
  }
  canvas.classList.toggle("draggable", canDrag());
  requestAnimationFrame(draw);
}

function canDrag() {
  const c = currentCase();
  return c && verdictValue() === "incorrect_correctable" && state.frame === c.frame_index;
}

function updateCorrectionHint() {
  const correctable = verdictValue() === "incorrect_correctable";
  $("correction-hint").hidden = !correctable;
  if (!correctable) state.corrected = null;
}

function pointerPosition(event) {
  const rect = $("overlay").getBoundingClientRect();
  return [event.clientX - rect.left, event.clientY - rect.top];
}

function setupCanvas() {
  const canvas = $("overlay");
  canvas.addEventListener("pointerdown", (event) => {
    if (!canDrag()) return;
    const [x, y] = pointerPosition(event);
    const [px, py] = toCanvas(state.corrected || currentCase().point);
    if (Math.hypot(px - x, py - y) > 28) return;
    state.dragging = true;
    canvas.setPointerCapture(event.pointerId);
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!state.dragging) return;
    const [x, y] = pointerPosition(event);
    state.corrected = fromCanvas(x, y);
  });
  const stop = () => { state.dragging = false; };
  canvas.addEventListener("pointerup", stop);
  canvas.addEventListener("pointercancel", stop);
}

async function save(event) {
  event.preventDefault();
  const verdict = verdictValue();
  if (!verdict) {
    $("save-status").textContent = "Choose a judgment first.";
    return;
  }
  const c = currentCase();
  const payload = {
    blind_id: c.blind_id,
    annotator: state.annotator,
    verdict,
    corrected_point: verdict === "incorrect_correctable" ? state.corrected : null,
    note: $("note").value,
    viewed_frames: [...state.viewed],
    client_saved_at: new Date().toISOString(),
  };
  $("save").disabled = true;
  try {
    const result = await api("/api/judgments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    state.latest[c.blind_id] = { ...payload, server_saved_at: result.server_saved_at, revision_id: result.revision_id };
    const next = state.cases.findIndex((other, i) => i > state.index && !state.latest[other.blind_id]);
    if (next >= 0) openCase(next);
    else {
      renderProgress();
      $("save-status").textContent = judgedCount() === state.cases.length ? "All cases judged. You can still revise any case." : "Saved.";
    }
  } catch (error) {
    $("save-status").textContent = `Not saved: ${error.message}`;
  } finally {
    $("save").disabled = false;
  }
}

async function download(path, filename) {
  const response = await fetch(path, { headers: headers(), credentials: "same-origin" });
  if (!response.ok) return;
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

async function login(event) {
  event.preventDefault();
  state.annotator = $("annotator").value.trim();
  state.token = $("access-token").value.trim().toUpperCase();
  try {
    const result = await api(`/api/state?annotator=${encodeURIComponent(state.annotator)}`);
    state.cases = result.cases;
    state.latest = result.latest;
    $("login-panel").hidden = true;
    $("review-screen").hidden = false;
    $("logout").hidden = false;
    const firstOpen = state.cases.findIndex((c) => !state.latest[c.blind_id]);
    openCase(firstOpen >= 0 ? firstOpen : 0);
    requestAnimationFrame(draw);
  } catch (error) {
    $("login-error").textContent = error.message;
  }
}

async function init() {
  const info = await api("/api/access-info").catch(() => ({ access_token_required: false }));
  $("access-token-field").hidden = !info.access_token_required;
  $("login-form").addEventListener("submit", login);
  $("judgment-form").addEventListener("submit", save);
  document.querySelectorAll('input[name="verdict"]').forEach((input) => input.addEventListener("change", updateCorrectionHint));
  document.querySelectorAll("[data-step]").forEach((button) =>
    button.addEventListener("click", () => seek(state.frame + Number(button.dataset.step))),
  );
  $("go-target").addEventListener("click", () => seek(currentCase().frame_index));
  $("scrubber").addEventListener("input", (event) => seek(Number(event.target.value)));
  $("prev-case").addEventListener("click", () => openCase(state.index - 1));
  $("reset-point").addEventListener("click", () => { state.corrected = null; });
  $("export-jsonl").addEventListener("click", () => download("/api/export.jsonl", "repair-adjudication-revisions.jsonl"));
  $("export-csv").addEventListener("click", () => download("/api/export.csv", "repair-adjudication-revisions.csv"));
  $("logout").addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    window.location.reload();
  });
  document.addEventListener("keydown", (event) => {
    if (["TEXTAREA", "INPUT"].includes(document.activeElement.tagName) && document.activeElement.type !== "radio") return;
    if ($("review-screen").hidden) return;
    if (event.key === "ArrowLeft") seek(state.frame - 1);
    if (event.key === "ArrowRight") seek(state.frame + 1);
  });
  setupCanvas();
}

init();
