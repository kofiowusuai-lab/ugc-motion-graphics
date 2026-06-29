import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  delayRender,
  continueRender,
} from "remotion";

// ---------------------------------------------------------------------------
// AVAPunch — the AI Video Academy "course edition" finishing pass. Forked from
// the locked MalikPunch standard, re-laid for 16:9 1920x1080 desktop lessons and
// tuned for 5-6 minute teaching content (gentler punch, calmer SFX) while keeping
// the same DNA:
//   - kinetic word-captions locked to whisper timings, keyword POPS in accent
//   - a softened per-cut ZOOM PUNCH that springs back (course intensity)
//   - subtle baseline drift for life
//   - an intro hook stamp + a pulsing CTA endcard
//   - a low music bed + a gated SFX schedule (risers/drop at key moments only)
// All timing is data-driven from props (scripts/build_ava_props.py).
// The locked Malik lane (src/MalikPunch.tsx, 1080x1920) is untouched.
// ---------------------------------------------------------------------------

const HEAVY = "'Bebas Neue', 'Arial Narrow', 'Arial Black', Impact, sans-serif";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const resolveSrc = (s?: string) =>
  !s ? undefined : /^(https?:|file:|data:)/.test(s) ? s : staticFile(s);

export type Word = { text: string; start: number; end: number };
type BoardBeat = { at: number; label: string; i: number };
type Sfx = { src: string; at: number; volume?: number; dur?: number; fade?: number };

export type AVAPunchProps = {
  videoSrc?: string;
  musicSrc?: string;
  musicVolume?: number;
  words: Word[];
  cuts: number[];
  boardBeats: BoardBeat[];
  keywords: string[];
  brand?: { title?: string; handle?: string; accent?: string; accent2?: string };
  cta?: { text: string; seconds: number };
  intro?: { kicker?: string; title?: string; until?: number; enabled?: boolean };
  sfx?: Sfx[];
  width?: number;
  height?: number;
  durationInSeconds?: number;
  // course-edition punch magnitude (1.0 = none). Malik uses ~1.10; courses default 1.05.
  punchScale?: number;
};

// --------------------------- caption grouping -------------------------------
// landscape fits more per line than 9:16 — wider maxChars / maxWords.
export type Line = { words: Word[]; start: number; end: number };
export function buildLines(words: Word[], gap = 0.45, maxWords = 9, maxChars = 64): Line[] {
  const lines: Line[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) lines.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  for (let i = 0; i < words.length; i++) {
    cur.push(words[i]);
    const chars = cur.reduce((a, x) => a + x.text.length + 1, 0);
    const next = words[i + 1];
    const bigGap = next ? next.start - words[i].end > gap : true;
    const endsSentence = /[.!?]$/.test(words[i].text.trim());
    if (cur.length >= maxWords || chars >= maxChars || bigGap || endsSentence) flush();
  }
  flush();
  return lines;
}
export function activeLine(lines: Line[], t: number, tail = 0.1): Line | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (t >= l.start && t <= l.end + tail) return l;
  }
  return null;
}

export const defaultAVAPunchProps: AVAPunchProps = {
  videoSrc: "pit/base.mp4",
  musicSrc: "music/punch_beat.mp3",
  musicVolume: 0.10,
  words: [
    { text: "This", start: 0.0, end: 0.3 },
    { text: "is", start: 0.3, end: 0.5 },
    { text: "the", start: 0.5, end: 0.7 },
    { text: "academy", start: 0.7, end: 1.3 },
  ],
  cuts: [0],
  boardBeats: [],
  keywords: ["grok", "codex", "prompt", "client", "video"],
  brand: { title: "AI VIDEO ACADEMY", handle: "@aivideoacademy", accent: "#FFD400", accent2: "#33E6A0" },
  cta: { text: 'POST IN #WINS BELOW', seconds: 6 },
  intro: { kicker: "AI VIDEO ACADEMY", title: "WELCOME IN", until: 2.3, enabled: false },
  sfx: [],
  width: 1920,
  height: 1080,
  durationInSeconds: 8,
  punchScale: 1.05,
};

export const AVAPunch: React.FC<AVAPunchProps> = (props) => {
  const {
    videoSrc, musicSrc, musicVolume = 0.10, words, cuts, boardBeats, keywords,
    brand = {}, cta, intro, sfx = [], punchScale: punchMag = 1.05,
  } = { ...defaultAVAPunchProps, ...props };
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const [fontHandle] = React.useState(() => delayRender("bebas-neue"));
  React.useEffect(() => {
    const f = new FontFace("Bebas Neue", `url(${staticFile("fonts/BebasNeue-Regular.ttf")})`);
    f.load().then((loaded) => { (document as any).fonts.add(loaded); continueRender(fontHandle); })
      .catch(() => continueRender(fontHandle));
  }, [fontHandle]);
  const accent = brand.accent || "#FFD400";
  const accent2 = brand.accent2 || "#33E6A0";
  const kw = React.useMemo(() => new Set(keywords.map(norm)), [keywords]);
  const lines = React.useMemo(() => buildLines(words), [words]);
  const line = activeLine(lines, t);
  const totalSec = durationInFrames / fps;
  const ctaSec = cta?.seconds ?? 6;
  const ctaStart = totalSec - ctaSec;

  // ---- gentler per-cut zoom punch + a slow baseline drift ----
  const lastCut = [...cuts].reverse().find((c) => t >= c) ?? 0;
  const cutF = lastCut * fps;
  const punch = spring({ frame: frame - cutF, fps, config: { damping: 11, mass: 0.7, stiffness: 130 } });
  const punchScale = lastCut <= 0.05 ? 1.0 : interpolate(punch, [0, 1], [punchMag, 1.0]);
  const drift = interpolate(t, [0, totalSec], [1.0, 1.03]);
  const videoScale = punchScale * drift;

  const introUntil = intro?.until ?? 0;
  const showIntro = !!(intro && intro.enabled && t < introUntil);
  const showCTA = !!cta && t >= ctaStart;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* base video with gentle zoom-punch */}
      <AbsoluteFill style={{ transform: `scale(${videoScale})` }}>
        {videoSrc ? (
          <OffthreadVideo src={resolveSrc(videoSrc) as string} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : null}
      </AbsoluteFill>

      {/* light cinematic vignette (softer than Malik for a cleaner course read) */}
      <AbsoluteFill style={{ boxShadow: "inset 0 0 260px rgba(0,0,0,0.42)", pointerEvents: "none" }} />

      {/* music bed */}
      {musicSrc ? <Audio src={resolveSrc(musicSrc) as string} volume={musicVolume} loop /> : null}
      {/* sfx one-shots — honor per-event duration + optional fade-out */}
      {sfx.map((e, i) => {
        const from = Math.max(0, Math.round(e.at * fps));
        const durF = Math.max(1, Math.round((e.dur ?? 3) * fps));
        const vol = e.volume ?? 0.5;
        const fadeF = e.fade ? Math.round(e.fade * fps) : 0;
        return (
          <Sequence key={`sfx-${i}`} from={from} durationInFrames={durF} name={`sfx-${i}`}>
            <Audio
              src={resolveSrc(e.src) as string}
              volume={(f) =>
                fadeF
                  ? vol * interpolate(f, [durF - fadeF, durF], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
                  : vol
              }
            />
          </Sequence>
        );
      })}

      {/* board-progress bar (off unless the script defines board beats) */}
      {boardBeats.length ? (
        <BoardProgress beats={boardBeats} t={t} accent={accent} accent2={accent2} hidden={showIntro || showCTA} />
      ) : null}

      {/* kinetic captions */}
      {line && !showCTA ? (
        <Captions line={line} t={t} kw={kw} accent={accent} />
      ) : null}

      {/* intro hook stamp */}
      {showIntro ? <IntroStamp intro={intro!} t={t} until={introUntil} fps={fps} frame={frame} accent={accent} /> : null}

      {/* CTA endcard */}
      {showCTA ? <CTACard text={cta!.text} t={t} start={ctaStart} fps={fps} accent={accent} accent2={accent2} /> : null}
    </AbsoluteFill>
  );
};

// --------------------------- captions (16:9, lower-center) ------------------
export const Captions: React.FC<{ line: Line; t: number; kw: Set<string>; accent: string }> = ({ line, t, kw, accent }) => {
  const appear = interpolate(t, [line.start, line.start + 0.12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(2)) });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 90, display: "flex", justifyContent: "center", padding: "0 140px" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 26px", justifyContent: "center", opacity: appear }}>
        {line.words.map((w, i) => {
          const isKw = kw.has(norm(w.text));
          const active = t >= w.start - 0.04 && t <= w.end + 0.1;
          const color = isKw ? "#111" : "#fff";
          const bg = isKw ? accent : "transparent";
          return (
            <span key={i} style={{
              fontFamily: HEAVY, fontSize: 62, lineHeight: 0.94, letterSpacing: 1.5,
              color, background: bg, padding: isKw ? "0 12px" : "0", borderRadius: 9,
              WebkitTextStroke: isKw ? "0" : "6px #000",
              paintOrder: "stroke fill",
              textShadow: isKw ? "0 3px 0 rgba(0,0,0,0.3)" : "0 3px 0 rgba(0,0,0,0.5)",
              transform: `translateY(${active ? -3 : 0}px)`,
              transition: "none",
            }}>{w.text.toUpperCase()}</span>
          );
        })}
      </div>
    </div>
  );
};

// --------------------------- board progress (top, landscape) ----------------
export const BoardProgress: React.FC<{ beats: BoardBeat[]; t: number; accent: string; accent2: string; hidden: boolean }> = ({ beats, t, accent, accent2, hidden }) => {
  const n = beats.length;
  return (
    <div style={{ position: "absolute", top: 70, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 14, opacity: hidden ? 0 : 1 }}>
      {beats.map((b, i) => {
        const fill = interpolate(t, [b.at - 0.05, b.at + 0.35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
        return (
          <div key={i} style={{ width: 140, height: 12, borderRadius: 8, background: "rgba(255,255,255,0.22)", overflow: "hidden", border: "1px solid rgba(0,0,0,0.4)" }}>
            <div style={{ width: `${fill * 100}%`, height: "100%", background: i === n - 1 ? accent2 : accent, borderRadius: 8 }} />
          </div>
        );
      })}
    </div>
  );
};

// --------------------------- intro stamp (top-anchored) ---------------------
export const IntroStamp: React.FC<{ intro: NonNullable<AVAPunchProps["intro"]>; t: number; until: number; fps: number; frame: number; accent: string }> = ({ intro, t, until, fps, frame, accent }) => {
  const inS = spring({ frame, fps, config: { damping: 12, mass: 0.7, stiffness: 140 } });
  const out = interpolate(t, [until - 0.4, until], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sc = interpolate(inS, [0, 1], [0.8, 1]);
  const parts = (intro.title || "").split(" ");
  const half = Math.ceil(parts.length / 2);
  const line1 = parts.slice(0, half).join(" ");
  const line2 = parts.slice(half).join(" ");
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 110, opacity: out }}>
      <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.1) 40%, rgba(0,0,0,0) 62%)" }} />
      <div style={{ transform: `scale(${sc})`, textAlign: "center" }}>
        <div style={{ fontFamily: HEAVY, fontSize: 32, letterSpacing: 6, color: accent, marginBottom: 12 }}>{intro.kicker}</div>
        <div style={{ fontFamily: HEAVY, fontSize: 96, lineHeight: 0.96, letterSpacing: 2, color: "#fff", WebkitTextStroke: "7px #000", paintOrder: "stroke fill" as any, textShadow: "0 8px 0 rgba(0,0,0,0.45)" }}>
          <div>{line1}</div>
          {line2 ? <div>{line2}</div> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

// --------------------------- CTA endcard (bottom, never overflows) ----------
export const CTACard: React.FC<{ text: string; t: number; start: number; fps: number; accent: string; accent2: string }> = ({ text, t, start, fps, accent, accent2 }) => {
  const inS = spring({ frame: Math.round((t - start) * fps), fps, config: { damping: 12, mass: 0.8, stiffness: 120 } });
  const y = interpolate(inS, [0, 1], [160, 0]);
  // pulse breathes INWARD (0.965 -> 1.0) so the base size is the max — can never overflow.
  const pulse = 0.965 + 0.035 * (0.5 + 0.5 * Math.sin((t - start) * 6));
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 120 }}>
      <div style={{ transform: `translateY(${y}px) scale(${pulse})`, transformOrigin: "center bottom", opacity: inS, textAlign: "center", maxWidth: 1500 }}>
        <div style={{ fontFamily: HEAVY, fontSize: 40, color: accent2, letterSpacing: 4, marginBottom: 14 }}>👇 DO THIS 👇</div>
        <div style={{ fontFamily: HEAVY, fontSize: 64, letterSpacing: 1.5, color: "#111", background: accent, padding: "20px 40px", borderRadius: 22, boxShadow: "0 12px 0 rgba(0,0,0,0.45)", lineHeight: 1.04, margin: "0 auto", display: "inline-block" }}>
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
