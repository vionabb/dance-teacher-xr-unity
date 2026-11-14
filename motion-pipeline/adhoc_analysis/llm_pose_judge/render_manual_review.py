"""Render judge items from Viona's manual-review corpus and the CHI25 metric clips.

Runs where the access-controlled data lives (workstation). Writes rendered JPEGs and
manifests to <out>; nothing is written into the corpus.

  frames/   single frames from the 48 completed detailed reviews: frames with landmark
            corrections (error magnitude = largest corrected displacement / torso length),
            frames marked unusable or flawed, and frames Viona did not mark (weak negatives)
  clips/    3x3 grids of 9 evenly spaced frames for (a) the 154 whole-segment usability
            ratings and (b) every CHI25 clip that has a human similarity rating

usage: render_manual_review.py <code-repo-root> <out>
"""
import csv, glob, json, math, os, random, sys
from collections import defaultdict
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load_pose, torso, read_frame, crop_box, draw, raw_crop, KEY

ROOT, OUT = sys.argv[1], sys.argv[2]
MR = f"{ROOT}/motion-pipeline/local-data/manual-review"
REL = f"{MR}/releases/20261002-first-manual-review/manifest.json"
MAC_PREFIX = "/Users/viona/dev/phd-research-final-push/code-ai-motion-coach"
rng = random.Random(20261107)
for d in ("frames", "clips"): os.makedirs(f"{OUT}/{d}", exist_ok=True)
man = json.load(open(REL))
vid_of = {a["raw_pose_sha256"]: a.get("source_video_original_path") for a in man["archived_raw_poses"]}

def local(p):
    return p.replace(MAC_PREFIX, ROOT) if p else None

def save(img, rel):
    cv2.imwrite(f"{OUT}/{rel}", img, [cv2.IMWRITE_JPEG_QUALITY, 88]); return rel

def tile_label(img, txt):
    cv2.rectangle(img, (0, 0), (40, 32), (0, 0, 0), -1)
    cv2.putText(img, txt, (8, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA); return img

def grid(tiles, cols=3):
    h = max(t.shape[0] for t in tiles); w = max(t.shape[1] for t in tiles)
    rows = math.ceil(len(tiles)/cols); G = np.full((rows*h+(rows-1)*6, cols*w+(cols-1)*6, 3), 40, np.uint8)
    for k, t in enumerate(tiles):
        r, c = divmod(k, cols); G[r*(h+6):r*(h+6)+t.shape[0], c*(w+6):c*(w+6)+t.shape[1]] = t
    return G

def render_clip(vp, pp, f0, f1, rel, n=9):
    P, V = load_pose(pp); cap = cv2.VideoCapture(vp)
    W = int(cap.get(3)); H = int(cap.get(4)); nvid = int(cap.get(7))
    f1 = min(f1, len(P), nvid or f1)
    fr = [int(round(x)) for x in np.linspace(f0, f1-1, n)]
    valid = [f for f in fr if not np.isnan(P[f, KEY]).all()]
    if len(valid) < 3: return None
    meta = {"frames": fr, "missing_pose_frames": [f for f in fr if f not in valid]}
    if os.path.exists(f"{OUT}/{rel}"): cap.release(); return meta  # resume
    box = crop_box(np.concatenate([P[f] for f in valid]), W, H, margin=0.15)
    tiles = []
    for i, f in enumerate(fr):
        img = read_frame(cap, f)
        if img is None: return None
        tiles.append(tile_label(draw(img, P[f], box, out_long=300), str(i+1)))
    cap.release()
    save(grid(tiles), rel)
    return meta

# ---------------- frame-level items from detailed reviews ----------------
frame_items = []
for seg in ([] if os.environ.get("SKIP_FRAMES") else man["reviewed_segments"]):
    vp = local(vid_of.get(seg["raw_pose_sha256"])); pp = f"{MR}/{seg['raw_pose_path']}"
    if not vp or not os.path.exists(vp): print("no video", seg["task_id"]); continue
    P, V = load_pose(pp); cap = cv2.VideoCapture(vp); W = int(cap.get(3)); H = int(cap.get(4))
    s0, s1 = seg["source_frame_start"], seg["source_frame_end_exclusive"]
    segT = np.nanmedian([torso(P[f]) for f in range(s0, min(s1, len(P))) if not np.isnan(P[f, KEY]).any()] or [np.nan])
    labels = {s0+int(k): v for k, v in seg["manual_frame_labels"].items()}
    corr = defaultdict(list)
    for c in seg["corrections"]:
        sf = c.get("source_frame") if c.get("source_frame") is not None else s0+c["task_frame"]
        d = math.hypot(float(c["corrected_x"])-float(c["original_x"]), float(c["corrected_y"])-float(c["original_y"]))
        corr[sf].append((c["landmark"], d))
    marked = set(labels) | set(corr)
    cands = []
    for f in range(s0, min(s1, len(P))):
        if np.isnan(P[f, KEY]).all(): continue
        T = torso(P[f]); T = T if T > 10 else segT
        if f in corr:
            lm, d = max(corr[f], key=lambda x: x[1])
            cands.append((f, 1, "corrected", d/T, lm, labels.get(f)))
        elif labels.get(f) == "unusable": cands.append((f, 1, "unusable", None, None, "unusable"))
        elif labels.get(f) == "flawed": cands.append((f, 1, "flawed_uncorrected", None, None, "flawed"))
        elif labels.get(f) == "good": cands.append((f, 0, "good", None, None, "good"))
        elif all(abs(f-g) >= 8 for g in marked): cands.append((f, 0, "unmarked", None, None, None))
    seg_items = []
    pos = [c for c in cands if c[1] == 1]; neg = [c for c in cands if c[1] == 0]
    # keep frames >= 3 apart within a category to limit near-duplicates
    def thin(cs, gap=3):
        out = []
        for c in sorted(cs):
            if not out or c[0]-out[-1][0] >= gap: out.append(c)
        return out
    pos = thin(pos); good = [c for c in neg if c[2] == "good"]; un = thin([c for c in neg if c[2] == "unmarked"], 10)
    rng.shuffle(un)
    chosen = pos + good + un[:max(3, len(pos))]
    for f, lab, kind, mag, lm, mlabel in chosen:
        img = read_frame(cap, f)
        if img is None: continue
        box = crop_box(P[f], W, H)
        base = f"{seg['task_id']}_f{f:05d}"
        frame_items.append({"id": f"MR_{base}", "task": "single", "label": lab, "perturbation": f"manual_{kind}",
            "magnitude_T": None if mag is None else round(float(mag), 3), "landmark": lm, "manual_label": mlabel,
            "segment_task": seg["task_id"], "source_corpus": seg["source_corpus"], "frame": int(f),
            "video_override": seg.get("video_usability_rating_override"),
            "img": save(draw(img, P[f], box), f"frames/{base}.jpg"), "img_raw": save(raw_crop(img, box), f"frames/{base}_raw.jpg")})
    cap.release()
    print("seg", seg["task_id"], seg["source_corpus"], "pos", len(pos), "neg_unmarked", len(un), flush=True)
if frame_items: json.dump({"items": frame_items}, open(f"{OUT}/manifest_frames.json", "w"), indent=1)

# ---------------- clip grids: usability-rated segments ----------------
clip_items = []
for vr in man["video_reviews"]:
    vp = local(vid_of.get(vr["raw_pose_sha256"])); pp = f"{MR}/{vr['raw_pose_path']}"
    if vr["pose_alignment_validation"] != "validated_coordinates" or not vp or not os.path.exists(vp): continue
    rel = f"clips/usab_{vr['task_id']}.jpg"
    r = render_clip(vp, pp, vr["source_frame_start"], vr["source_frame_end_exclusive"], rel)
    if r: clip_items.append({"id": f"U_{vr['task_id']}", "task": "clip", "set": "usability", "rating": vr["video_usability_rating"],
        "label": int(vr["video_usability_rating"] in ("correctable", "unusable")), "perturbation": "usability_" + vr["video_usability_rating"],
        "source_corpus": vr["source_corpus"], "segment_id": vr["segment_id"], "img": rel, **r})
print("usability clips", len(clip_items), flush=True)

# ---------------- clip grids: CHI25 clips with human similarity ratings ----------------
PM = f"{ROOT}/data/participant_motions"
rows = list(csv.DictReader(open(f"{ROOT}/svelte-web-frontend/artifacts/motion_metrics.csv")))
n = 0
for r in rows:
    if r["clipNumber"] in ("-1", "") or r.get("humanRating") in ("", None): continue
    st = r["studyName"]; d = f"{PM}/chi25_{st}"
    vids = glob.glob(f"{d}/videos/user{r['userId']}____*workflowid-{r['workflowId']}____clip{r['clipNumber']}.mp4")
    if len(vids) != 1: continue
    stem = os.path.basename(vids[0])[:-4]
    pp = f"{d}/pose-raw/canonical/{st}-segmented/pose2d/{stem}.pose2d.raw.csv"
    if not os.path.exists(pp): continue
    rel = f"clips/rated_{st}_{r['userId']}_{r['workflowId'][:8]}_c{r['clipNumber']}.jpg"
    res = render_clip(vids[0], pp, 0, 10**9, rel)
    if res:
        clip_items.append({"id": f"R_{st}_{r['userId']}_{r['workflowId']}_c{r['clipNumber']}", "task": "clip", "set": "rated", "label": None,
            "perturbation": "rated", "study": st, "userId": r["userId"], "workflowId": r["workflowId"], "clipNumber": r["clipNumber"],
            "stem": stem, "img": rel, **res}); n += 1
print("rated clips", n, flush=True)
json.dump({"items": clip_items}, open(f"{OUT}/manifest_clips.json", "w"), indent=1)
