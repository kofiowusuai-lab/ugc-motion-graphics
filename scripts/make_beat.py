#!/usr/bin/env python3
"""Synthesize an original punchy 128 BPM beat bed (license-clean) for the PIT edit.
Four-on-floor kick + sidechained sub, offbeat hats with 16th rolls, clap on 2&4,
and a minor-key pluck arp. Sections build energy. Output: stereo wav."""
import numpy as np, sys, struct, wave

SR = 44100
BPM = 128.0
beat = 60.0 / BPM
bar = 4 * beat
TOTAL = float(sys.argv[2]) if len(sys.argv) > 2 else 50.9
n = int(TOTAL * SR)
t = np.arange(n) / SR
mix = np.zeros(n)

def env(length, a=0.002, d=0.2, sus=0.0, body=None):
    L = int(length * SR); e = np.zeros(L)
    ai = max(1, int(a*SR)); di = max(1, int(d*SR))
    e[:ai] = np.linspace(0, 1, ai)
    e[ai:ai+di] = np.linspace(1, sus, di) if ai+di <= L else np.linspace(1, sus, L-ai)
    if sus > 0: e[ai+di:] = sus
    return e

def add(sig, at):
    i = int(at*SR); j = min(n, i+len(sig))
    if i < n: mix[i:j] += sig[:j-i]

def kick(at):
    L=0.32; L2=int(L*SR); tt=np.arange(L2)/SR
    f=110*np.exp(-tt*22)+48           # pitch drop
    s=np.sin(2*np.pi*np.cumsum(f)/SR)
    s*=np.exp(-tt*7.5)
    click=np.sin(2*np.pi*1800*tt)*np.exp(-tt*120)*0.5
    add((s+click)*0.95, at)

def sub(at, length, freq):
    L=int(length*SR); tt=np.arange(L)/SR
    s=np.sin(2*np.pi*freq*tt)*0.5+np.sin(2*np.pi*freq*2*tt)*0.08
    e=np.minimum(1, tt/0.01)*np.exp(-tt*0.6)
    # sidechain: duck on each beat within this note
    duck=np.ones(L)
    k=at
    while k < at+length:
        di=int((k-at)*SR)
        dl=int(0.18*SR)
        if 0<=di<L:
            seg=np.linspace(0.25,1,min(dl,L-di))
            duck[di:di+len(seg)]=seg
        k+=beat
    add(s*e*duck*0.5, at)

def hat(at, open=False):
    L=0.12 if open else 0.045; L2=int(L*SR); tt=np.arange(L2)/SR
    nz=np.random.randn(L2)
    # crude highpass via diff
    nz=np.diff(np.concatenate([[0],nz]))
    s=nz*np.exp(-tt*(40 if open else 90))
    add(s*0.16, at)

def clap(at):
    L=0.2; L2=int(L*SR); tt=np.arange(L2)/SR
    nz=np.random.randn(L2); nz=np.diff(np.concatenate([[0],nz]))
    burst=np.zeros(L2)
    for o in (0,0.01,0.02):
        di=int(o*SR); burst[di:]+=nz[:L2-di]*np.exp(-np.arange(L2-di)/SR*55)
    add(burst*0.22, at)

def pluck(at, freq, length=0.22):
    L=int(length*SR); tt=np.arange(L)/SR
    s=(np.sign(np.sin(2*np.pi*freq*tt))*0.3+np.sin(2*np.pi*freq*tt)*0.7)
    s*=np.exp(-tt*9)*np.minimum(1,tt/0.004)
    add(s*0.14, at)

# A minor: A2=110, C3=130.81, E3=164.81, G3=196, A3=220
ARP=[110.0,164.81,220.0,164.81, 130.81,196.0,220.0,196.0]
ROOTS=[55.0,55.0,43.65,49.0]  # A1,A1,F1,G1 per 4-bar cycle (Am F G feel)

nbars=int(TOTAL/bar)+1
for b in range(nbars):
    b0=b*bar
    intro = b < 2            # lighter intro
    drop = b >= 2
    root=ROOTS[b % 4]
    if drop:
        sub(b0, bar, root)
    for q in range(4):
        bt=b0+q*beat
        if drop: kick(bt)
        if q in (1,3): clap(bt)
        # hats on 8ths, with 16th rolls late in bars
        for h in range(2):
            hat(bt+h*beat/2, open=(q==3 and h==1))
        if drop and q==3:
            hat(bt+beat*0.75); hat(bt+beat*0.875)
    # pluck arp (8 notes/bar) once we drop
    if drop:
        for k in range(8):
            pluck(b0+k*beat/2, ARP[k % len(ARP)]*2, 0.2)

# soft saturation + normalize
mix=np.tanh(mix*1.2)
mix=mix/(np.max(np.abs(mix))+1e-9)*0.85
stereo=np.stack([mix, np.roll(mix,30)*0.96+mix*0.0],axis=1)  # tiny width
stereo[:,1]=mix*0.97
out=sys.argv[1]
data=(stereo*32767).astype('<i2').tobytes()
w=wave.open(out,'wb'); w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(data); w.close()
print(f"wrote {out} ({TOTAL:.1f}s, {nbars} bars @ {BPM}bpm)")
