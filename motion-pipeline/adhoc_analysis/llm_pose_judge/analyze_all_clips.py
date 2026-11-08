"""Dataset-wide Haiku clip screen: flag rates overall, by study, dance and condition, plus figure.

usage: analyze_all_clips.py <all-manifest> <results.jsonl> <summary.json> <fig-stem>
"""
import json, math, re, sys
from collections import defaultdict
import matplotlib; matplotlib.use("Agg"); import matplotlib.pyplot as plt

MAN, RES, OUT, FIG = sys.argv[1:5]
items = json.load(open(MAN))["items"]
res = {}
for l in open(RES):
    r = json.loads(l); p = r.get("parsed") or {}
    if "verdict" in p: res[r["id"]] = (int(p["verdict"] == "incorrect"), p.get("severity"), float(p.get("p_incorrect", .5)), r.get("cost_usd") or 0, "reused_from" in r)

def wilson(k, n, z=1.96):
    if not n: return [None, None]
    p = k/n; d = 1+z*z/n; c = (p+z*z/(2*n))/d; h = z*math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d
    return [round(c-h, 3), round(c+h, 3)]

def dance_cond(stem):
    tag = stem.split("____")[-3]
    tag = re.sub(r"^userstudy\d-+", "", tag)
    parts = re.split(r"-+", tag)
    return "-".join(parts[:-1]).replace("pajamaparty", "pajama-party").replace("lastchristmas", "last-christmas").replace("madatdisney", "mad-at-disney"), parts[-1]

groups = defaultdict(lambda: [0, 0, 0])  # n, flagged, major
for it in items:
    if it["id"] not in res: continue
    f, sev, p, c, _ = res[it["id"]]
    d, cond = dance_cond(it["stem"])
    for g in ("all", f"study:{it['study']}", f"dance:{it['study']}/{d}", f"cond:{it['study']}/{cond}"):
        groups[g][0] += 1; groups[g][1] += f; groups[g][2] += int(sev == "major")
summ = {g: {"n": n, "flagged": k, "major": m, "flag_rate": round(k/n, 3), "ci": wilson(k, n)} for g, (n, k, m) in sorted(groups.items())}
summ["_meta"] = {"n_manifest": len(items), "n_judged": sum(1 for i in items if i["id"] in res),
                 "n_reused_from_rated_run": sum(1 for i in items if i["id"] in res and res[i["id"]][4]),
                 "cost_usd_new_calls": round(sum(v[3] for v in res.values() if not v[4]), 2)}
json.dump(summ, open(OUT, "w"), indent=1)
for g, v in summ.items(): print(g, v)

# figure: flag rate by dance, coloured by study
ds = [(g.split(":", 1)[1], v) for g, v in summ.items() if g.startswith("dance:")]
ds.sort(key=lambda x: (x[0].split("/")[0], -x[1]["flag_rate"]))
fig, ax = plt.subplots(figsize=(6.5, 0.32*len(ds)+1.2))
col = {"study1": "#3b82c4", "study2": "#c2410c"}
for y, (name, v) in enumerate(ds):
    st, d = name.split("/")
    ax.barh(y, v["flag_rate"], color=col[st], height=0.7)
    ax.errorbar(v["flag_rate"], y, xerr=[[v["flag_rate"]-v["ci"][0]], [v["ci"][1]-v["flag_rate"]]], color="#333", lw=.7, capsize=2)
    ax.text(v["ci"][1]+0.01, y, f"{v['flagged']}/{v['n']}", va="center", fontsize=7)
ax.set_yticks(range(len(ds))); ax.set_yticklabels([n.split("/")[1].replace("-", " ") for n, _ in ds], fontsize=8)
ax.invert_yaxis(); ax.set_xlabel("share of clips flagged as mis-tracked by Haiku")
ax.set_xlim(0, max(v["ci"][1] for _, v in ds)+0.12)
from matplotlib.patches import Patch
ax.legend(handles=[Patch(color=col["study1"], label=f"Study 1 (n={summ['study:study1']['n']})"), Patch(color=col["study2"], label=f"Study 2 (n={summ['study:study2']['n']})")],
          fontsize=8, frameon=False, loc="lower right")
ax.spines[["top", "right"]].set_visible(False)
fig.tight_layout()
for ext in ("pdf", "svg", "png"): fig.savefig(f"{FIG}.{ext}", dpi=150)
