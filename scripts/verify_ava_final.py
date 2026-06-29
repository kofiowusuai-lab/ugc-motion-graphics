#!/usr/bin/env python3
"""verify_ava_final.py — ship gate for the AI Video Academy course lane.

Fails CLOSED unless the file matches the AVA course standard:
  - 1920x1080 H.264 video (16:9 desktop)
  - >= 2 audio channels (stereo)
  - integrated loudness -14 LUFS (+/- tolerance, default 1.5)
  - AVAPunch provenance tag in container metadata (comment = "avapunch:...")

Usage: verify_ava_final.py <final.mp4> [--lufs-target -14] [--lufs-tol 1.5] [--no-provenance]
Exit 0 = PASS, 1 = REJECT, 2 = probe/usage error.
"""
import argparse, json, re, subprocess, sys


def ffprobe_streams(path):
    out = subprocess.run(
        ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", "-show_streams", path],
        capture_output=True, text=True)
    if out.returncode != 0:
        print(f"PROBE ERROR: {out.stderr.strip()}", file=sys.stderr)
        sys.exit(2)
    return json.loads(out.stdout)


def integrated_lufs(path):
    out = subprocess.run(
        ["ffmpeg", "-nostats", "-hide_banner", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
        capture_output=True, text=True)
    matches = re.findall(r"I:\s*(-?\d+(?:\.\d+)?)\s*LUFS", out.stderr)
    return float(matches[-1]) if matches else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("final")
    ap.add_argument("--lufs-target", type=float, default=-14.0)
    ap.add_argument("--lufs-tol", type=float, default=1.5)
    ap.add_argument("--no-provenance", action="store_true")
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
        if (w, h) != (1920, 1080):
            failures.append(f"resolution {w}x{h}, must be 1920x1080")

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
        failures.append(f"loudness {lufs:.1f} LUFS, must be {args.lufs_target:+.0f} +/- {args.lufs_tol}")

    if not args.no_provenance:
        comment = (fmt.get("tags", {}) or {}).get("comment", "")
        if not comment.startswith("avapunch:"):
            failures.append('missing AVAPunch provenance (container comment must start with "avapunch:") '
                            "— this final did not come off ava_enhance.sh")

    if failures:
        print(f"REJECT: {args.final}")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)

    print(f"PASS: {args.final}  ({video['width']}x{video['height']}, {audio['channels']}ch, {lufs:.1f} LUFS)")
    sys.exit(0)


if __name__ == "__main__":
    main()
