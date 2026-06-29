# Malik avatar lane — video output STANDARD (locked)

Every Malik avatar-lane video ships through the **MalikPunch** Remotion finishing pass. This is the
approved quality bar (locked 2026-06-17). Music bed and format are the only things we vary; the look and
quality below are fixed.

Canonical example: keep a local approved Malik reference render outside git and compare every new Malik output against it. This is the visual and timing bar for every Malik output, whether 30 seconds, 5 minutes, or 10 minutes. Do not use a technically passing render as the bar if it violates the approved reference.

Reference doctrine and frames should live in the user's private job/reference folder, not in this public repo.

## What's FIXED (the standard)
- **Format:** 1080×1920, 30fps, H.264/AAC, audio mastered to **-14 LUFS / -1.5 dBTP** (loudnorm + limiter).
- **Captions:** Bebas Neue, tall all-caps, heavy black stroke. Shown **per-beat only** — lines break on
  sentence punctuation (`.!?`) and a phrase is visible ONLY during its own beat (no early preview of the
  next beat, no lingering of the previous). Keyword terms pop in an accent box; the word being spoken
  scales up. Word timing comes from **Whisper large-v3-turbo** (accurate sync).
- **Motion:** zoom-punch on every shot cut (no punch on the opening frame); subtle baseline drift.
- **Board formats:** a board-progress bar fills one segment per board line, with an impact shake/flash as
  each line lands. Non-board formats simply omit the bar (auto-detected).
- **Whiteboard chronology:** the board is the timeline. Text begins at the top of the board, uses the v4 large sparse black-marker look, and accumulates forward only. If Malik sits down after anything is written, the background board must preserve the latest written state. Blank, unrelated, dense, or regressed board states after writing are failures even when the render passes technical QA.
- **Intro:** straight (no tilt), top-anchored hook stamp — kicker + 2-line title — clears by ~2.3s.
- **CTA endcard:** big, pulsing INWARD (peaks at base size so it can never overflow the frame), last ~6s.
- **SFX schedule (locked volumes):** swoosh on cuts (0.5), impact on board beats (0.6), pop on keyword
  captions (0.24), risers that **resolve at their hit and fade so they never cover the voice** (into the
  first board cut @0.3, into the CTA @0.28), drop on the CTA hit (0.7).

## What's VARIABLE
- **Music bed** — default `public/music/punch_beat.mp3`; swap per video with `--music <file.mp3>`.
  `punch_beat.mp3` is the canonical Malik bed. The UGC bed at
  a UGC bed from another lane is **NOT a Malik asset** — never use it.
- **Format** — board lesson vs. non-board; handled automatically from the script's stills.

## Drift failures — DO NOT REPEAT
The finishing pass is **MalikPunch only**. Hand-rolling captions/SFX/music/master in raw ffmpeg,
ASS, or numpy is forbidden — it silently drifts off every locked axis.

Real incident (2026-06-19): the "AI Operator OS / ELI6" video was finished by one-off
`rebuild_punch_*.py` / `repair_cut_timing_and_hero.py` scripts that never called this pass. The
deliveries came out **720×1280, mono, −28 LUFS, wrong music bed, fake numpy SFX** — failing on
every axis above. Those scripts are now quarantined under
`ugc_pipeline/systems_gladiator_v2/build_4min_multiloc_repair/_deprecated/`.

Enforcement: `scripts/malik_enhance.sh` stamps a `malikpunch:<sha>` provenance tag and runs
`scripts/verify_malik_final.py` (1080×1920 / stereo / −14±1.5 LUFS / provenance) before any
Desktop delivery. `build_and_monitor.sh --punch` runs the same gate independently. A final that
fails the gate is never delivered. The ONLY sanctioned exit for a Malik video is this gate.

## Run it

Standalone, on any finished avatar build (`build/final_nocaption.mp4` + `script.json` present):
```
scripts/malik_enhance.sh <character_dir> [--music f.mp3] [--title "..."]
# e.g.
scripts/malik_enhance.sh /path/to/avatar-project
```
Delivers `${OUTPUT_DIR:-$HOME/Desktop}/malik_<slug>_PUNCH_<ts>.mp4`.

Automatic as part of the sanctioned ship path — add `--punch` to build_and_monitor:
```
framework/build_and_monitor.sh --char character.json --script script.json --qa --punch --title "…"
```
The punch pass runs AFTER the verified source is delivered and is best-effort — if Remotion errors, the
ship is unaffected.

## How it works (pieces)
- `src/MalikPunch.tsx` — the composition (data-driven; layout tuned for 9:16 1080×1920).
- `scripts/build_punch_props.py` — generates props for any build: re-transcribes with large-v3-turbo,
  derives cuts/board beats from the assembled clip durations, builds the SFX schedule. Length/format agnostic.
- `scripts/malik_enhance.sh` — one command: stage assets → props → render → master → deliver.
- `scripts/make_beat.py` — generator for the default synth beat.
- Assets: `public/fonts/BebasNeue-Regular.ttf`, `public/music/punch_beat.mp3`, `public/sfx/*`.

## Changing the standard
Edit `src/MalikPunch.tsx` (look) or the schedule in `scripts/build_punch_props.py` (timing/volumes),
re-run the driver on the canonical build, eyeball against the example above, then commit. The standard is
whatever is committed here.
