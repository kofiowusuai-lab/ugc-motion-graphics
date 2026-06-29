#!/usr/bin/env bash
# malik_enhance.sh — apply the LOCKED Malik-lane "punch" finishing pass to any finished avatar build.
#
# Brings any Malik video (any length, board or non-board format) to the approved standard: Bebas tall
# captions per-beat, zoom-punch on cuts, board-progress, intro hook, pulsing CTA, SFX schedule,
# large-v3-turbo word timing, -14 LUFS master. Music bed + format are the only variables.
#
#   malik_enhance.sh <character_dir> [--music <file.mp3>] [--title "..."] [--accent "#FFD400"]
#
# <character_dir> is the avatar's project dir containing build/final_nocaption.mp4 + script.json
# Delivers to ${OUTPUT_DIR:-$HOME/Desktop}/malik_<slug>_PUNCH_<ts>.mp4.
set -euo pipefail

MG="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-/usr/bin/python3}"
OUTPUT_DIR="${OUTPUT_DIR:-$HOME/Desktop}"
DIR=""; MUSIC=""; TITLE_OVERRIDE=""; ACCENT="#FFD400"; SCRIPT_OVERRIDE=""; BASE_OVERRIDE=""; BUILD_OVERRIDE=""
while [ $# -gt 0 ]; do case "$1" in
  --music) MUSIC="$2"; shift 2;;
  --title) TITLE_OVERRIDE="$2"; shift 2;;
  --accent) ACCENT="$2"; shift 2;;
  --script) SCRIPT_OVERRIDE="$2"; shift 2;;   # exact script just built (else <dir>/script.json)
  --base) BASE_OVERRIDE="$2"; shift 2;;        # exact final_nocaption.mp4 just built (else <dir>/build/...)
  --build) BUILD_OVERRIDE="$2"; shift 2;;      # exact produce.py work/build dir (else <dir>/build)
  *) DIR="$1"; shift;;
esac; done
[ -n "$DIR" ] || { echo "usage: malik_enhance.sh <character_dir> [--build dir] [--script f] [--base f] [--music f] [--title t] [--accent #hex]" >&2; exit 2; }
DIR="$(cd "$DIR" && pwd)"
BUILD="${BUILD_OVERRIDE:-$DIR/build}"
BUILD="$(cd "$BUILD" && pwd)"
SCRIPT="${SCRIPT_OVERRIDE:-$DIR/script.json}"
BASE="${BASE_OVERRIDE:-$BUILD/final_nocaption.mp4}"
[ -f "$BASE" ] && [ -f "$SCRIPT" ] || { echo "need $BASE and $SCRIPT" >&2; exit 2; }

TITLE="${TITLE_OVERRIDE:-$("$PYTHON_BIN" -c "import json;print(json.load(open('$SCRIPT')).get('title','malik video'))")}"
SLUG="$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '_' | sed 's/_*$//' | cut -c1-40)"
JOB="$MG/public/jobs/$SLUG"; mkdir -p "$JOB"
cp "$BASE" "$JOB/base.mp4"

# music: default to the locked beat; if --music given, stage it into public/music and use it
MUSIC_REL="music/punch_beat.mp3"
if [ -n "$MUSIC" ]; then
  [ -f "$MUSIC" ] || { echo "music file not found: $MUSIC" >&2; exit 2; }
  mkdir -p "$MG/public/music"; cp "$MUSIC" "$MG/public/music/$(basename "$MUSIC")"
  MUSIC_REL="music/$(basename "$MUSIC")"
fi

echo "[enhance] $TITLE  (slug=$SLUG, music=$MUSIC_REL)"
"$PYTHON_BIN" "$MG/scripts/build_punch_props.py" --build "$BUILD" --script "$SCRIPT" \
  --video-abs "$JOB/base.mp4" --video-rel "jobs/$SLUG/base.mp4" \
  --music "$MUSIC_REL" --accent "$ACCENT" --out "$JOB/props.json"

cd "$MG"
RENDER="out/${SLUG}_punch.mp4"
npx remotion render MalikPunch "$RENDER" --props="public/jobs/$SLUG/props.json" --log=error

# audio master (social loudness + limiter) + MalikPunch provenance stamp
FINAL="out/${SLUG}_punch_final.mp4"
PROV="malikpunch:$(git -C "$MG" rev-parse --short HEAD 2>/dev/null || echo v1)"
ffmpeg -y -loglevel error -i "$RENDER" -c:v copy \
  -af "loudnorm=I=-14:TP=-1.5:LRA=11,alimiter=limit=0.97" -c:a aac -b:a 256k \
  -metadata comment="$PROV" "$FINAL"
rm -f "$RENDER"

# non-bypassable ship gate: reject anything off the locked standard before it touches the Desktop
if ! "$PYTHON_BIN" "$MG/scripts/verify_malik_final.py" "$FINAL"; then
  echo "[enhance] GATE FAILED — refusing to deliver off-standard final" >&2
  exit 3
fi

TS="$(date +%Y%m%d_%H%M)"
mkdir -p "$OUTPUT_DIR"
DEST="$OUTPUT_DIR/malik_${SLUG}_PUNCH_${TS}.mp4"
cp "$FINAL" "$DEST"
echo "[enhance] delivered: $DEST"
