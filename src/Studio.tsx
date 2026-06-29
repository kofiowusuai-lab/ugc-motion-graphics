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
} from "remotion";
import { GraphicScene, GraphicKind, GraphicPayload } from "./GraphicScenes";
import type { Word } from "./Composition";

// ---------------------------------------------------------------------------
// StudioVideo — studio-grade motion graphics for talking-head UGC.
//
// The signature effect is TEXT BEHIND THE AVATAR, built by layering:
//   [0] base  = full avatar OffthreadVideo (opaque)
//   [1] text  = animated headline / kinetic copy layer
//   [2] top   = the PERSON MATTE video (transparent background, ProRes 4444)
//               -> the avatar's body is re-drawn on top, occluding the text,
//                  so the text reads as if it sits BEHIND the person.
//
// Plus scroll-up reveals (text rises from below a clip mask with spring easing),
// staggered word pops, parallax depth, and frame-accurate captions locked to the
// whisper word start/end timings.
// ---------------------------------------------------------------------------

const FONT = "Inter, Arial, Helvetica, sans-serif";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const resolveSrc = (s?: string) =>
  !s ? undefined : /^(https?:|file:|data:)/.test(s) ? s : staticFile(s);

export type StudioSegment = {
  kind: GraphicKind;
  start: number;
  end: number;
  payload: GraphicPayload;
  transition?: "punch" | "dissolve" | "slide";
};
export type SfxEvent = { src: string; at: number; volume?: number };

export type StudioProps = {
  videoSrc?: string; // full avatar video (public-relative or URL)
  matteSrc?: string; // person-only matte (ProRes 4444 mov w/ alpha), public-relative
  audioSrc?: string;
  words: Word[];
  segments?: StudioSegment[];
  sfx?: SfxEvent[];
  keywords?: string[];
  brand?: { title?: string; handle?: string; accent?: string };
  headlines?: string[]; // big behind-the-avatar headlines, cycled across the clip
  showCaptions?: boolean;
  width?: number;
  height?: number;
  durationInSeconds?: number;
};

// --------------------------- caption grouping -------------------------------
// ROOT-CAUSE FIX for caption drift:
// The old code split words into FIXED chunks of 3, then showed a chunk while
// `t` was inside [chunk.first.start, chunk.last.end + 0.15]. Chunk boundaries
// never aligned to speech pauses, so:
//   - a chunk could span a long silence (caption hangs / leads the voice), and
//   - between chunks no chunk matched (flicker), forcing a "hold nearest" hack
//     that showed the WRONG line — i.e. visible drift vs. the spoken word.
// Fix: build lines from natural PAUSE GAPS (new line when the gap between a word
// and the next exceeds `gap`, or the line gets long), then select the active
// line as the one whose [firstStart - lead, lastEnd + tail] window contains `t`.
// The per-word highlight stays EXACTLY on whisper start/end, so the active word
// tracks the voice frame-accurately and never drifts.
type Line = { words: Word[]; start: number; end: number };

function buildLines(words: Word[], opts?: { gap?: number; maxWords?: number; maxChars?: number }): Line[] {
  const gap = opts?.gap ?? 0.45;
  const maxWords = opts?.maxWords ?? 4;
  const maxChars = opts?.maxChars ?? 22;
  const lines: Line[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (!cur.length) return;
    lines.push({ words: cur, start: cur[0].start, end: cur[cur.length - 1].end });
    cur = [];
  };
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    cur.push(w);
    const chars = cur.reduce((a, x) => a + x.text.length + 1, 0);
    const next = words[i + 1];
    const bigGap = next ? next.start - w.end > gap : true;
    if (cur.length >= maxWords || chars >= maxChars || bigGap) flush();
  }
  flush();
  return lines;
}

function activeLine(lines: Line[], t: number, lead = 0.12, tail = 0.18): Line | null {
  for (const l of lines) {
    if (t >= l.start - lead && t <= l.end + tail) return l;
  }
  return null;
}

// --------------------------- scroll-up reveal -------------------------------
// Text rises up from below a clip mask into place. The wrapper clips overflow;
// the child translates from +distance (below) to 0 with spring easing, fading in.
const ScrollUpReveal: React.FC<{
  delay?: number;
  distance?: number;
  damping?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, distance = 140, damping = 14, children, style }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame: frame - delay, fps, config: { damping, mass: 0.7, stiffness: 110 } });
  const y = interpolate(s, [0, 1], [distance, 0]);
  const op = interpolate(s, [0, 0.4, 1], [0, 0.6, 1], { extrapolateRight: "clamp" });
  return (
    <div style={{ overflow: "hidden", display: "inline-block", ...style }}>
      <div style={{ transform: `translateY(${y}px)`, opacity: op }}>{children}</div>
    </div>
  );
};

// Entry/exit wrapper for full-screen graphic cutaways (reused from b-roll concept).
const TransitionWrap: React.FC<{
  durationInFrames: number;
  kind?: "punch" | "dissolve" | "slide";
  children: React.ReactNode;
}> = ({ durationInFrames, kind = "punch", children }) => {
  const frame = useCurrentFrame();
  const IN = 7, OUT = 7;
  const tin = interpolate(frame, [0, IN], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const tout = interpolate(frame, [durationInFrames - OUT, durationInFrames], [1, 0], {
    extrapolateLeft: "clamp", extrapolateRight: "clamp",
  });
  const vis = Math.min(tin, tout);
  let scale = 1, y = 0;
  if (kind === "punch") scale = interpolate(vis, [0, 1], [1.12, 1]);
  if (kind === "slide") y = interpolate(vis, [0, 1], [70, 0]);
  return (
    <AbsoluteFill style={{ opacity: vis, transform: `scale(${scale}) translateY(${y}px)` }}>
      {children}
    </AbsoluteFill>
  );
};

export const defaultStudioProps: StudioProps = {
  words: [
    { text: "This", start: 0.0, end: 0.3 },
    { text: "text", start: 0.3, end: 0.7 },
    { text: "sits", start: 0.7, end: 1.0 },
    { text: "behind", start: 1.0, end: 1.5 },
    { text: "me", start: 1.5, end: 1.8 },
    { text: "like", start: 2.0, end: 2.3 },
    { text: "a", start: 2.3, end: 2.4 },
    { text: "studio", start: 2.4, end: 3.0 },
    { text: "edit", start: 3.0, end: 3.5 },
  ],
  keywords: ["behind", "studio"],
  headlines: ["BEHIND THE", "AVATAR", "STUDIO GRADE"],
  brand: { title: "STUDIO", handle: "@yourbrand", accent: "#7CF5C4" },
  showCaptions: true,
  width: 1080,
  height: 1920,
  durationInSeconds: 4,
};

export const StudioVideo: React.FC<StudioProps> = ({
  videoSrc,
  matteSrc,
  audioSrc,
  words,
  segments = [],
  sfx = [],
  keywords = [],
  brand = {},
  headlines = [],
  showCaptions = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const accent = brand.accent || "#7CF5C4";
  const kw = new Set(keywords.map(norm));

  const lines = React.useMemo(() => buildLines(words), [words]);
  const inSegment = segments.some((s) => t >= s.start && t < s.end);

  // headline schedule: divide the timeline among the supplied headlines, each
  // scrolling up behind the avatar. If none supplied, derive from keywords.
  const heads = headlines.length ? headlines : Array.from(kw).map((k) => k.toUpperCase());
  const totalSec = durationInFrames / fps;
  const slot = heads.length ? totalSec / heads.length : totalSec;

  const base = videoSrc ? (
    <OffthreadVideo src={resolveSrc(videoSrc) as string} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  ) : (
    <AbsoluteFill style={{ background: "radial-gradient(120% 120% at 50% 0%, #15233b, #05070d)" }} />
  );

  // parallax drift for the behind-text layer (subtle depth)
  const drift = Math.sin((frame / fps) * 0.5) * 10;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* [0] BASE: full avatar video (opaque) — carries audio + lip-sync */}
      {base}
      {audioSrc ? <Audio src={resolveSrc(audioSrc) as string} /> : null}

      {/* [1] TEXT LAYER (behind the avatar): big scroll-up headlines + depth.
          Drawn over the base video, but UNDER the matte layer below, so the
          avatar will occlude it. Hidden while a full-screen graphic is up. */}
      {!inSegment && heads.length > 0 && (
        <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
          {heads.map((h, i) => {
            const segStart = i * slot;
            const segEnd = (i + 1) * slot;
            if (t < segStart - 0.3 || t > segEnd + 0.3) return null;
            const fromFrame = Math.round(segStart * fps);
            const localOut = interpolate(
              t,
              [segEnd - 0.4, segEnd],
              [1, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
            );
            return (
              <Sequence key={i} from={fromFrame} name={`headline-${i}`} layout="none">
                <AbsoluteFill
                  style={{
                    justifyContent: "center",
                    alignItems: "center",
                    transform: `translateY(${drift}px)`,
                    opacity: localOut,
                  }}
                >
                  <BehindHeadline text={h} accent={accent} />
                </AbsoluteFill>
              </Sequence>
            );
          })}
        </AbsoluteFill>
      )}

      {/* [2] MATTE LAYER (top): person-only video w/ transparent background.
          Re-drawn on top so the avatar OCCLUDES the headline text behind it. */}
      {matteSrc && !inSegment && (
        <OffthreadVideo
          src={resolveSrc(matteSrc) as string}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
          transparent
        />
      )}

      {/* vignette for caption legibility (avatar spans only) */}
      {!inSegment && (
        <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 40%)" }} />
      )}

      {/* brand bar */}
      {!inSegment && (brand.title || brand.handle) && (
        <BrandBar title={brand.title} handle={brand.handle} accent={accent} frame={frame} fps={fps} />
      )}

      {/* [3] CAPTIONS — frame-accurate to whisper word start/end. Sits in FRONT
          of the avatar (it is a lower-third readout, not the behind effect). */}
      {showCaptions && !inSegment && (() => {
        const line = activeLine(lines, t);
        if (!line) return null;
        return (
          <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 320 }}>
            <ScrollUpReveal delay={Math.round(line.start * fps)} distance={70} damping={16}>
              <div
                style={{
                  display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.26em",
                  maxWidth: "86%", fontFamily: FONT, fontWeight: 900, fontSize: 74,
                  lineHeight: 1.05, textAlign: "center",
                }}
              >
                {line.words.map((w, i) => {
                  const active = t >= w.start && t <= w.end;
                  const spoken = t > w.end;
                  const isKw = kw.has(norm(w.text));
                  const pop = active
                    ? spring({ frame: frame - Math.round(w.start * fps), fps, config: { damping: 12, mass: 0.4 } })
                    : 0;
                  const color = active ? (isKw ? accent : "#fff") : isKw ? accent : spoken ? "#fff" : "#9aa6b5";
                  return (
                    <span
                      key={i}
                      style={{
                        color,
                        transform: `scale(${1 + 0.18 * pop})`,
                        display: "inline-block",
                        textShadow: "0 4px 18px rgba(0,0,0,0.85)",
                        WebkitTextStroke: active ? "2px rgba(0,0,0,0.35)" : "0",
                      }}
                    >
                      {w.text}
                    </span>
                  );
                })}
              </div>
            </ScrollUpReveal>
          </AbsoluteFill>
        );
      })()}

      {/* full-screen graphic cutaways (reuse b-roll concept) */}
      {segments.map((s, i) => {
        const from = Math.round(s.start * fps);
        const dur = Math.max(1, Math.round((s.end - s.start) * fps));
        return (
          <Sequence key={`seg-${i}`} from={from} durationInFrames={dur} name={`studio-seg-${i}`}>
            <TransitionWrap durationInFrames={dur} kind={s.transition || "punch"}>
              <GraphicScene kind={s.kind} payload={{ ...s.payload, keywords: s.payload.keywords || keywords }} accent={accent} />
            </TransitionWrap>
          </Sequence>
        );
      })}

      {/* sfx */}
      {sfx.map((e, i) => (
        <Sequence key={`sfx-${i}`} from={Math.max(0, Math.round(e.at * fps))} name={`sfx-${i}`}>
          <Audio src={resolveSrc(e.src) as string} volume={e.volume ?? 0.7} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

// Big behind-the-avatar headline: stacked words, each scroll-up revealing with a
// stagger, scale pop, and a soft accent stroke so it reads as a studio super.
const BehindHeadline: React.FC<{ text: string; accent: string }> = ({ text, accent }) => {
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      {words.map((w, i) => (
        <ScrollUpReveal key={i} delay={i * 5} distance={180} damping={13}>
          <span
            style={{
              fontFamily: FONT,
              fontWeight: 900,
              fontSize: 200,
              lineHeight: 0.92,
              letterSpacing: "-0.03em",
              color: "#fff",
              WebkitTextStroke: `3px ${accent}`,
              textShadow: `0 0 60px ${accent}55, 0 10px 40px rgba(0,0,0,0.6)`,
              textTransform: "uppercase",
              display: "inline-block",
            }}
          >
            {w}
          </span>
        </ScrollUpReveal>
      ))}
    </div>
  );
};

const BrandBar: React.FC<{ title?: string; handle?: string; accent: string; frame: number; fps: number }> = ({
  title, handle, accent, frame, fps,
}) => {
  const inAnim = spring({ frame, fps, config: { damping: 14, mass: 0.6 } });
  const y = interpolate(inAnim, [0, 1], [80, 0]);
  const op = interpolate(inAnim, [0, 1], [0, 1]);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-start", padding: 56 }}>
      <div style={{
        transform: `translateY(${y}px)`, opacity: op, display: "flex", alignItems: "center", gap: 16,
        background: "rgba(8,12,20,0.66)", border: `2px solid ${accent}`, borderRadius: 999, padding: "16px 28px",
        backdropFilter: "blur(6px)",
      }}>
        <div style={{ width: 18, height: 18, borderRadius: 999, background: accent }} />
        <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 34, color: "#fff" }}>{title}</span>
        {handle && <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 28, color: accent }}>{handle}</span>}
      </div>
    </AbsoluteFill>
  );
};
