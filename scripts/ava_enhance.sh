#!/usr/bin/env bash
# ava_enhance.sh — apply the AI Video Academy "course edition" punch finishing pass to a
# finished, assembled lesson cut (presenter + screen-recs + VO, NO captions yet).
#
# Course edition = the Malik DNA (Bebas kinetic per-beat captions, gentle zoom-punch on cuts,
# optional hook stamp, pulsing CTA, calmer SFX, -14 LUFS master) re-laid for 16:9 1920x1080.
# The locked Malik lane (malik_enhance.sh / MalikPunch) is untouched.
#
#   ava_enhance.sh <base_final_nocaption.mp4> [--title "..."] [--cta '...'] [--music f.mp3]
#                  [--accent "#FFD400"] [--punch 1.05] [--keywords grok,codex,client]
#                  [--script script.json --build build_dir]   # optional asm-driven cuts
#
# Delivers to ${OUTPUT_DIR:-$HOME/Desktop}/ava_<slug>_PUNCH_<ts>.mp4 through the AVA ship gate.
set -euo pipefail

MG="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-/usr/bin/python3}"
OUTPUT_DIR="${OUTPUT_DIR:-$HOME/Desktop}"
BASE=""; TITLE=""; CTA='POST IN #WINS BELOW'; MUSIC=""; ACCENT="#FFD400"; PUNCH="1.05"
KEYWORDS=""; SCRIPT=""; BUILD=""
while [ $# -gt 0 ]; do case "$1" in
  --title) TITLE="$2"; shift 2;;
  --cta) CTA="$2"; shift 2;;
  --music) MUSIC="$2"; shift 2;;
  --accent) ACCENT="$2"; shift 2;;
  --punch) PUNCH="$2"; shift 2;;
  --keywords) KEYWORDS="$2"; shift 2;;
  --script) SCRIPT="$2"; shift 2;;
  --build) BUILD="$2"; shift 2;;
  *) BASE="$1"; shift;;
esac; done
[ -n "$BASE" ] && [ -f "$BASE" ] || { echo "usage: ava_enhance.sh <base_nocaption.mp4> [--title t] [--cta c] [--music f] [--punch 1.05] [--keywords a,b]" >&2; exit 2; }
BASE="$(cd "$(dirname "$BASE")" && pwd)/$(basename "$BASE")"

SLUG="$(echo "${TITLE:-ava lesson}" | tr '[:upper:]' '[:lower:]' | tr -cs '[:alnum:]' '_' | sed 's/_*$//' | cut -c1-40)"
JOB="$MG/public/jobs/ava_$SLUG"; mkdir -p "$JOB"
cp "$BASE" "$JOB/base.mp4"

MUSIC_REL="music/punch_beat.mp3"
if [ -n "$MUSIC" ]; then
  [ -f "$MUSIC" ] || { echo "music file not found: $MUSIC" >&2; exit 2; }
  mkdir -p "$MG/public/music"; cp "$MUSIC" "$MG/public/music/$(basename "$MUSIC")"
  MUSIC_REL="music/$(basename "$MUSIC")"
fi

echo "[ava-enhance] ${TITLE:-ava lesson}  (slug=$SLUG, punch=$PUNCH, music=$MUSIC_REL)"
PROPS_ARGS=(--video-abs "$JOB/base.mp4" --video-rel "jobs/ava_$SLUG/base.mp4"
            --out "$JOB/props.json" --music "$MUSIC_REL" --accent "$ACCENT"
            --cta "$CTA" --punch "$PUNCH" --keywords "$KEYWORDS" --title "$TITLE")
if [ -n "$SCRIPT" ] && [ -n "$BUILD" ]; then
  PROPS_ARGS+=(--script "$SCRIPT" --build "$BUILD")
else
  PROPS_ARGS+=(--auto-cuts)
fi
"$PYTHON_BIN" "$MG/scripts/build_ava_props.py" "${PROPS_ARGS[@]}"

cd "$MG"
RENDER="out/ava_${SLUG}_punch.mp4"
npx remotion render AVAPunch "$RENDER" --props="public/jobs/ava_$SLUG/props.json" --log=error

FINAL="out/ava_${SLUG}_punch_final.mp4"
PROV="avapunch:$(git -C "$MG" rev-parse --short HEAD 2>/dev/null || echo v1)"
# deterministic two-pass loudnorm master (single-pass overshoots on music+SFX mixes)
"$PYTHON_BIN" "$MG/scripts/master_audio_ava.py" "$RENDER" "$FINAL" --prov "$PROV"
rm -f "$RENDER"

if ! "$PYTHON_BIN" "$MG/scripts/verify_ava_final.py" "$FINAL"; then
  echo "[ava-enhance] GATE FAILED — refusing to deliver off-standard final" >&2
  exit 3
fi

TS="$(date +%Y%m%d_%H%M)"
mkdir -p "$OUTPUT_DIR"
DEST="$OUTPUT_DIR/ava_${SLUG}_PUNCH_${TS}.mp4"
cp "$FINAL" "$DEST"
echo "[ava-enhance] delivered: $DEST"
