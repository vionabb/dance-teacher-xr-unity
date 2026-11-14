"""Analyse judge runs on Viona's manual-review frames and the CHI25 clip grids.

usage: analyze_manual.py <frames-manifest> <clips-manifest> <results-dir> <motion_metrics.csv> <summary.json>

Results files: <model>_frames.jsonl, <model>_frames_raw.jsonl, <model>_clips.jsonl (any present).
Positive class = skeleton incorrect. Frame negatives are weak: unmarked frames (>= 8 frames from
any marked frame) plus the 4 frames marked good; the review protocol did not certify unmarked
landmarks as error-free. Leg errors are out of scope (the prompt asks about the upper body only).
"""
import csv, glob, json, math, os, sys
from collections import Counter, defaultdict
import numpy as np
from scipy.stats import spearmanr, pearsonr
from sklearn.metrics import roc_auc_score

FM, CM, RES, MM, OUT = sys.argv[1:6]
rng = np.random.default_rng(20261107)

def wilson(k, n, z=1.96):
    if n == 0: return [None, None]
    p = k/n; d = 1+z*z/n; c = (p+z*z/(2*n))/d; h = z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d
    return [round(c-h, 3), round(c+h, 3)]

def load(path):
    out = {}
    for l in open(path):
        r = json.loads(l); p = r.get("parsed") or {}
        if "verdict" not in p: continue
        out[r["id"]] = {"flag": int(p["verdict"] == "incorrect"), "p": float(p.get("p_incorrect", 0.5)),
                        "severity": p.get("severity"), "cost": r.get("cost_usd") or 0}
    return out

def rate(xs):
    k = int(sum(xs)); n = len(xs)
    return {"k": k, "n": n, "rate": round(k/n, 3) if n else None, "ci": wilson(k, n)}

def binary(items, res):
    y = [i["label"] for i in items if i["id"] in res]; f = [res[i["id"]]["flag"] for i in items if i["id"] in res]
    p = [res[i["id"]]["p"] for i in items if i["id"] in res]
    y, f, p = map(np.array, (y, f, p))
    tp = int(((y == 1) & (f == 1)).sum()); fp = int(((y == 0) & (f == 1)).sum())
    fn = int(((y == 1) & (f == 0)).sum()); tn = int(((y == 0) & (f == 0)).sum())
    return {"n": len(y), "tp": tp, "fp": fp, "fn": fn, "tn": tn,
            "recall": rate([1]*tp+[0]*fn), "specificity": rate([1]*tn+[0]*fp),
            "precision": round(tp/(tp+fp), 3) if tp+fp else None,
            "auc": round(float(roc_auc_score(y, p)), 3) if len(set(y)) == 2 else None}

summary = {"frames": {}, "usability": {}, "correlation": {}}
BINS = [(0, .25, "<0.25T"), (.25, .5, "0.25-0.5T"), (.5, 1, "0.5-1T"), (1, 99, ">=1T")]

# ---------------- frames ----------------
fitems = json.load(open(FM))["items"]
for path in sorted(glob.glob(f"{RES}/*_frames*.jsonl")):
    name = os.path.basename(path)[:-6]; res = load(path)
    if not res: continue
    s = {"overall": binary(fitems, res), "cost_usd": round(sum(r["cost"] for r in res.values()), 2)}
    pos = [i for i in fitems if i["label"] == 1 and i["id"] in res]
    neg = [i for i in fitems if i["label"] == 0 and i["id"] in res]
    by = {}
    for lo, hi, lab in BINS:
        sel = [i for i in pos if i["magnitude_T"] is not None and lo <= i["magnitude_T"] < hi]
        by[lab] = rate([res[i["id"]]["flag"] for i in sel])
        if sel and neg:
            yy = [1]*len(sel)+[0]*len(neg); pp = [res[i["id"]]["p"] for i in sel+neg]
            by[lab]["auc_vs_neg"] = round(float(roc_auc_score(yy, pp)), 3)
    by["unusable_frame"] = rate([res[i["id"]]["flag"] for i in pos if i["perturbation"] == "manual_unusable"])
    s["recall_by_magnitude"] = by
    s["flag_rate_negatives"] = {k: rate([res[i["id"]]["flag"] for i in neg if i["perturbation"] == k])
                                for k in ("manual_unmarked", "manual_good")}
    s["recall_by_landmark"] = {lm: rate([res[i["id"]]["flag"] for i in pos if (i.get("landmark") or "").lower().endswith(lm)])
                               for lm in ("wrist", "elbow", "shoulder", "hip")}
    s["by_corpus"] = {c: binary([i for i in fitems if i["source_corpus"] == c], res)
                      for c in sorted({i["source_corpus"] for i in fitems})}
    # threshold sweep on p_incorrect
    sweep = {}
    for t in (0.2, 0.3, 0.4, 0.5):
        fl = lambda i: int(res[i["id"]]["p"] >= t)
        sweep[str(t)] = {"recall": round(np.mean([fl(i) for i in pos]), 3), "spec": round(1-np.mean([fl(i) for i in neg]), 3),
                         "recall_>=0.5T": round(np.mean([fl(i) for i in pos if (i["magnitude_T"] or 0) >= .5]), 3)}
    s["threshold_sweep"] = sweep
    summary["frames"][name] = s

# ---------------- clips: usability ----------------
citems = json.load(open(CM))["items"]
uitems = [i for i in citems if i["set"] == "usability"]
clipres = {os.path.basename(p)[:-6]: load(p) for p in sorted(glob.glob(f"{RES}/*_clips*.jsonl"))}
for name, res in clipres.items():
    if not res: continue
    s = {"by_rating": {r: rate([res[i["id"]]["flag"] for i in uitems if i["rating"] == r and i["id"] in res])
                       for r in ("perfect", "marginal", "correctable", "unusable")}}
    s["major_by_rating"] = {r: rate([int(res[i["id"]]["severity"] == "major") for i in uitems if i["rating"] == r and i["id"] in res])
                            for r in ("perfect", "marginal", "correctable", "unusable")}
    s["correctable_or_unusable_vs_rest"] = binary(uitems, res)
    sel = [i for i in uitems if i["rating"] in ("perfect", "unusable") and i["id"] in res]
    if sel: s["auc_unusable_vs_perfect"] = round(float(roc_auc_score([int(i["rating"] == "unusable") for i in sel], [res[i["id"]]["p"] for i in sel])), 3)
    s["cost_usd"] = round(sum(r["cost"] for r in res.values()), 2)
    summary["usability"][name] = s

# ---------------- clips: human-rating correlation ----------------
METRICS = ["jules2DPoseEvaluation", "viona2DPoseEvaluation", "qijia2DPoseEvaluation", "skeleton3DVectorAngleEvaluation",
           "kinematicErrorEvaluationVelocity2DMAE", "kinematicErrorEvaluationVelocity3DMAE"]
rows = {(r["studyName"], r["userId"], r["workflowId"], r["clipNumber"]): r for r in csv.DictReader(open(MM))}
ritems = [i for i in citems if i["set"] == "rated"]
def f(x):
    try: return float(x)
    except: return np.nan
B = 2000
for name, res in clipres.items():
    data = [(rows[(i["study"], i["userId"], i["workflowId"], i["clipNumber"])], res[i["id"]]) for i in ritems
            if i["id"] in res and (i["study"], i["userId"], i["workflowId"], i["clipNumber"]) in rows]
    if len(data) < 50: continue
    hr = np.array([f(r["humanRating"]) for r, _ in data]); fl = np.array([v["flag"] for _, v in data])
    maj = np.array([int(v["severity"] == "major") for _, v in data])
    study = np.array([r["studyName"] for r, _ in data])
    s = {"n_clips": len(data), "n_flagged": int(fl.sum()), "n_major": int(maj.sum()),
         "flag_rate_by_study": {st: rate(fl[study == st]) for st in sorted(set(study))},
         "human_rating_mean": {"flagged": round(float(np.nanmean(hr[fl == 1])), 3) if fl.sum() else None,
                               "unflagged": round(float(np.nanmean(hr[fl == 0])), 3)},
         "metrics": {}}
    for m in METRICS:
        x = np.array([f(r[m]) for r, _ in data]); ok = ~np.isnan(x) & ~np.isnan(hr)
        if ok.sum() < 30: continue
        def rho(mask): return float(spearmanr(x[mask], hr[mask])[0])
        ent = {"all": {"n": int(ok.sum()), "spearman": round(rho(ok), 3), "pearson": round(float(pearsonr(x[ok], hr[ok])[0]), 3)}}
        for lab, excl in (("drop_flagged", fl == 1), ("drop_major", maj == 1)):
            keep = ok & ~excl; k = int((ok & excl).sum())
            if k == 0 or keep.sum() < 30: continue
            r_keep = rho(keep)
            idx = np.where(ok)[0]; null = []
            for _ in range(B):
                drop = rng.choice(idx, k, replace=False); mm = ok.copy(); mm[drop] = False; null.append(rho(mm))
            null = np.array(null); d0 = rho(ok)
            # two-sided: how often random exclusion moves |rho| at least as much as LLM-based exclusion
            ent[lab] = {"n": int(keep.sum()), "dropped": k, "spearman": round(r_keep, 3), "delta": round(r_keep-d0, 3),
                        "random_drop_delta_mean": round(float(null.mean()-d0), 3),
                        "random_drop_delta_95": [round(float(np.percentile(null, 2.5)-d0), 3), round(float(np.percentile(null, 97.5)-d0), 3)],
                        "p_random_as_extreme": round(float(np.mean(np.abs(null-null.mean()) >= abs(r_keep-null.mean()))), 3)}
        for st in sorted(set(study)):
            o = ok & (study == st); k2 = o & (fl == 0)
            if o.sum() >= 30 and k2.sum() >= 30:
                ent.setdefault("by_study", {})[st] = {"all": round(rho(o), 3), "n": int(o.sum()), "drop_flagged": round(rho(k2), 3), "n_kept": int(k2.sum())}
        s["metrics"][m] = ent
    summary["correlation"][name] = s

json.dump(summary, open(OUT, "w"), indent=1)
print(json.dumps(summary, indent=1)[:6000])
