#!/usr/bin/env python3
"""verify_malik_final.py — non-bypassable ship gate for the Malik avatar lane.

Every Malik final must come off the locked MalikPunch finishing pass. This gate fails CLOSED
unless the file matches the standard locked in this repo's MALIK_LANE_STANDARD.md:

  - 1080x1920 H.264 video
  - >= 2 audio channels (stereo)
  - integrated loudness -14 LUFS (+/- tolerance, default 1.5)
  - MalikPunch provenance tag in the container metadata (comment = "malikpunch:...")

Usage:
  verify_malik_final.py <final.mp4> [--lufs-target -14] [--lufs-tol 1.5] [--no-provenance]

Exit 0 = pass (prints "PASS"). Exit 1 = reject (prints every failed check). Exit 2 = usage/probe error.
The drift incident this guards against (2026-06-19): hand-rolled ffmpeg finals shipped at
720x1280 / mono / -28 LUFS with the wrong music bed, bypassing malik_enhance.sh entirely.
"""
import argparse
import json
import re
import subprocess
import sys


def ffprobe_streams(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json",
         "-show_format", "-show_streams", path],
        capture_output=True, text=True,
    )
    if out.returncode != 0:
        print(f"PROBE ERROR: {out.stderr.strip()}", file=sys.stderr)
        sys.exit(2)
    return json.loads(out.stdout)


def integrated_lufs(path):
    """Measure integrated loudness with ffmpeg ebur128. Returns float LUFS or None."""
    out = subprocess.run(
        ["ffmpeg", "-nostats", "-hide_banner", "-i", path,
         "-af", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    # last "I:   -14.2 LUFS" in the summary block
    matches = re.findall(r"I:\s*(-?\d+(?:\.\d+)?)\s*LUFS", out.stderr)
    return float(matches[-1]) if matches else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("final")
    ap.add_argument("--lufs-target", type=float, default=-14.0)
    ap.add_argument("--lufs-tol", type=float, default=1.5)
    ap.add_argument("--no-provenance", action="store_true",
                    help="skip the malikpunch provenance check (for vetting legacy approved files)")
    args = ap.parse_args()

    data = ffprobe_streams(args.final)
    streams = data.get("streams", [])
    fmt = data.get("format", {})
    failures = []

    video = next((s for s in streams if s.get("codec_type") == "video"), None)
    audio = next((s for s in streams if s.get("codec_type") == "audio"), None)

    if not video:
        failures.append("no video stream")
    else:
        w, h = video.get("width"), video.get("height")
        if (w, h) != (1080, 1920):
            failures.append(f"resolution {w}x{h}, must be 1080x1920")

    if not audio:
        failures.append("no audio stream")
    else:
        ch = int(audio.get("channels", 0))
        if ch < 2:
            failures.append(f"audio {ch}ch, must be >= 2 (stereo)")

    lufs = integrated_lufs(args.final)
    if lufs is None:
        failures.append("could not measure integrated loudness")
    elif abs(lufs - args.lufs_target) > args.lufs_tol:
        failures.append(
            f"loudness {lufs:.1f} LUFS, must be {args.lufs_target:+.0f} +/- {args.lufs_tol}")

    if not args.no_provenance:
        comment = (fmt.get("tags", {}) or {}).get("comment", "")
        if not comment.startswith("malikpunch:"):
            failures.append(
                'missing MalikPunch provenance (container comment must start with "malikpunch:") '
                "— this final did not come off malik_enhance.sh")

    if failures:
        print(f"REJECT: {args.final}")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)

    print(f"PASS: {args.final}  ({video['width']}x{video['height']}, "
          f"{audio['channels']}ch, {lufs:.1f} LUFS)")
    sys.exit(0)


if __name__ == "__main__":
    main()
