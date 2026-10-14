# ugc-motion-graphics

Remotion motion-graphics layer for UGC/avatar video pipelines. It adds kinetic captions, lower thirds, keyword pops, B-roll treatment, transitions, punch cards, and reusable visual standards over avatar or screen-recorded base clips.

This repo is meant to be cloned by an agent and used locally. Job-specific videos and generated render outputs are intentionally ignored.

## Quick Start

```bash
git clone https://github.com/kofiowusuai-lab/ugc-motion-graphics.git
cd ugc-motion-graphics
npm install
npm run studio
```

Render a composition:

```bash
npm run render -- MotionVideo out/composition.mp4
```

## Repo Layout

- `src/Root.tsx` — Remotion composition registration.
- `src/Composition.tsx` — base motion-graphics composition.
- `src/GraphicScenes.tsx` — reusable scene treatments.
- `src/MalikPunch.tsx` — Malik avatar/punch-lane standard.
- `src/AVAPunch.tsx` and `src/AVALesson.tsx` — AVA lane variants.
- `src/Broll.tsx` — B-roll primitives.
- `scripts/` — local prop builders, verification helpers, and enhancement scripts.
- `public/fonts/` — bundled font assets.
- `public/sfx/` — bundled short sound effects.
- `public/music/` — bundled backing music/beat assets.

Ignored runtime folders:

- `out/`
- `public/jobs/`
- `public/pit/`
- root-level generated `public/*.mp4`

## Expected Job Shape

Most jobs provide:

- a base avatar/video clip,
- a voiceover or master audio,
- caption/word timing JSON,
- composition props JSON,
- optional B-roll/screenshots.

Job files should stay local under `public/jobs/<job_id>/` and should not be committed.

## Agent Quick Start

When another user gives this repo link to an agent, the expected flow is:

```bash
git clone https://github.com/kofiowusuai-lab/ugc-motion-graphics.git
cd ugc-motion-graphics
npm install
npm run studio
```

For a real job:

1. Create `public/jobs/<job_id>/`.
2. Put base clips/audio/props in that folder.
3. Point the relevant composition or prop builder at the job folder.
4. Preview in Remotion Studio.
5. Render to `out/`.
6. Inspect the output before delivery.

Agent operating rules are in `AGENTS.md`.

## Standards

See:

- `MALIK_LANE_STANDARD.md`
- `AVA_LANE_STANDARD.md`

These documents define the visual and audio rules for the corresponding avatar lanes.

## Safety

- Do not commit generated job media, client footage, rendered videos, `.env*`, or local profile/runtime state.
- Keep reusable assets in `public/fonts`, `public/sfx`, and `public/music`.
- Keep per-job media under ignored job folders.
- Run a render/preview check before claiming a composition is ready.

## Requirements and composition selection

Use a current Node.js/npm installation. `package.json` does not declare an engine range; the committed lockfile is the dependency reference. `npm ci` provides a clean locked install. The core Studio/render path uses React and Remotion; it does not require API keys.

Registered IDs in [src/Root.tsx](src/Root.tsx) are `MotionVideo`, `BrollVideo`, `StudioVideo`, `MalikPunch`, `AVAPunch`, and `AVALesson`. All run at 30 fps. Dimensions and duration come from props; if duration is omitted, metadata uses the last word's end plus 0.6 seconds, or 10 seconds when there are no words. Set width and height explicitly for each job.

## Minimal reusable render

Create `public/jobs/demo/props.json` with this shape, adding media you own at `public/jobs/demo/base.mp4`:

```json
{
  "videoSrc": "jobs/demo/base.mp4",
  "words": [{"text": "Welcome", "start": 0, "end": 1}],
  "keywords": ["Welcome"],
  "brand": {"title": "Your brand", "handle": "@yourbrand", "accent": "#7CF5C4"},
  "showCaptions": true,
  "width": 1080,
  "height": 1920,
  "durationInSeconds": 5
}
```

```bash
mkdir -p out
npm run render -- MotionVideo out/demo.mp4 --props=public/jobs/demo/props.json
```

Word timing is in **seconds**, unlike the millisecond format used by some caption tools. Relative media references resolve inside `public/`; do not prefix them with `public/`. Without `videoSrc`, `MotionVideo` renders its built-in gradient and sample captions, which is useful for checking the installation. `audioSrc` adds separate audio; check for overlapping source-video audio when providing both.

## Optional lane automation

The Python prop builders require Python 3, FFmpeg/ffprobe, and `openai-whisper` for transcription. Whisper model downloads and inference can be substantial. `make_beat.py` also requires NumPy. There is no bundled Python environment installer.

```bash
# AVA: finish an already assembled clip without baked captions
PYTHON_BIN=python3 OUTPUT_DIR=./out bash scripts/ava_enhance.sh /absolute/path/base.mp4 --title "Lesson title"

# Malik: project must contain script.json and build/final_nocaption.mp4
PYTHON_BIN=python3 OUTPUT_DIR=./out bash scripts/malik_enhance.sh /absolute/path/character-project
```

`PYTHON_BIN` selects the interpreter; the default is `/usr/bin/python3`. `OUTPUT_DIR` selects delivery storage; the default is the user's Desktop. These scripts stage base media and props under `public/jobs/`, render to `out/`, master audio, and run lane verification. See [Malik standards](MALIK_LANE_STANDARD.md) and [AVA standards](AVA_LANE_STANDARD.md) before using these opinionated treatments. A custom music argument is copied to `public/music/`; review git status before committing to avoid publishing job-specific music.

## Validation and troubleshooting

```bash
python3 -m unittest discover -s scripts -p 'test_*.py'
python3 scripts/verify_malik_final.py out/malik-final.mp4
python3 scripts/verify_ava_final.py out/ava-final.mp4
```

The unit test covers punch-prop logic; no comprehensive composition test suite is configured. Final verifiers need FFmpeg/ffprobe and existing rendered media. They return 0 for pass, 1 for rejection, and 2 for usage/probe errors. Preserve the lane provenance metadata added by the finishing scripts.

If a composition is unknown, use one of the registered IDs above. For missing media, check the public-relative path and ensure the ignored job files exist locally. If captions truncate, check timing units and `durationInSeconds`. If a helper cannot import Whisper, install it in the interpreter selected by `PYTHON_BIN`. Preview and inspect actual video/audio before delivery; a passing probe cannot establish visual quality or asset licensing.

## Licensing

This repository does not include a top-level license file. Confirm reuse terms with the owner; dependencies and any bundled media retain their own licenses.
