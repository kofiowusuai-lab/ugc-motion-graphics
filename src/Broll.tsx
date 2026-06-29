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

const FONT = "Inter, Arial, Helvetica, sans-serif";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const resolveSrc = (s?: string) => (!s ? undefined : /^(https?:|file:|data:)/.test(s) ? s : staticFile(s));

export type BrollSegment = {
  kind: GraphicKind;
  start: number;
  end: number;
  payload: GraphicPayload;
  transition?: "punch" | "dissolve" | "slide";
};
export type SfxEvent = { src: string; at: number; volume?: number };
export type BrollProps = {
  videoSrc?: string;
  audioSrc?: string;
  words: Word[];
  segments: BrollSegment[];
  sfx?: SfxEvent[];
  keywords?: string[];
  brand?: { title?: string; handle?: string; accent?: string };
  showCaptions?: boolean;
  width?: number;
  height?: number;
  durationInSeconds?: number;
};

// Entry/exit animation for a cutaway: punch (scale+fade), dissolve (fade), slide (y+fade).
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

export const defaultBrollProps: BrollProps = {
  words: [
    { text: "Slow", start: 0.0, end: 0.4 },
    { text: "down", start: 0.4, end: 0.8 },
    { text: "a", start: 0.8, end: 0.95 },
    { text: "second", start: 0.95, end: 1.5 },
    { text: "you're", start: 1.7, end: 2.1 },
    { text: "not", start: 2.1, end: 2.4 },
    { text: "behind", start: 2.4, end: 3.0 },
  ],
  segments: [
    { kind: "kinetic", start: 1.6, end: 3.2, payload: { text: "you're not behind", keywords: ["behind"] } },
  ],
  keywords: ["behind"],
  brand: { title: "MINDSET", handle: "@daily", accent: "#7CF5C4" },
  showCaptions: true,
  width: 1080,
  height: 1920,
  durationInSeconds: 3.4,
};

function chunkWords(words: Word[], size = 3): Word[][] {
  const out: Word[][] = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size));
  return out;
}

export const BrollVideo: React.FC<BrollProps> = ({
  videoSrc,
  audioSrc,
  words,
  segments = [],
  sfx = [],
  keywords = [],
  brand = {},
  showCaptions = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const accent = brand.accent || "#7CF5C4";
  const kw = new Set(keywords.map(norm));
  const inSegment = segments.some((s) => t >= s.start && t < s.end);

  // captions (only during avatar spans, not under a full-screen graphic)
  const chunks = chunkWords(words, 3);
  let activeChunk: Word[] | null = null;
  for (const c of chunks) if (t >= c[0].start && t <= c[c.length - 1].end + 0.15) { activeChunk = c; break; }

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* base avatar video — runs continuously underneath; carries the audio + lip-sync */}
      {videoSrc ? (
        <OffthreadVideo src={resolveSrc(videoSrc) as string} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      ) : (
        <AbsoluteFill style={{ background: "radial-gradient(120% 120% at 50% 0%, #15233b, #05070d)" }} />
      )}
      {audioSrc ? <Audio src={resolveSrc(audioSrc) as string} /> : null}

      {/* vignette for caption legibility (avatar spans only) */}
      {!inSegment && (
        <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 38%)" }} />
      )}

      {/* brand bar — avatar spans only (graphics are already branded) */}
      {!inSegment && (brand.title || brand.handle) && (
        <BrandBar title={brand.title} handle={brand.handle} accent={accent} frame={frame} fps={fps} />
      )}

      {/* kinetic captions — avatar spans only */}
      {showCaptions && !inSegment && activeChunk && (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 360 }}>
          <div
            style={{
              display: "flex", flexWrap: "wrap", justifyContent: "center", gap: "0.28em",
              maxWidth: "86%", fontFamily: FONT, fontWeight: 900, fontSize: 78, lineHeight: 1.05, textAlign: "center",
            }}
          >
            {activeChunk.map((w, i) => {
              const active = t >= w.start && t <= w.end;
              const isKw = kw.has(norm(w.text));
              const pop = active ? spring({ frame: frame - Math.round(w.start * fps), fps, config: { damping: 12, mass: 0.4 } }) : 0;
              const color = active ? (isKw ? accent : "#fff") : isKw ? accent : "#d6dde8";
              return (
                <span key={i} style={{
                  color, transform: `scale(${1 + 0.16 * pop})`, display: "inline-block",
                  textShadow: "0 4px 18px rgba(0,0,0,0.85)", WebkitTextStroke: active ? "2px rgba(0,0,0,0.35)" : "0",
                }}>{w.text}</span>
              );
            })}
          </div>
        </AbsoluteFill>
      )}

      {/* graphic b-roll cutaways — full-screen, cover the avatar on key lines, with transitions */}
      {segments.map((s, i) => {
        const from = Math.round(s.start * fps);
        const dur = Math.max(1, Math.round((s.end - s.start) * fps));
        return (
          <Sequence key={i} from={from} durationInFrames={dur} name={`broll-${s.kind}-${i}`}>
            <TransitionWrap durationInFrames={dur} kind={s.transition || "punch"}>
              <GraphicScene kind={s.kind} payload={{ ...s.payload, keywords: s.payload.keywords || keywords }} accent={accent} />
            </TransitionWrap>
          </Sequence>
        );
      })}

      {/* sound effects (risers/whooshes/impacts/drops) timed to frames */}
      {sfx.map((e, i) => (
        <Sequence key={`sfx-${i}`} from={Math.max(0, Math.round(e.at * fps))} name={`sfx-${i}`}>
          <Audio src={resolveSrc(e.src) as string} volume={e.volume ?? 0.7} />
        </Sequence>
      ))}
    </AbsoluteFill>
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
      }}>
        <div style={{ width: 18, height: 18, borderRadius: 999, background: accent }} />
        <span style={{ fontFamily: FONT, fontWeight: 800, fontSize: 34, color: "#fff" }}>{title}</span>
        {handle && <span style={{ fontFamily: FONT, fontWeight: 600, fontSize: 28, color: accent }}>{handle}</span>}
      </div>
    </AbsoluteFill>
  );
};
