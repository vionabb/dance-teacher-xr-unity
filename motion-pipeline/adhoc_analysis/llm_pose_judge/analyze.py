"""Summarise judge results: accuracy, precision/recall (positive = skeleton incorrect), AUC, per-perturbation detection."""
import json, glob, os, sys, math
from collections import defaultdict
import numpy as np
from sklearn.metrics import roc_auc_score
RES = sys.argv[1]; OUT = sys.argv[2]

def wilson(k, n, z=1.96):
    if n == 0: return (float("nan"),)*2
    p = k/n; d = 1+z*z/n; c = p+z*z/(2*n); h = z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))
    return ((c-h)/d, (c+h)/d)

def load(path):
    rows = [json.loads(l) for l in open(path)]
    last = {}
    for r in rows: last[r["id"]] = r  # last attempt wins
    return list(last.values())

summary = {}
for path in sorted(glob.glob(f"{RES}/*.jsonl")):
    run = os.path.basename(path)[:-6]
    rows = load(path)
    ok = [r for r in rows if r.get("parsed") and r["parsed"].get("verdict") in ("correct", "incorrect")]
    y = np.array([r["label"] for r in ok]); pred = np.array([r["parsed"]["verdict"] == "incorrect" for r in ok]).astype(int)
    p = np.array([float(r["parsed"].get("p_incorrect", pred[i])) for i, r in enumerate(ok)])
    tp = int(((y == 1) & (pred == 1)).sum()); fp = int(((y == 0) & (pred == 1)).sum()); tn = int(((y == 0) & (pred == 0)).sum()); fn = int(((y == 1) & (pred == 0)).sum())
    n = len(ok)
    s = {"n_items": len(rows), "n_parsed": n, "n_pos": int(y.sum()), "n_neg": int((1-y).sum()),
         "accuracy": (tp+tn)/n if n else None, "accuracy_ci95": wilson(tp+tn, n),
         "precision": tp/(tp+fp) if tp+fp else None, "recall": tp/(tp+fn) if tp+fn else None, "recall_ci95": wilson(tp, tp+fn),
         "specificity": tn/(tn+fp) if tn+fp else None, "specificity_ci95": wilson(tn, tn+fp),
         "f1": 2*tp/(2*tp+fp+fn) if tp else 0.0, "tp": tp, "fp": fp, "tn": tn, "fn": fn,
         "auc": float(roc_auc_score(y, p)) if len(set(y)) == 2 else None,
         "cost_usd_total": round(sum(r.get("cost_usd") or 0 for r in rows), 4),
         "secs_median": float(np.median([r["secs"] for r in rows if r.get("secs")])),
         "served_models": sorted({r.get("served_model") for r in rows if r.get("served_model")})}
    per = defaultdict(lambda: [0, 0])
    for r, pr in zip(ok, pred):
        per[r["perturbation"]][0] += int(pr == r["label"]); per[r["perturbation"]][1] += 1
    s["per_perturbation_acc"] = {k: {"correct": v[0], "n": v[1], "rate": v[0]/v[1]} for k, v in sorted(per.items())}
    if any("bad_frames" in (r["parsed"] or {}) for r in ok):
        man = {i["id"]: i for i in json.load(open(os.environ.get("MANIFEST", "ds/manifest.json")))["items"]}
        hits = tot = exact = 0
        for r, pr in zip(ok, pred):
            if r["label"] == 1 and pr == 1:
                true = set(man[r["id"]]["bad_tiles"]); got = set(int(x) for x in (r["parsed"].get("bad_frames") or []) if str(x).isdigit())
                tot += 1; hits += bool(true & got); exact += (true == got)
        s["localisation"] = {"detected_perturbed": tot, "any_overlap": hits, "exact": exact}
    summary[run] = s
json.dump(summary, open(OUT, "w"), indent=1)
for k, s in summary.items():
    print(f"{k:24s} n={s['n_parsed']:3d}/{s['n_items']:3d} acc={s['accuracy']:.3f} prec={s['precision'] or 0:.3f} rec={s['recall'] or 0:.3f} spec={s['specificity'] or 0:.3f} auc={s['auc'] or 0:.3f} cost=${s['cost_usd_total']}")
    print("   ", {p: f"{v['correct']}/{v['n']}" for p, v in s["per_perturbation_acc"].items()}, s.get("localisation", ""))
