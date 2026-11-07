"""Ask a Claude model (via headless `claude -p`, stream-json input with base64 images, no tools)
whether a MediaPipe skeleton overlay is correct. Appends one JSON line per item to results file; resumable."""
import argparse, base64, json, os, re, subprocess, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed

SYSTEM = "You are a meticulous quality-control reviewer for 2D human pose estimation. You answer only with the requested JSON."

LEGEND = ("The image shows a dancer with a MediaPipe pose-estimation skeleton drawn on top. "
          "ORANGE lines/dots = the person's own LEFT side, BLUE = the person's own RIGHT side (anatomical left/right from the dancer's "
          "point of view, not the viewer's), WHITE = torso cross-links (shoulder-shoulder, hip-hip) and face links.")

P_SINGLE = LEGEND + """

Task: decide whether this skeleton is a CORRECT estimate of the dancer's actual body pose in this frame.
Judge it INCORRECT if any of these is clearly wrong: a limb or joint is placed where the dancer's body part is not; limbs are swapped or cross over wrongly; the left/right colouring is on the wrong side of the body; the skeleton is offset from or misaligned with the body; the skeleton shows a different pose than the dancer. Small inaccuracies of a few pixels are acceptable and count as CORRECT.

Respond with JSON only, no other text:
{"verdict": "correct" | "incorrect", "p_incorrect": <number 0-1, your probability that the skeleton is incorrect>, "problems": "<short description, or empty>"}"""

P_SINGLE_RAW = ("You get two images of the same video frame. Image 1 is the original frame. Image 2 is the same frame with a skeleton overlay. "
                + P_SINGLE.replace("The image shows", "Image 2 shows"))

P_SEQ = LEGEND.replace("The image shows a dancer", "The image is a grid of 6 consecutive video frames (numbered 1-6, read left-to-right, top-to-bottom, 0.2 s apart) of a dancer, each") + """

Task: decide whether the skeleton tracking is CORRECT in ALL six frames, i.e. in every frame the skeleton matches the dancer's actual body pose in that frame.
Judge it INCORRECT if in any frame: a limb or joint is placed where the body part is not; limbs are swapped; the left/right colouring flips to the wrong side; the skeleton is offset from the body or drifts away from it; or the skeleton lags behind / does not follow the dancer's movement. Small inaccuracies of a few pixels are acceptable.

Respond with JSON only, no other text:
{"verdict": "correct" | "incorrect", "p_incorrect": <number 0-1>, "bad_frames": [<frame numbers that are wrong, empty if none>], "problems": "<short description, or empty>"}"""

def img_block(path):
    return {"type": "image", "source": {"type": "base64", "media_type": "image/jpeg", "data": base64.b64encode(open(path, "rb").read()).decode()}}

def call(model, content, effort=None, timeout=240):
    msg = json.dumps({"type": "user", "message": {"role": "user", "content": content}}) + "\n"
    cmd = ["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--model", model,
           "--system-prompt", SYSTEM, "--tools", "", "--no-session-persistence", "--strict-mcp-config", "--setting-sources", ""]
    if effort: cmd += ["--effort", effort]
    t0 = time.time()
    r = subprocess.run(cmd, input=msg, capture_output=True, text=True, timeout=timeout, cwd="/tmp")
    text, served, cost, usage = None, None, None, None
    for line in r.stdout.splitlines():
        try: o = json.loads(line)
        except Exception: continue
        if o.get("type") == "assistant":
            served = o["message"].get("model") or served
            for b in o["message"].get("content", []):
                if b.get("type") == "text": text = (text or "") + b["text"]
        if o.get("type") == "result":
            cost = o.get("total_cost_usd"); usage = o.get("usage")
            if text is None: text = o.get("result")
    return {"text": text, "served_model": served, "cost_usd": cost, "usage": usage, "secs": round(time.time()-t0, 1),
            "rc": r.returncode, "stderr": r.stderr[-300:] if r.returncode else ""}

def parse(text):
    if not text: return None
    m = re.search(r"\{.*\}", text, re.S)
    if not m: return None
    try: return json.loads(m.group(0))
    except Exception: return None

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ds", required=True); ap.add_argument("--model", required=True); ap.add_argument("--cond", required=True,
                    choices=["single", "single_raw", "sequence"]); ap.add_argument("--out", required=True)
    ap.add_argument("--workers", type=int, default=8); ap.add_argument("--limit", type=int); ap.add_argument("--effort"); ap.add_argument("--manifest")
    a = ap.parse_args()
    items = json.load(open(a.manifest or f"{a.ds}/manifest.json"))["items"]
    items = [i for i in items if i["task"] == ("sequence" if a.cond == "sequence" else "single")]
    if a.limit: items = items[:a.limit]
    done = set()
    if os.path.exists(a.out):
        for l in open(a.out):
            o = json.loads(l)
            if o.get("parsed") is not None: done.add(o["id"])
    todo = [i for i in items if i["id"] not in done]
    print(f"{len(todo)} to run ({len(done)} done)", flush=True)
    def work(it):
        if a.cond == "single": content = [img_block(f"{a.ds}/{it['img']}"), {"type": "text", "text": P_SINGLE}]
        elif a.cond == "single_raw": content = [img_block(f"{a.ds}/{it['img_raw']}"), img_block(f"{a.ds}/{it['img']}"), {"type": "text", "text": P_SINGLE_RAW}]
        else: content = [img_block(f"{a.ds}/{it['img']}"), {"type": "text", "text": P_SEQ}]
        for attempt in range(3):
            try: res = call(a.model, content, a.effort)
            except subprocess.TimeoutExpired: res = {"text": None, "rc": -1, "stderr": "timeout"}
            p = parse(res.get("text"))
            if p is not None: break
            time.sleep(5*(attempt+1))
        return {"id": it["id"], "model": a.model, "cond": a.cond, "effort": a.effort, "label": it["label"], "perturbation": it["perturbation"],
                "parsed": p, **res}
    with open(a.out, "a") as f, ThreadPoolExecutor(a.workers) as ex:
        futs = [ex.submit(work, it) for it in todo]; n = 0
        for fu in as_completed(futs):
            r = fu.result(); f.write(json.dumps(r) + "\n"); f.flush(); n += 1
            if n % 25 == 0: print(n, flush=True)
main()
