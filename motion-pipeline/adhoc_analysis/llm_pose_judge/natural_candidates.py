"""Find frames where raw MediaPipe output is likely wrong (temporal spikes, left/right flips, low visibility)
and render them for manual labelling. Output: <out>/natural/manifest_candidates.json + images."""
import json, os, sys, random
import numpy as np, cv2
sys.path.insert(0, os.path.dirname(__file__))
from common import *
OUT = sys.argv[1]
U = os.environ.get("REFERENCE_MOTIONS", os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../data/reference_motions"))  # needs videos/ and pose-raw/pose2d/
REPO = os.environ.get("SMOKETEST_DIR", os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../../data/test-fixtures/smoketest"))
VIDEOS = {
 "ballet": "selenas-dancevideos/Classical-Ballet-Solo-Charlene-Quek-Woo-Nim-Choreographed-by-Ms-Kok-Huishi",
 "house": "selenas-dancevideos/CALEAF-_-HOUSE-DANCE-SOLO-_-STREETSTAR-2016",
 "tango": "selenas-dancevideos/Bust-Your-Windows--Jazmine-Sullivan--Solo-Ladies-Tango-Routine--Lady-Dance-Choreography",
 "dojacat": "selenas-dancevideos/Doja-cat--You-right--Amy-Park-choreography",
 "contemporary": "selenas-dancevideos/Waves--Contemporary-Ballet-at-Master-Ballet-Academy",
 "texas": "selenas-dancevideos/texas-hold-em",
 "waacking": "selenas-dancevideos/waacking-basic-freestyle",
 "attention": None}
rng = random.Random(7)
os.makedirs(f"{OUT}/natural", exist_ok=True)
cands = []
for name, stem in VIDEOS.items():
    vp, pp = ((f"{REPO}/motionvideo/attention_zoom_out.mp4", f"{REPO}/pose_raw/attention_zoom_out.pose2d.raw.csv") if stem is None
              else (f"{U}/videos/{stem}.mp4", f"{U}/pose-raw/pose2d/{stem}.pose2d.raw.csv"))
    P, V = load_pose(pp); n = len(P)
    valid = ~np.isnan(P[:, KEY]).any(axis=(1, 2))
    spikes, flips, lowvis = [], [], []
    for f in range(2, n-2):
        if not valid[f-2:f+3].all(): continue
        T = np.median([torso(P[g]) for g in range(f-2, f+3)])
        if T < 40: continue
        # spike: joint far from both neighbours while neighbours agree
        d_prev = np.linalg.norm(P[f, KEY]-P[f-1, KEY], axis=1); d_next = np.linalg.norm(P[f, KEY]-P[f+1, KEY], axis=1)
        d_nb = np.linalg.norm(P[f+1, KEY]-P[f-1, KEY], axis=1)
        if ((d_prev > 0.5*T) & (d_next > 0.5*T) & (d_nb < 0.25*T)).any(): spikes.append(f)
        # L/R flip of limbs: swapping left/right limb joints fits neighbours better than current labelling
        lim = [13, 14, 15, 16, 25, 26, 27, 28]
        cur = np.linalg.norm(P[f, lim]-P[f-1, lim], axis=1).sum()
        sw = np.linalg.norm(P[f, [MIRROR[i] for i in lim]]-P[f-1, lim], axis=1).sum()
        if sw < 0.5*cur and cur > 1.0*T: flips.append(f)
        if V[f, KEY].mean() < 0.55: lowvis.append(f)
    def thin(fs, k):
        fs = sorted(fs); out = []
        for f in fs:
            if not out or f-out[-1] > 10: out.append(f)
        rng.shuffle(out); return sorted(out[:k])
    sel = [(f, "spike") for f in thin(spikes, 4)] + [(f, "lr_flip") for f in thin(flips, 4)] + [(f, "lowvis") for f in thin(lowvis, 3)]
    cap = cv2.VideoCapture(vp); W = int(cap.get(3)); H = int(cap.get(4))
    for f, why in sel:
        img = read_frame(cap, f); p = P[f]
        # crop from neighbour-median pose so a wrong pose does not define the crop alone
        ref = np.nanmedian(P[max(0, f-3):f+4], axis=0); box = crop_box(np.concatenate([ref, p]), W, H)
        base = f"N_{name}_f{f:05d}"
        cv2.imwrite(f"{OUT}/natural/{base}.jpg", draw(img, p, box), [cv2.IMWRITE_JPEG_QUALITY, 88])
        cv2.imwrite(f"{OUT}/natural/{base}_raw.jpg", raw_crop(img, box), [cv2.IMWRITE_JPEG_QUALITY, 88])
        # sequence context: 6 frames f-6..f+4 step 2 around candidate for the labeller
        cands.append({"id": base, "video": name, "frame": int(f), "trigger": why, "img": f"natural/{base}.jpg", "img_raw": f"natural/{base}_raw.jpg"})
    print(name, len(spikes), len(flips), len(lowvis), flush=True)
json.dump(cands, open(f"{OUT}/natural/candidates.json", "w"), indent=1)
print(len(cands))
