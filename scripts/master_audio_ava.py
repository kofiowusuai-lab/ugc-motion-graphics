#!/usr/bin/env python3
"""master_audio_ava.py — deterministic two-pass loudnorm master for the AVA lane.

Single-pass loudnorm overshoots on dynamic music+SFX mixes. This measures the input
(pass 1, JSON) then applies loudnorm with the measured values (pass 2, linear), landing
integrated loudness on target within tolerance on any content. Stamps AVAPunch provenance.

  master_audio_ava.py <in.mp4> <out.mp4> [--prov avapunch:xxxx] [--I -14] [--TP -1.5] [--LRA 11]
"""
import argparse, json, re, subprocess, sys


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True)


def measure(path, I, TP, LRA):
    out = run(["ffmpeg", "-hide_banner", "-nostats", "-i", path,
               "-af", f"loudnorm=I={I}:TP={TP}:LRA={LRA}:print_format=json",
               "-f", "null", "-"])
    blob = out.stderr + "\n" + out.stdout
    m = re.search(r"\{[^{}]*\"input_i\"[^{}]*\}", blob, re.S)
    if not m:
        print("could not measure loudness (pass 1)", file=sys.stderr)
        sys.exit(2)
    return json.loads(m.group(0))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("dst")
    ap.add_argument("--prov", default="avapunch:v1")
    ap.add_argument("--I", type=float, default=-14.0)
    ap.add_argument("--TP", type=float, default=-1.5)
    ap.add_argument("--LRA", type=float, default=11.0)
    a = ap.parse_args()

    md = measure(a.src, a.I, a.TP, a.LRA)
    af = (
        f"loudnorm=I={a.I}:TP={a.TP}:LRA={a.LRA}"
        f":measured_I={md['input_i']}:measured_TP={md['input_tp']}"
        f":measured_LRA={md['input_lra']}:measured_thresh={md['input_thresh']}"
        f":linear=true:print_format=summary"
        f",alimiter=limit=0.97"
    )
    out = run(["ffmpeg", "-y", "-loglevel", "error", "-i", a.src, "-c:v", "copy",
               "-af", af, "-c:a", "aac", "-b:a", "256k",
               "-metadata", f"comment={a.prov}", a.dst])
    if out.returncode != 0:
        print(out.stderr, file=sys.stderr)
        sys.exit(1)
    print(f"[master] {a.dst}  (measured I={md['input_i']} -> target {a.I})")


if __name__ == "__main__":
    main()
