# AI Video Academy lane — video output STANDARD (course edition)

Forked from the locked Malik lane (`MALIK_LANE_STANDARD.md`) for the AI Video Academy course lessons.
The Malik lane is **untouched** — different composition, scripts, gate, and provenance tag. Every AVA
lesson final ships through the **AVAPunch** Remotion finishing pass.

## HOST IDENTITY LOCK (non-negotiable)
The presenter is **Quinn**, ONE specific 30-year-old man. Every frame or clip where the host's face
appears must be the **exact same man**, same features, not a look-alike. Canonical reference:
`ai-video-academy/production/anchors/quinn_host_ref.png`. The full locked feature block is baked into
every Quinn frame in `PROMPTS.json`. Generate host frames via the Grok `image_edit` path against the
reference, then gate them with `ai-video-academy/production/verify_identity.py` before they enter a render.
A host frame that does not match the reference does not ship. Full spec: `ai-video-academy/IDENTITY-LOCK.md`.

## What's FIXED (the standard)
- **Format:** **1920×1080 (16:9 landscape)**, 30fps, H.264/AAC, audio mastered to **−14 LUFS / −1.5 dBTP**
  via deterministic **two-pass loudnorm** (`master_audio_ava.py`). Single-pass overshoots on music+SFX
  mixes, so the AVA master measures then applies — it lands on target on any content.
- **Captions:** Bebas Neue, tall all-caps, heavy black stroke, lower-center. Shown **per-beat only**
  (lines break on sentence punctuation; a phrase is visible only during its own beat). Keyword terms pop
  in an accent box; the spoken word lifts. Word timing from **Whisper large-v3-turbo**.
- **Motion:** **gentle** zoom-punch on every shot cut (default magnitude **1.05** vs Malik's ~1.10) +
  subtle baseline drift. Tunable per video with `--punch`.
- **SFX (course profile, calmer than Malik):** subtle swoosh on cuts (0.30), quiet keyword pops (0.16),
  and **only one** riser+drop into the CTA — **no mid-lesson risers** so 5–6 min on desktop never fatigues.
- **Music bed:** low (0.10), default `public/music/punch_beat.mp3`; swap with `--music`.
- **Intro:** optional top-anchored hook stamp (kicker + title), clears ~2.3s. Enabled automatically when
  a `--title` is given.
- **CTA endcard:** pulsing INWARD (peaks at base size, never overflows), last ~6s. Default
  `POST IN #WINS BELOW`; set with `--cta`.

## What's VARIABLE
- Music bed, accent color, punch magnitude, CTA text, title, keyword pops — all CLI flags.
- Cuts: auto scene-detected from the assembled base (`--auto-cuts`, the default), or asm-derived if you
  pass `--script`/`--build`.

## Run it — Remotion end to end (NO CapCut)
The whole lesson is built in Remotion. Two compositions:

**`AVALesson` — assembler + finisher (the default path).** One render sequences the lesson's clips
(presenter card/bookends, screen recordings, graphic cards) to the continuous ElevenLabs VO, adds music +
SFX, and applies the VFX. Cut points are EXACT segment boundaries from the edit list — no scene-detection.
Feed it a props.json with `segments[]` + `voSrc` + `words`:
```
npx remotion render AVALesson out/<lesson>.mp4 --props=<edl.json>
python3 scripts/master_audio_ava.py out/<lesson>.mp4 out/<lesson>_final.mp4 --prov avapunch:<sha>
python3 scripts/verify_ava_final.py out/<lesson>_final.mp4
```
`segments[]` kinds: `video` (presenter clip or screen-rec), `image` (a still), `card` (a title/lower-third
built in Remotion — replaces a CapCut graphic).

**`AVAPunch` — finisher only.** Use when a single pre-rendered base already exists (e.g. a captured walkthrough
you didn't assemble in Remotion). `ava_enhance.sh` wraps this path:
```
scripts/ava_enhance.sh <base_nocaption.mp4> \
  --title "Welcome: What You'll Build" --cta 'POST IN #WINS BELOW' --keywords grok,codex,client
```
Both deliver a 1920×1080 final through the same gate. **CapCut is not part of our production** — it only
appears in the course curriculum as a tool we *teach students*, not one we use to build these videos.

## Ship gate (fails closed)
`scripts/verify_ava_final.py` rejects anything that is not **1920×1080 / stereo / −14±1.5 LUFS /
`avapunch:` provenance** before it reaches the Desktop. The ONLY sanctioned exit for an AVA final is this gate.

## Pieces
- `src/AVAPunch.tsx` — the 16:9 composition (forked from MalikPunch, course-tuned).
- `scripts/build_ava_props.py` — props builder: Whisper word timing, scene-cut detection, course SFX schedule.
- `scripts/master_audio_ava.py` — two-pass loudnorm master + provenance stamp.
- `scripts/ava_enhance.sh` — one command: stage → props → render → master → gate → deliver.
- `scripts/verify_ava_final.py` — the ship gate.
- Assets shared with the Malik lane: `public/fonts/BebasNeue-Regular.ttf`, `public/music/punch_beat.mp3`,
  `public/sfx/*`.

## Self-test (verified)
`AVAPunch` rendered an 8s 1920×1080 clip (intro stamp + keyword pops + CTA), two-pass mastered to
**−14.0 LUFS**, and **PASSED** the gate. Proof frames in `out/frames/`.
