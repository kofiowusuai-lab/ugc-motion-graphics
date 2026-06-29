#!/usr/bin/env python3
"""
build_punch_props.py — generate MalikPunch props for ANY Malik-lane build.

Given a finished avatar build (the `build/` dir produced by ugc_pipeline/framework/produce.py) and its
script.json, this emits the props.json that drives the MalikPunch Remotion composition: word-accurate
captions (re-transcribed with Whisper large-v3-turbo), per-cut zoom-punch timing, per-board-line beats,
and the locked SFX schedule. Length- and format-agnostic: a script with no `board_state*` stills simply
yields no board beats (the composition then renders no progress bar).

  build_punch_props.py --build <build_dir> --script <script.json> \
      --video-abs <abs base.mp4 to transcribe> --video-rel <staticFile-relative path> \
      --out <props.json> [--music music/punch_beat.mp3] [--accent #FFD400] [--kicker "AI SYSTEMS"]

The standard is fixed here (sizes/volumes live in the composition + this schedule). Music + format vary.
"""
import argparse, json, os, re, subprocess, sys

BASE_KEYWORDS = {"trap", "prompts", "prompt", "systems", "system", "cost", "breakage", "break",
                 "wrong", "twice", "scales", "scale", "brittle", "leaky", "fix", "fast", "money"}

def dur(p):
    return float(subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration",
                                 "-of", "csv=p=0", p], capture_output=True, text=True).stdout.strip() or 0)

def scene_cuts(video_abs, threshold=0.30):
    """Detect hard visual cuts directly in the delivered base. Used when the per-shot _asm
    timeline no longer matches the base (a verified re-cut / ELI6 trim), so _asm-derived cut
    timestamps can't be trusted. Returns sorted cut times; never a punch on the opening frame."""
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

def add_label_keywords(kw, label):
    for tok in re.split(r"[^A-Za-z0-9']+", label or ""):
        n = norm(tok)
        if len(n) > 2:
            kw.add(n)

def script_labels(sc):
    board = sc.get("board") or {}
    labels = ([board["headline"]] + board.get("points", []) + [board["closing"]]) if board.get("headline") else []
    if sc.get("board_headline"):
        labels.append(sc["board_headline"])
    if sc.get("topic"):
        labels.append(sc["topic"])
    for sub in sc.get("subtopics") or []:
        if isinstance(sub, dict):
            labels.append(sub.get("key", ""))
            labels.append(sub.get("example", ""))
    return labels

def validate_timing(ap, *, total, video_duration, words):
    """Return the effective Remotion duration after validating timeline/base agreement.

    The assembly timeline is derived from per-shot _asm files. Some Malik builds run a
    verified final tail-trim after assembly to remove dead air. In that valid case the
    base video is shorter than the _asm timeline, and props must clamp to the actual
    base duration so Remotion does not render past the source. A longer base or a trim
    that cuts through spoken words still fails closed.
    """
    last_word = max((float(w.get("end", 0)) for w in words), default=0.0)
    delta = video_duration - total
    effective_total = total
    if abs(delta) <= 0.5:
        effective_total = total
    elif delta < -0.5:
        # Valid tail-trim case only if the transcript still fits inside the base.
        if last_word > video_duration + 0.5:
            ap.error(
                f"base video duration {video_duration:.2f}s cuts transcript ending at {last_word:.2f}s "
                f"from props duration {total:.2f}s"
            )
        effective_total = video_duration
        print(f"[punch-props] clamped duration from asm {total:.2f}s to tail-trimmed base {video_duration:.2f}s")
    else:
        ap.error(f"props duration {total:.2f}s disagrees with base video duration {video_duration:.2f}s")
    if last_word > effective_total + 0.5:
        ap.error(f"transcript word ends at {last_word:.2f}s past props duration {effective_total:.2f}s")
    return effective_total

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--build", required=True)
    ap.add_argument("--script", required=True)
    ap.add_argument("--video-abs", required=True)
    ap.add_argument("--video-rel", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--music", default="music/punch_beat.mp3")
    ap.add_argument("--music-volume", type=float, default=0.14)
    ap.add_argument("--accent", default="#FFD400")
    ap.add_argument("--accent2", default="#33E6A0")
    ap.add_argument("--kicker", default="AI SYSTEMS")
    ap.add_argument("--scene-threshold", type=float, default=0.30,
                    help="ffmpeg scene-cut sensitivity used only when _asm diverges from the base")
    a = ap.parse_args()

    with open(a.script) as f:
        sc = json.load(f)
    speed = sc.get("speed", 1.15)
    shots = sc["shots"]
    labels = script_labels(sc)

    # cut times + per-shot start (final timeline) from the assembled per-shot clips
    cum = 0.0; cuts = []; starts = {}
    for s in shots:
        starts[s["id"]] = cum / speed
        asm = os.path.join(a.build, "_asm", f"{s['id']}.mp4")
        cum += dur(asm)
        if s.get("kind", "cut") == "cut":
            cuts.append(round(starts[s["id"]], 3))
    total = cum / speed

    # board beats (board_stateN for chained lessons, board_topic for explainer format)
    boardBeats = []
    topic_i = 0
    for s in shots:
        still = s.get("still", "") or ""
        m = re.match(r"board_state(\d+)$", still)
        if m:
            i = int(m.group(1))
            boardBeats.append({"at": round(starts[s["id"]], 3), "label": labels[i] if i < len(labels) else "", "i": i})
        elif still == "board_topic":
            label = sc.get("board_headline") or (labels[0] if labels else sc.get("title", ""))
            boardBeats.append({"at": round(starts[s["id"]], 3), "label": label, "i": topic_i})
            topic_i += 1

    words = transcribe(a.video_abs)
    video_duration = dur(a.video_abs)
    if total - video_duration > 1.5:
        # Base is materially SHORTER than the _asm timeline: a verified re-cut / ELI6 trim.
        # _asm cut timestamps are untrustworthy — derive cuts from the base itself. (A base
        # LONGER than _asm stays a hard error via validate_timing below — that's the broken case.)
        # This is the robust path that removes the need for hand-rolled finishing on re-cuts.
        detected = scene_cuts(a.video_abs, a.scene_threshold)
        print(f"[punch-props] _asm timeline {total:.2f}s disagrees with base {video_duration:.2f}s "
              f"({video_duration-total:+.2f}s) -> using {len(detected)} scene-detected cuts from the base")
        if boardBeats:
            print(f"[punch-props] WARNING: dropped {len(boardBeats)} _asm board beats — a re-cut base "
                  f"cannot be mapped to board lines automatically; review board timing by hand")
            boardBeats = []
        cuts = detected
        total = video_duration
        last_word = max((float(w.get("end", 0)) for w in words), default=0.0)
        if last_word > total + 0.5:
            ap.error(f"transcript word ends at {last_word:.2f}s past base duration {total:.2f}s")
    else:
        total = validate_timing(ap, total=total, video_duration=video_duration, words=words)
    cuts = [c for c in cuts if c < total - 0.05]
    boardBeats = [b for b in boardBeats if b["at"] < total - 0.05]

    # keywords = base set ∪ board/topic/subtopic terms
    kw = set(BASE_KEYWORDS)
    for lab in labels:
        add_label_keywords(kw, lab)

    ctaSec = (sc.get("cta") or {}).get("seconds", 6)
    ctaStart = total - ctaSec

    # locked SFX schedule
    sfx = []
    for c in cuts:
        if c > 0.05:
            sfx.append({"src": "sfx/swoosh.mp3", "at": round(c - 0.08, 3), "volume": 0.5, "dur": 0.6})
    for b in boardBeats:
        sfx.append({"src": "sfx/impact.mp3", "at": round(b["at"] + 0.05, 3), "volume": 0.6, "dur": 0.7})
    for w in words:
        if norm(w["text"]) in kw:
            sfx.append({"src": "sfx/pop.mp3", "at": round(w["start"], 3), "volume": 0.24, "dur": 0.5})
    # riser into the first whiteboard/board cut (resolves AT the hit, fades — never covers VO)
    riser1_at = boardBeats[0]["at"] if boardBeats else (cuts[1] if len(cuts) > 1 else None)
    if riser1_at is not None:
        sfx.append({"src": "sfx/riser.mp3", "at": round(riser1_at - 0.85, 3), "volume": 0.3, "dur": 0.85, "fade": 0.2})
    # riser into the CTA + the drop on the CTA hit
    sfx.append({"src": "sfx/riser.mp3", "at": round(ctaStart - 1.2, 3), "volume": 0.28, "dur": 1.2, "fade": 0.25})
    sfx.append({"src": "sfx/drop.mp3", "at": round(ctaStart + 0.12, 3), "volume": 0.7, "dur": 1.5})

    intro_title = (sc.get("board_headline") or sc.get("title", "")).strip()
    props = {
        "videoSrc": a.video_rel, "musicSrc": a.music, "musicVolume": a.music_volume,
        "words": words, "cuts": cuts, "boardBeats": boardBeats, "keywords": sorted(kw),
        "brand": {"accent": a.accent, "accent2": a.accent2},
        "cta": sc.get("cta", {"text": 'COMMENT "SYSTEMS" BELOW', "seconds": 6}),
        # intro hook card OFF by default so the hero opens clean on his face (enabled=true brings it back)
        "intro": {"kicker": a.kicker, "title": intro_title, "until": 2.3, "enabled": False},
        "sfx": sfx, "durationInSeconds": round(total, 2), "width": 1080, "height": 1920,
    }
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    with open(a.out, "w") as f:
        json.dump(props, f, indent=2)
    print(f"[punch-props] {a.out}: {len(words)} words, {len(cuts)} cuts, {len(boardBeats)} board beats, "
          f"{len(sfx)} sfx, {round(total,2)}s")

if __name__ == "__main__":
    main()
