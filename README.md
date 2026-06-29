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
npm run render -- Composition out/composition.mp4
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
