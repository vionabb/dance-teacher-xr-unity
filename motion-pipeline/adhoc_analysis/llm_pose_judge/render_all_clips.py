"""Render a 3x3 grid (9 evenly spaced frames, skeleton overlay) for every CHI25 segment clip
that has a raw pose2d CSV, for a dataset-wide LLM screen. Same rendering as the rated-clip
grids in render_manual_review.py. Resumable; writes nothing into the corpus.

usage: render_all_clips.py <code-repo-root> <out>
"""
import glob, json, math, os, re, sys, time
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import load_pose, read_frame, crop_box, draw, KEY

ROOT, OUT = sys.argv[1], sys.argv[2]
os.makedirs(f"{OUT}/clips", exist_ok=True)
DEADLINE = time.time() + float(os.environ.get("BUDGET_S", "1e9"))

def tile_label(img, txt):
    cv2.rectangle(img, (0, 0), (40, 32), (0, 0, 0), -1)
    cv2.putText(img, txt, (8, 25), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA); return img

def grid(tiles, cols=3):
    h = max(t.shape[0] for t in tiles); w = max(t.shape[1] for t in tiles)
    rows = math.ceil(len(tiles)/cols); G = np.full((rows*h+(rows-1)*6, cols*w+(cols-1)*6, 3), 40, np.uint8)
    for k, t in enumerate(tiles):
        r, c = divmod(k, cols); G[r*(h+6):r*(h+6)+t.shape[0], c*(w+6):c*(w+6)+t.shape[1]] = t
    return G

items, status = [], {}
done_path = f"{OUT}/status.json"
if os.path.exists(done_path): status = json.load(open(done_path))
for st in ("study1", "study2"):
    d = f"{ROOT}/data/participant_motions/chi25_{st}"
    for vp in sorted(glob.glob(f"{d}/videos/*____clip*.mp4")):
        stem = os.path.basename(vp)[:-4]
        m = re.match(r"user([^_]+)____.*workflowid-([0-9a-f-]+)____clip(\d+)$", stem)
        if not m: status[stem] = "unparsed"; continue
        uid, wf, cn = m.groups()
        rel = f"clips/{st}_{uid}_{wf[:8]}_c{cn}.jpg"
        it = {"id": f"A_{st}_{uid}_{wf}_c{cn}", "task": "clip", "set": "all", "label": None, "perturbation": "all",
              "study": st, "userId": uid, "workflowId": wf, "clipNumber": cn, "stem": stem, "img": rel}
        if status.get(stem) == "ok" and os.path.exists(f"{OUT}/{rel}"): items.append(it); continue
        if stem in status and status[stem] != "ok": continue
        if time.time() > DEADLINE: continue
        pp = f"{d}/pose-raw/canonical/{st}-segmented/pose2d/{stem}.pose2d.raw.csv"
        if not os.path.exists(pp): status[stem] = "no_pose"; continue
        try:
            P, V = load_pose(pp); cap = cv2.VideoCapture(vp)
            W = int(cap.get(3)); H = int(cap.get(4)); nvid = int(cap.get(7))
            f1 = min(len(P), nvid or len(P))
            fr = [int(round(x)) for x in np.linspace(0, f1-1, 9)]
            valid = [f for f in fr if not np.isnan(P[f, KEY]).all()]
            if len(valid) < 3: status[stem] = "too_few_pose_frames"; cap.release(); continue
            box = crop_box(np.concatenate([P[f] for f in valid]), W, H, margin=0.15)
            tiles = []
            for i, f in enumerate(fr):
                img = read_frame(cap, f)
                if img is None: raise RuntimeError("frame read failed")
                tiles.append(tile_label(draw(img, P[f], box, out_long=300), str(i+1)))
            cap.release()
            cv2.imwrite(f"{OUT}/{rel}", grid(tiles), [cv2.IMWRITE_JPEG_QUALITY, 88])
            status[stem] = "ok"; it["frames"] = fr; it["missing_pose_frames"] = [f for f in fr if f not in valid]; items.append(it)
        except Exception as e:
            status[stem] = f"error: {e}"
json.dump(status, open(done_path, "w"))
json.dump({"items": items}, open(f"{OUT}/manifest.json", "w"), indent=1)
from collections import Counter
print(len(items), Counter(v if not v.startswith("error") else "error" for v in status.values()), flush=True)
