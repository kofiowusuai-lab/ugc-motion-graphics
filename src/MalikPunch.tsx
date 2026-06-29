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
// MalikPunch — punchy (Hormozi/MrBeast) motion-graphics pass over the
// finished talking-head lesson. Layers on the clean non-captioned base video:
//   - per-cut ZOOM PUNCH (scale spike that springs back at every shot cut)
//   - kinetic word-captions locked to whisper timings, keyword POPS in accent
//   - a board-progress bar that fills one segment per board-write beat
//   - impact SHAKE + flash when each board line lands
//   - an intro hook stamp and a CTA endcard
//   - a driving music bed (ducked low) + SFX one-shots
// All timing is data-driven from props (see public/pit/props.json).
// ---------------------------------------------------------------------------

const HEAVY = "'Bebas Neue', 'Arial Narrow', 'Arial Black', Impact, sans-serif";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const resolveSrc = (s?: string) =>
  !s ? undefined : /^(https?:|file:|data:)/.test(s) ? s : staticFile(s);

export type Word = { text: string; start: number; end: number };
type BoardBeat = { at: number; label: string; i: number };
type Sfx = { src: string; at: number; volume?: number; dur?: number; fade?: number };

export type MalikPunchProps = {
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
};

// --------------------------- caption grouping -------------------------------
type Line = { words: Word[]; start: number; end: number };
function buildLines(words: Word[], gap = 0.45, maxWords = 8, maxChars = 54): Line[] {
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
    // ALWAYS break on sentence-ending punctuation so a beat never spills past a full stop
    // (e.g. "...here's why." must not share a line with the next sentence's first words).
    const endsSentence = /[.!?]$/.test(words[i].text.trim());
    if (cur.length >= maxWords || chars >= maxChars || bigGap || endsSentence) flush();
  }
  flush();
  return lines;
}
// A caption line is visible ONLY during its own beat: from its first word's start to just after
// its last word's end. No early "lead" (so the next beat never previews) and we pick the LATEST
// line whose beat has begun (so the previous beat never lingers once the next one starts).
function activeLine(lines: Line[], t: number, tail = 0.1): Line | null {
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i];
    if (t >= l.start && t <= l.end + tail) return l;
  }
  return null;
}

// deterministic decaying shake (no Math.random — must be stable across renders)
function shake(t: number, at: number, dur = 0.28, amp = 22): { x: number; y: number } {
  const dt = t - at;
  if (dt < 0 || dt > dur) return { x: 0, y: 0 };
  const decay = 1 - dt / dur;
  return {
    x: Math.sin(dt * 95) * amp * decay,
    y: Math.cos(dt * 76) * amp * 0.7 * decay,
  };
}

export const defaultMalikPunchProps: MalikPunchProps = {
  videoSrc: "pit/base.mp4",
  musicSrc: "music/punch_beat.mp3",
  musicVolume: 0.14,
  words: [
    { text: "Prompting", start: 0.0, end: 0.5 },
    { text: "is", start: 0.5, end: 0.7 },
    { text: "a", start: 0.7, end: 0.8 },
    { text: "trap", start: 0.8, end: 1.3 },
  ],
  cuts: [0],
  boardBeats: [],
  keywords: ["trap", "prompts", "systems"],
  brand: { title: "SYSTEMS", handle: "@malik.systems", accent: "#FFD400", accent2: "#33E6A0" },
  cta: { text: 'COMMENT "SYSTEMS" BELOW', seconds: 6 },
  intro: { kicker: "AI SYSTEMS", title: "PROMPTING IS A TRAP", until: 2.3, enabled: false },
  sfx: [],
  width: 1080,
  height: 1920,
  durationInSeconds: 50.84,
};

export const MalikPunch: React.FC<MalikPunchProps> = (props) => {
  const {
    videoSrc, musicSrc, musicVolume = 0.14, words, cuts, boardBeats, keywords,
    brand = {}, cta, intro, sfx = [],
  } = { ...defaultMalikPunchProps, ...props };
  const frame = useCurrentFrame();
  const { fps, durationInFrames, width, height } = useVideoConfig();
  const t = frame / fps;
  // load Bebas Neue (tall all-caps) before rendering frames
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

  // ---- per-cut zoom punch + a slow baseline drift for life ----
  const lastCut = [...cuts].reverse().find((c) => t >= c) ?? 0;
  const cutF = lastCut * fps;
  const punch = spring({ frame: frame - cutF, fps, config: { damping: 9, mass: 0.6, stiffness: 150 } });
  // no punch on the very first cut (t=0) so the opening isn't over-zoomed under the intro
  const punchScale = lastCut <= 0.05 ? 1.0 : interpolate(punch, [0, 1], [1.10, 1.0]); // spike -> settle
  const drift = interpolate(t, [0, totalSec], [1.0, 1.045]);
  // impact shake from the nearest board beat
  let sh = { x: 0, y: 0 };
  for (const b of boardBeats) {
    const s = shake(t, b.at + 0.05);
    if (Math.abs(s.x) + Math.abs(s.y) > Math.abs(sh.x) + Math.abs(sh.y)) sh = s;
  }
  const videoScale = punchScale * drift;

  // ---- flash on board impacts ----
  let flash = 0;
  for (const b of boardBeats) {
    flash = Math.max(flash, interpolate(t, [b.at, b.at + 0.06, b.at + 0.3], [0, 0.5, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  }

  const introUntil = intro?.until ?? 0;
  // OFF by default: the hero opens clean on his face. Re-enable per-video with intro.enabled=true.
  const showIntro = !!(intro && intro.enabled && t < introUntil);
  const showCTA = !!cta && t >= ctaStart;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* base video with zoom-punch + impact shake */}
      <AbsoluteFill style={{ transform: `translate(${sh.x}px,${sh.y}px) scale(${videoScale})` }}>
        {videoSrc ? (
          <OffthreadVideo src={resolveSrc(videoSrc) as string} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : null}
      </AbsoluteFill>

      {/* cinematic vignette */}
      <AbsoluteFill style={{ boxShadow: "inset 0 0 320px rgba(0,0,0,0.65)", pointerEvents: "none" }} />
      {/* impact flash */}
      {flash > 0 ? <AbsoluteFill style={{ backgroundColor: "#fff", opacity: flash, mixBlendMode: "overlay" }} /> : null}

      {/* music bed */}
      {musicSrc ? <Audio src={resolveSrc(musicSrc) as string} volume={musicVolume} loop /> : null}
      {/* sfx one-shots — honor per-event duration + optional fade-out so risers
          resolve at their hit and never run under the voice */}
      {sfx.map((e, i) => {
        const from = Math.max(0, Math.round(e.at * fps));
        const durF = Math.max(1, Math.round((e.dur ?? 3) * fps));
        const vol = e.volume ?? 0.6;
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

      {/* board-progress bar */}
      {boardBeats.length ? (
        <BoardProgress beats={boardBeats} t={t} accent={accent} accent2={accent2} hidden={showIntro || showCTA} height={height} />
      ) : null}

      {/* kinetic captions */}
      {line && !showCTA ? (
        <Captions line={line} t={t} fps={fps} kw={kw} accent={accent} />
      ) : null}

      {/* intro hook stamp */}
      {showIntro ? <IntroStamp intro={intro!} t={t} until={introUntil} fps={fps} frame={frame} accent={accent} /> : null}

      {/* CTA endcard */}
      {showCTA ? <CTACard text={cta!.text} t={t} start={ctaStart} fps={fps} frame={frame} accent={accent} accent2={accent2} /> : null}
    </AbsoluteFill>
  );
};

// --------------------------- captions ---------------------------------------
const Captions: React.FC<{ line: Line; t: number; fps: number; kw: Set<string>; accent: string }> = ({ line, t, fps, kw, accent }) => {
  // pop in exactly at the beat start (no pre-roll lead)
  const appear = interpolate(t, [line.start, line.start + 0.12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.back(2)) });
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 740, display: "flex", justifyContent: "center", padding: "0 80px" }}>
      {/* opacity-only fade-in: word SIZE never changes (no entrance scale, no per-word pop) */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 30px", justifyContent: "center", opacity: appear }}>
        {line.words.map((w, i) => {
          const isKw = kw.has(norm(w.text));
          // the word being spoken NOW gets a small vertical lift only — NO size change.
          const active = t >= w.start - 0.04 && t <= w.end + 0.1;
          const color = isKw ? "#111" : "#fff";
          const bg = isKw ? accent : "transparent";
          return (
            <span key={i} style={{
              fontFamily: HEAVY, fontSize: 78, lineHeight: 0.92, letterSpacing: 1.5,
              color, background: bg, padding: isKw ? "0 14px" : "0", borderRadius: 10,
              WebkitTextStroke: isKw ? "0" : "7px #000",
              paintOrder: "stroke fill",
              textShadow: isKw ? "0 4px 0 rgba(0,0,0,0.3)" : "0 4px 0 rgba(0,0,0,0.5)",
              transform: `translateY(${active ? -4 : 0}px)`,
              transition: "none",
            }}>{w.text.toUpperCase()}</span>
          );
        })}
      </div>
    </div>
  );
};

// --------------------------- board progress ---------------------------------
const BoardProgress: React.FC<{ beats: BoardBeat[]; t: number; accent: string; accent2: string; hidden: boolean; height: number }> = ({ beats, t, accent, accent2, hidden }) => {
  const n = beats.length;
  return (
    <div style={{ position: "absolute", top: 150, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 14, opacity: hidden ? 0 : 1 }}>
      {beats.map((b, i) => {
        const fill = interpolate(t, [b.at - 0.05, b.at + 0.35], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
        return (
          <div key={i} style={{ width: 120, height: 12, borderRadius: 8, background: "rgba(255,255,255,0.22)", overflow: "hidden", border: "1px solid rgba(0,0,0,0.4)" }}>
            <div style={{ width: `${fill * 100}%`, height: "100%", background: i === n - 1 ? accent2 : accent, borderRadius: 8 }} />
          </div>
        );
      })}
    </div>
  );
};

// --------------------------- intro stamp ------------------------------------
const IntroStamp: React.FC<{ intro: NonNullable<MalikPunchProps["intro"]>; t: number; until: number; fps: number; frame: number; accent: string }> = ({ intro, t, until, fps, frame, accent }) => {
  const inS = spring({ frame, fps, config: { damping: 12, mass: 0.7, stiffness: 140 } });
  const out = interpolate(t, [until - 0.4, until], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const sc = interpolate(inS, [0, 1], [0.78, 1]);
  const parts = (intro.title || "").split(" ");
  const line1 = parts[0] || "";
  const line2 = parts.slice(1).join(" ");
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "center", paddingTop: 300, opacity: out }}>
      <AbsoluteFill style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0.12) 45%, rgba(0,0,0,0) 70%)" }} />
      {/* straight, no rotation — top-anchored so his face shows below */}
      <div style={{ transform: `scale(${sc})`, textAlign: "center" }}>
        <div style={{ fontFamily: HEAVY, fontSize: 34, letterSpacing: 6, color: accent, marginBottom: 14 }}>{intro.kicker}</div>
        <div style={{ fontFamily: HEAVY, fontSize: 118, lineHeight: 0.94, letterSpacing: 2, color: "#fff", WebkitTextStroke: "8px #000", paintOrder: "stroke fill" as any, textShadow: "0 10px 0 rgba(0,0,0,0.45)" }}>
          <div>{line1}</div>
          <div>{line2}</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// --------------------------- CTA endcard ------------------------------------
const CTACard: React.FC<{ text: string; t: number; start: number; fps: number; frame: number; accent: string; accent2: string }> = ({ text, t, start, fps, accent, accent2 }) => {
  const inS = spring({ frame: Math.round((t - start) * fps), fps, config: { damping: 12, mass: 0.8, stiffness: 120 } });
  const y = interpolate(inS, [0, 1], [200, 0]);
  // pulse BREATHES INWARD: oscillates 0.965 -> 1.0, so the base size is the MAX it ever reaches.
  // Size the base to fit (maxWidth 980 of 1080 → ~50px margin each side) and it can never overflow.
  const pulse = 0.965 + 0.035 * (0.5 + 0.5 * Math.sin((t - start) * 6));
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 400 }}>
      <div style={{ transform: `translateY(${y}px) scale(${pulse})`, transformOrigin: "center bottom", opacity: inS, textAlign: "center", maxWidth: 980 }}>
        <div style={{ fontFamily: HEAVY, fontSize: 46, color: accent2, letterSpacing: 4, marginBottom: 16 }}>👇 DO THIS 👇</div>
        <div style={{ fontFamily: HEAVY, fontSize: 78, letterSpacing: 1.5, color: "#111", background: accent, padding: "24px 42px", borderRadius: 26, boxShadow: "0 14px 0 rgba(0,0,0,0.45)", lineHeight: 1.04, margin: "0 auto", display: "inline-block" }}>
          {text}
        </div>
      </div>
    </AbsoluteFill>
  );
};
