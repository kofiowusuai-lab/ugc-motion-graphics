import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Img,
  Audio,
  Series,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import {
  Word,
  buildLines,
  activeLine,
  Captions,
  IntroStamp,
  CTACard,
} from "./AVAPunch";

// ---------------------------------------------------------------------------
// AVALesson — the Remotion-native lesson ASSEMBLER + finisher. One render does
// the whole job (no CapCut): it sequences the lesson's clips on the base track
// (presenter talking-head bookends, screen recordings, graphic cards), lays the
// continuous ElevenLabs VO over the top, adds the music bed + SFX, and applies
// the AVAPunch course VFX (gentle zoom-punch on every segment boundary, kinetic
// keyword captions, hook stamp, pulsing CTA). The cut points are EXACT segment
// boundaries from the edit list — no scene-detection guesswork.
// ---------------------------------------------------------------------------

const HEAVY = "'Bebas Neue', 'Arial Narrow', 'Arial Black', Impact, sans-serif";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const resolveSrc = (s?: string) =>
  !s ? undefined : /^(https?:|file:|data:)/.test(s) ? s : staticFile(s);

type Sfx = { src: string; at: number; volume?: number; dur?: number; fade?: number };
// sharp text rendered as a Remotion overlay (NEVER baked into the AI image -> no text drift)
export type TextOverlay = {
  text: string;
  role?: "label" | "headline" | "callout" | "diagram_label";
  x?: number;                // 0-100 % from left (center of the text), default 50
  y?: number;                // 0-100 % from top, default 50
  size?: "s" | "m" | "l";
  accent?: boolean;          // render in the brand accent colour
};
export type Segment = {
  kind: "video" | "image" | "card";
  src?: string;              // for video/image
  durationInSeconds: number;
  // for kind:"card" (a generated lower-third / title card built in Remotion, no asset needed)
  card?: { kicker?: string; title?: string; bg?: string };
  overlays?: TextOverlay[];  // sharp words layered on top of this segment (labels, headlines, diagram labels)
};

export type AVALessonProps = {
  segments: Segment[];
  voSrc?: string;            // continuous narration track (one ElevenLabs render for the lesson)
  voVolume?: number;
  musicSrc?: string;
  musicVolume?: number;
  words: Word[];
  keywords: string[];
  brand?: { accent?: string; accent2?: string };
  cta?: { text: string; seconds: number };
  intro?: { kicker?: string; title?: string; until?: number; enabled?: boolean };
  sfx?: Sfx[];
  punchScale?: number;
  width?: number;
  height?: number;
  durationInSeconds?: number;
};

export const defaultAVALessonProps: AVALessonProps = {
  segments: [
    { kind: "card", durationInSeconds: 2.5, card: { kicker: "AI VIDEO ACADEMY", title: "WELCOME IN", bg: "#0b1f3a" } },
    { kind: "video", src: "pit/base.mp4", durationInSeconds: 4 },
  ],
  voSrc: undefined,
  voVolume: 1.0,
  musicSrc: "music/punch_beat.mp3",
  musicVolume: 0.10,
  words: [
    { text: "This", start: 0.2, end: 0.5 },
    { text: "lesson", start: 0.5, end: 1.0 },
    { text: "is", start: 1.0, end: 1.2 },
    { text: "assembled", start: 1.2, end: 1.9 },
    { text: "in", start: 1.9, end: 2.0 },
    { text: "Remotion.", start: 2.0, end: 2.7 },
  ],
  keywords: ["remotion", "grok", "codex", "client"],
  brand: { accent: "#FFD400", accent2: "#33E6A0" },
  cta: { text: "POST IN #WINS BELOW", seconds: 2 },
  intro: { kicker: "AI VIDEO ACADEMY", title: "WELCOME IN", until: 2.3, enabled: false },
  sfx: [],
  punchScale: 1.05,
  width: 1920,
  height: 1080,
  durationInSeconds: 6.5,
};

// a Remotion-built title / lower-third card (replaces a CapCut graphic)
const Card: React.FC<{ kicker?: string; title?: string; bg?: string; accent: string }> = ({ kicker, title, bg, accent }) => (
  <AbsoluteFill style={{ background: bg || "#0b1f3a", justifyContent: "center", alignItems: "center" }}>
    <div style={{ textAlign: "center" }}>
      {kicker ? <div style={{ fontFamily: HEAVY, fontSize: 36, letterSpacing: 6, color: accent, marginBottom: 16 }}>{kicker}</div> : null}
      {title ? <div style={{ fontFamily: HEAVY, fontSize: 110, letterSpacing: 2, color: "#fff", lineHeight: 0.96, WebkitTextStroke: "6px #000", paintOrder: "stroke fill" as any }}>{title}</div> : null}
    </div>
  </AbsoluteFill>
);

// sharp text overlays (labels / headlines / callouts / diagram labels) for one segment.
// Rendered full-res and UNSCALED so words stay crisp - the words live here, never in the image.
const SIZE_PX: Record<string, number> = { s: 34, m: 52, l: 84 };
const Overlays: React.FC<{ overlays: TextOverlay[]; accent: string }> = ({ overlays, accent }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    {overlays.map((o, i) => {
      const isHead = o.role === "headline";
      const px = SIZE_PX[o.size || (isHead ? "l" : "m")];
      const callout = o.role === "callout" || o.role === "label";
      return (
        <div
          key={i}
          style={{
            position: "absolute",
            left: `${o.x ?? 50}%`,
            top: `${o.y ?? 50}%`,
            transform: "translate(-50%, -50%)",
            fontFamily: HEAVY,
            fontSize: px,
            letterSpacing: 1,
            lineHeight: 1.0,
            color: o.accent ? accent : "#fff",
            WebkitTextStroke: "5px #000",
            paintOrder: "stroke fill" as any,
            textAlign: "center",
            maxWidth: "46%",
            padding: callout ? "10px 22px" : 0,
            background: callout ? "rgba(11,31,58,0.86)" : "transparent",
            borderRadius: callout ? 14 : 0,
          }}
        >
          {o.text}
        </div>
      );
    })}
  </AbsoluteFill>
);

export const AVALesson: React.FC<AVALessonProps> = (props) => {
  const {
    segments, voSrc, voVolume = 1.0, musicSrc, musicVolume = 0.10, words, keywords,
    brand = {}, cta, intro, sfx = [], punchScale: punchMag = 1.05,
  } = { ...defaultAVALessonProps, ...props };
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const accent = brand.accent || "#FFD400";
  const accent2 = brand.accent2 || "#33E6A0";
  const kw = React.useMemo(() => new Set(keywords.map(norm)), [keywords]);
  const lines = React.useMemo(() => buildLines(words), [words]);
  const line = activeLine(lines, t);
  const totalSec = durationInFrames / fps;
  const ctaSec = cta?.seconds ?? 6;
  const ctaStart = totalSec - ctaSec;

  // cut points = exact cumulative segment starts (skip the opening at 0)
  const cuts = React.useMemo(() => {
    const out: number[] = []; let cum = 0;
    for (const s of segments) { if (cum > 0.05) out.push(cum); cum += s.durationInSeconds; }
    return out;
  }, [segments]);

  // cumulative start (seconds) of each segment, for time-gating its text overlays
  const segStart = React.useMemo(() => {
    const out: number[] = []; let cum = 0;
    for (const s of segments) { out.push(cum); cum += s.durationInSeconds; }
    return out;
  }, [segments]);

  // gentle zoom-punch keyed off the most recent segment boundary + slow drift
  const lastCut = [...cuts].reverse().find((c) => t >= c) ?? 0;
  const punch = spring({ frame: frame - lastCut * fps, fps, config: { damping: 11, mass: 0.7, stiffness: 130 } });
  const punchScale = lastCut <= 0.05 ? 1.0 : interpolate(punch, [0, 1], [punchMag, 1.0]);
  const drift = interpolate(t, [0, totalSec], [1.0, 1.03]);
  const videoScale = punchScale * drift;

  const introUntil = intro?.until ?? 0;
  const showIntro = !!(intro && intro.enabled && t < introUntil);
  const showCTA = !!cta && t >= ctaStart;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* BASE TRACK — segments laid end-to-end, the whole stack scaled by the zoom-punch */}
      <AbsoluteFill style={{ transform: `scale(${videoScale})` }}>
        <Series>
          {segments.map((seg, i) => {
            const durF = Math.max(1, Math.round(seg.durationInSeconds * fps));
            return (
              <Series.Sequence key={i} durationInFrames={durF}>
                {seg.kind === "video" ? (
                  <OffthreadVideo src={resolveSrc(seg.src) as string} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
                ) : seg.kind === "image" ? (
                  <Img src={resolveSrc(seg.src) as string} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <Card kicker={seg.card?.kicker} title={seg.card?.title} bg={seg.card?.bg} accent={accent} />
                )}
              </Series.Sequence>
            );
          })}
        </Series>
      </AbsoluteFill>

      {/* SHARP TEXT OVERLAYS — words live here, never baked into the AI image (no text drift) */}
      {segments.map((seg, i) =>
        seg.overlays && seg.overlays.length ? (
          <Sequence
            key={`ov-${i}`}
            from={Math.round(segStart[i] * fps)}
            durationInFrames={Math.max(1, Math.round(seg.durationInSeconds * fps))}
            name={`overlays-${i}`}
          >
            <Overlays overlays={seg.overlays} accent={accent} />
          </Sequence>
        ) : null
      )}

      {/* light cinematic vignette */}
      <AbsoluteFill style={{ boxShadow: "inset 0 0 260px rgba(0,0,0,0.42)", pointerEvents: "none" }} />

      {/* CONTINUOUS VO over the whole timeline (the lesson narration) */}
      {voSrc ? <Audio src={resolveSrc(voSrc) as string} volume={voVolume} /> : null}
      {/* music bed */}
      {musicSrc ? <Audio src={resolveSrc(musicSrc) as string} volume={musicVolume} loop /> : null}
      {/* sfx one-shots */}
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

      {/* VFX overlays — reused from the AVAPunch finisher */}
      {line && !showCTA ? <Captions line={line} t={t} kw={kw} accent={accent} /> : null}
      {showIntro ? <IntroStamp intro={intro!} t={t} until={introUntil} fps={fps} frame={frame} accent={accent} /> : null}
      {showCTA ? <CTACard text={cta!.text} t={t} start={ctaStart} fps={fps} accent={accent} accent2={accent2} /> : null}
    </AbsoluteFill>
  );
};
