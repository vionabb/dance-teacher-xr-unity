"""Build labeled test set of MediaPipe skeleton overlays (clean vs synthetically perturbed)."""
import json, os, random, sys, math
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(__file__))
from common import *

OUT = sys.argv[1]
U = os.environ.get("REFERENCE_MOTIONS", os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../data/reference_motions"))  # needs videos/ and pose-raw/pose2d/
REPO = os.environ.get("SMOKETEST_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../data/test-fixtures/smoketest"))
VIDEOS = {
 "ballet": ("selenas-dancevideos/Classical-Ballet-Solo-Charlene-Quek-Woo-Nim-Choreographed-by-Ms-Kok-Huishi", 25.0),
 "house": ("selenas-dancevideos/CALEAF-_-HOUSE-DANCE-SOLO-_-STREETSTAR-2016", 25.0),
 "tango": ("selenas-dancevideos/Bust-Your-Windows--Jazmine-Sullivan--Solo-Ladies-Tango-Routine--Lady-Dance-Choreography", 30.0),
 "dojacat": ("selenas-dancevideos/Doja-cat--You-right--Amy-Park-choreography", 60.0),
 "contemporary": ("selenas-dancevideos/Waves--Contemporary-Ballet-at-Master-Ballet-Academy", 23.976),
 "texas": ("selenas-dancevideos/texas-hold-em", 25.0),
 "waacking": ("selenas-dancevideos/waacking-basic-freestyle", 59.0),
 "attention": (None, 23.976),
}
N_CLEAN = 20; N_WIN = 12
rng = random.Random(20261107)
os.makedirs(f"{OUT}/img", exist_ok=True)
items = []

def paths(name, stem):
    if stem is None:
        return f"{REPO}/motionvideo/attention_zoom_out.mp4", f"{REPO}/pose_raw/attention_zoom_out.pose2d.raw.csv"
    return f"{U}/videos/{stem}.mp4", f"{U}/pose-raw/pose2d/{stem}.pose2d.raw.csv"

def clean_mask(P, V, fps):
    n = len(P); ok = np.zeros(n, bool)
    for f in range(1, n-1):
        if np.isnan(P[f-1:f+2, KEY]).any(): continue
        if (V[f, KEY] < 0.7).any(): continue
        T = torso(P[f])
        if T < 40: continue
        step = np.linalg.norm(P[f+1, KEY]-P[f, KEY], axis=1).max(), np.linalg.norm(P[f, KEY]-P[f-1, KEY], axis=1).max()
        if max(step) > 0.25*T*(30/fps): continue
        ok[f] = True
    return ok

def save(img, rel):
    cv2.imwrite(f"{OUT}/{rel}", img, [cv2.IMWRITE_JPEG_QUALITY, 88]); return rel

def tile_label(img, txt):
    cv2.rectangle(img, (0, 0), (44, 36), (0, 0, 0), -1)
    cv2.putText(img, txt, (8, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2, cv2.LINE_AA); return img

def grid(tiles, cols=3):
    h = max(t.shape[0] for t in tiles); w = max(t.shape[1] for t in tiles)
    rows = math.ceil(len(tiles)/cols); G = np.full((rows*h+(rows-1)*6, cols*w+(cols-1)*6, 3), 40, np.uint8)
    for k, t in enumerate(tiles):
        r, c = divmod(k, cols); G[r*(h+6):r*(h+6)+t.shape[0], c*(w+6):c*(w+6)+t.shape[1]] = t
    return G

stats = {}
for name, (stem, fps) in VIDEOS.items():
    vp, pp = paths(name, stem)
    P, V = load_pose(pp); cap = cv2.VideoCapture(vp)
    W = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)); H = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    ok = clean_mask(P, V, fps); cand = np.where(ok)[0]
    stats[name] = {"frames": len(P), "clean_candidates": int(len(cand))}
    # ---- single frames: spread picks with >=1s gap
    picks = []
    for f in rng.sample(list(cand), len(cand)):
        if all(abs(f-g) >= fps for g in picks): picks.append(int(f))
        if len(picks) == N_CLEAN: break
    types = list(SINGLE_PERTURB)
    for k, f in enumerate(sorted(picks)):
        img = read_frame(cap, f); p = P[f]; T = torso(p); box = crop_box(p, W, H)
        base = f"{name}_f{f:05d}"
        items.append({"id": f"S_{base}_clean", "task": "single", "video": name, "frame": f, "label": 0, "perturbation": "none", "meta": {},
                      "img": save(draw(img, p, box), f"img/{base}_clean.jpg"),
                      "img_raw": save(raw_crop(img, box), f"img/{base}_raw.jpg")})
        # perturbed copy, cycle types; retry other types if not applicable
        order = types[(k + hash(name) % 8) % 8:] + types[:(k + hash(name) % 8) % 8]
        for t in order:
            if t == "wrong_frame":
                others = [int(g) for g in np.where(~np.isnan(P[:, KEY]).any(axis=(1, 2)))[0] if abs(g-f) >= 1.5*fps]
                rng.shuffle(others); res = None
                for g in others[:50]:
                    res = wrong_frame(p, T, rng, other=P[g])
                    if res: res[1]["other_frame"] = int(g); break
            else:
                res = SINGLE_PERTURB[t](p, T, rng)
            if res: break
        q, meta = res
        items.append({"id": f"S_{base}_{t}", "task": "single", "video": name, "frame": f, "label": 1, "perturbation": t, "meta": meta,
                      "img": save(draw(img, q, box), f"img/{base}_{t}.jpg"), "img_raw": f"img/{base}_raw.jpg"})
    # ---- sequences: 6 frames, 0.2 s apart, all clean
    s = max(1, round(fps*0.2)); wins = []
    starts = [int(f) for f in cand if all(ok[f+i*s] if f+i*s < len(ok) else False for i in range(6))]
    stats[name]['seq_starts'] = len(starts)
    rng.shuffle(starts)
    for f0 in starts:
        if all(abs(f0-g) >= 1.2*fps for g in wins) and not any(abs(f0-g) < 6*s for g in picks[:0]): wins.append(f0)
        if len(wins) == N_WIN: break
    seq_types = ["seq_glitch", "seq_lr_flip", "seq_lag", "seq_freeze", "seq_drift"]
    for k, f0 in enumerate(sorted(wins)):
        fr = [f0+i*s for i in range(6)]; poses = [P[f].copy() for f in fr]
        allp = np.concatenate(poses); box = crop_box(allp, W, H, margin=0.15)
        T = np.mean([torso(p) for p in poses]); imgs = [read_frame(cap, f) for f in fr]
        variants = [("none", 0, poses, {}, [])]
        t = seq_types[(k + len(items)) % 5]
        if t:
            q = [p.copy() for p in poses]; meta = {}; bad = []
            if t == "seq_glitch":
                j = rng.randint(1, 4); fn = rng.choice(["arm_swap", "leg_swap", "limb_rotate", "joint_displace"])
                r = SINGLE_PERTURB[fn](poses[j], T, rng) or limb_rotate(poses[j], T, rng) or joint_displace(poses[j], T, rng, mag=0.6)
                q[j] = r[0]; meta = {"kind": fn, **r[1]}; bad = [j+1]
            elif t == "seq_lr_flip":
                j = rng.randint(1, 3); q[j] = poses[j][MIRROR]; q[j+1] = poses[j+1][MIRROR]; bad = [j+1, j+2]
            elif t == "seq_lag":
                lag = round(fps*0.4); q = [P[f-lag].copy() if f-lag >= 0 and not np.isnan(P[f-lag, KEY]).any() else P[f].copy() for f in fr]
                d = np.mean([np.nanmean(np.linalg.norm(a[KEY]-b[KEY], axis=1)) for a, b in zip(q, poses)])/T
                meta = {"lag_s": 0.4, "mean_disp_T": round(float(d), 2)}; bad = list(range(1, 7))
            elif t == "seq_freeze":
                for j in range(3, 6): q[j] = poses[2].copy()
                d = np.nanmean(np.linalg.norm(poses[5][KEY]-poses[2][KEY], axis=1))/T
                meta = {"freeze_from": 3, "disp_last_T": round(float(d), 2)}; bad = [4, 5, 6]
            elif t == "seq_drift":
                th = rng.uniform(0, 2*math.pi); u = np.array([math.cos(th), math.sin(th)])
                for j in range(6): q[j] = poses[j]+u*(0.6*T*j/5)
                meta = {"final_shift_T": 0.6}; bad = [3, 4, 5, 6]
            variants.append((t, 1, q, meta, bad))
        for t_, lab, qs, meta, bad in variants:
            tiles = [tile_label(draw(im, qq, box, out_long=400), str(i+1)) for i, (im, qq) in enumerate(zip(imgs, qs))]
            rel = save(grid(tiles), f"img/seq_{name}_f{f0:05d}_{t_}.jpg")
            items.append({"id": f"Q_{name}_f{f0:05d}_{t_}", "task": "sequence", "video": name, "frame": f0, "frames": fr, "label": lab,
                          "perturbation": t_, "meta": meta, "bad_tiles": bad, "img": rel})
    cap.release()
    print(name, stats[name], "picks", len(picks), "wins", len(wins), flush=True)

json.dump({"items": items, "stats": stats, "seed": 20261107}, open(f"{OUT}/manifest.json", "w"), indent=1)
from collections import Counter
print(Counter((i["task"], i["perturbation"]) for i in items))
