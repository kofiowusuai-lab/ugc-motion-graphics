#!/usr/bin/env python3
"""
build_ava_props.py — generate AVAPunch props for an AI Video Academy lesson finish.

Forked from build_punch_props.py (the Malik lane). Same data contract, two differences for the
course edition:
  - target format is 16:9 1920x1080 (desktop Skool player), not 9:16
  - the SFX schedule is the CALMER "course" profile: subtle swoosh on cuts, quieter keyword pops,
    NO constant risers — only one riser+drop into the CTA — so 5-6 minutes on desktop never fatigues.

Two ways to drive it:
  A) From a script.json with an assembled `build/_asm/<id>.mp4` per shot (mirrors the Malik flow).
  B) STANDALONE on any finished no-caption cut, with NO script.json — pass --auto-cuts and the cuts
     are scene-detected straight from the base. This is the common AVA path because lessons are
     assembled in CapCut, not produce.py.

  build_ava_props.py --video-abs <base.mp4> --video-rel <staticFile-rel> --out <props.json> \
      [--auto-cuts] [--script script.json --build build_dir] \
      [--music music/punch_beat.mp3] [--accent #FFD400] [--kicker "AI VIDEO ACADEMY"] \
      [--cta 'POST IN #WINS BELOW'] [--punch 1.05] [--keywords grok,codex,client]
"""
import argparse, json, os, re, subprocess, sys

# generic academy keywords that earn an accent pop when spoken
BASE_KEYWORDS = {"grok", "codex", "claude", "elevenlabs", "capcut", "prompt", "prompts", "client",
                 "clients", "video", "videos", "ugc", "avatar", "anchor", "consistency", "scene",
                 "scenes", "hook", "cta", "money", "paid", "offer", "niche", "free", "first"}

def dur(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                 "-of", "csv=p=0", p], capture_output=True, text=True).stdout.strip() or 0)

def scene_cuts(video_abs, threshold=0.30):
    out = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", video_abs,
         "-filter_complex", f"select='gt(scene,{threshold})',metadata=print:file=-",
         "-an", "-f", "null", "-"],
        capture_output=True, text=True)
    blob = (out.stdout or "") + "\n" + (out.stderr or "")
    times = sorted({round(float(m), 3) for m in re.findall(r"pts_time:([0-9.]+)", blob)})
    return [t for t in times if t > 0.05]

def transcribe(video_abs):
    import whisper
    m = whisper.load_model("large-v3-turbo")
    r = m.transcribe(video_abs, word_timestamps=True, language="en", fp16=False)
    return [{"text": w["word"].strip(), "start": round(w["start"], 3), "end": round(w["end"], 3)}
            for s in r["segments"] for w in s.get("words", []) if w.get("word", "").strip()]

def norm(s):
    return "".join(c for c in s.lower() if c.isalnum())

def asm_cuts(build, script):
    with open(script) as f:
        sc = json.load(f)
    speed = sc.get("speed", 1.15)
    cum = 0.0; cuts = []
    for s in sc["shots"]:
        start = cum / speed
        asm = os.path.join(build, "_asm", f"{s['id']}.mp4")
        cum += dur(asm)
        if s.get("kind", "cut") == "cut":
            cuts.append(round(start, 3))
    return cuts, cum / speed, sc

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--video-abs", required=True)
    ap.add_argument("--video-rel", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--auto-cuts", action="store_true", help="scene-detect cuts from the base (no script.json)")
    ap.add_argument("--script", default=None)
    ap.add_argument("--build", default=None)
    ap.add_argument("--music", default="music/punch_beat.mp3")
    ap.add_argument("--music-volume", type=float, default=0.10)
    ap.add_argument("--accent", default="#FFD400")
    ap.add_argument("--accent2", default="#33E6A0")
    ap.add_argument("--kicker", default="AI VIDEO ACADEMY")
    ap.add_argument("--cta", default='POST IN #WINS BELOW')
    ap.add_argument("--cta-seconds", type=float, default=6.0)
    ap.add_argument("--title", default="")
    ap.add_argument("--punch", type=float, default=1.05, help="zoom-punch magnitude (1.0 = off)")
    ap.add_argument("--keywords", default="", help="extra comma-separated keyword pops")
    ap.add_argument("--scene-threshold", type=float, default=0.30)
    a = ap.parse_args()

    video_duration = dur(a.video_abs)
    if video_duration <= 0:
        ap.error(f"could not read base video duration: {a.video_abs}")

    if a.auto_cuts or not a.script:
        cuts = scene_cuts(a.video_abs, a.scene_threshold)
        total = video_duration
        sc = {}
    else:
        if not a.build:
            ap.error("--script requires --build")
        cuts, total, sc = asm_cuts(a.build, a.script)
        if abs(total - video_duration) > 1.5:
            print(f"[ava-props] _asm timeline {total:.2f}s disagrees with base {video_duration:.2f}s "
                  f"-> using scene-detected cuts from the base")
            cuts = scene_cuts(a.video_abs, a.scene_threshold)
            total = video_duration
        else:
            total = video_duration  # clamp render to the real base

    words = transcribe(a.video_abs)
    last_word = max((float(w.get("end", 0)) for w in words), default=0.0)
    if last_word > total + 0.5:
        ap.error(f"transcript word ends at {last_word:.2f}s past base duration {total:.2f}s")
    cuts = [c for c in cuts if 0.05 < c < total - 0.05]

    # keyword set = base ∪ CLI extras ∪ title words
    kw = set(BASE_KEYWORDS)
    for tok in re.split(r"[^A-Za-z0-9']+", a.keywords or ""):
        if len(norm(tok)) > 2: kw.add(norm(tok))
    for tok in re.split(r"[^A-Za-z0-9']+", a.title or sc.get("title", "")):
        if len(norm(tok)) > 2: kw.add(norm(tok))

    ctaSec = a.cta_seconds
    ctaStart = total - ctaSec

    # ---- COURSE SFX profile (calmer than Malik) ----
    sfx = []
    for c in cuts:
        sfx.append({"src": "sfx/swoosh.mp3", "at": round(c - 0.08, 3), "volume": 0.3, "dur": 0.5})
    for w in words:
        if norm(w["text"]) in kw:
            sfx.append({"src": "sfx/pop.mp3", "at": round(w["start"], 3), "volume": 0.16, "dur": 0.45})
    # ONE riser into the CTA + the drop on the hit. No mid-lesson risers.
    if ctaStart > 1.5:
        sfx.append({"src": "sfx/riser.mp3", "at": round(ctaStart - 1.2, 3), "volume": 0.24, "dur": 1.2, "fade": 0.25})
        sfx.append({"src": "sfx/drop.mp3", "at": round(ctaStart + 0.12, 3), "volume": 0.6, "dur": 1.5})

    title = (a.title or sc.get("title", "")).strip()
    props = {
        "videoSrc": a.video_rel, "musicSrc": a.music, "musicVolume": a.music_volume,
        "words": words, "cuts": cuts, "boardBeats": [], "keywords": sorted(kw),
        "brand": {"accent": a.accent, "accent2": a.accent2},
        "cta": {"text": a.cta, "seconds": ctaSec},
        "intro": {"kicker": a.kicker, "title": title.upper(), "until": 2.3, "enabled": bool(title)},
        "sfx": sfx, "durationInSeconds": round(total, 2),
        "width": 1920, "height": 1080, "punchScale": a.punch,
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w") as f:
        json.dump(props, f, indent=2)
    print(f"[ava-props] {a.out}: {len(words)} words, {len(cuts)} cuts, {len(sfx)} sfx, "
          f"{round(total,2)}s, 1920x1080, punch={a.punch}")

if __name__ == "__main__":
    main()
