"""Combine natural-failure candidates with manual labels into a judge manifest.
usage: make_natural_manifest.py <ds> <labels.json>   (labels: {id: 0|1}; ids absent = unsure, excluded)"""
import json, sys
ds, lab = sys.argv[1], json.load(open(sys.argv[2]))["labels"]
cands = json.load(open(f"{ds}/natural/candidates.json"))
items = [{**c, "task": "single", "label": lab[c["id"]], "perturbation": "natural_" + c["trigger"]} for c in cands if c["id"] in lab]
json.dump({"items": items}, open(f"{ds}/natural/manifest.json", "w"), indent=1)
print(len(items), "labelled of", len(cands))
