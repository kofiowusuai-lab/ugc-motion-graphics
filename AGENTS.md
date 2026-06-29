# AGENTS.md

## Purpose

This repo is a local Remotion motion-graphics harness for UGC/avatar videos. Agents use it to add captions, punch cards, transitions, B-roll, and sound design to base clips.

## Start

```bash
npm install
npm run studio
```

## Render

```bash
npm run render -- Composition out/composition.mp4
```

## Agent Rules

- Keep per-job media in ignored folders such as `public/jobs/<job_id>/`.
- Do not commit base clips, generated props, rendered outputs, client footage, `.env*`, or `out/`.
- Use `MALIK_LANE_STANDARD.md` and `AVA_LANE_STANDARD.md` when working on those lanes.
- Preview before render, then inspect the rendered file before delivery.
- Keep reusable source in `src/`, scripts in `scripts/`, and curated reusable media in `public/fonts`, `public/sfx`, and `public/music`.
