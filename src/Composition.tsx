import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Audio,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";

// Resolve a media reference: http(s)/file/data URLs pass through; anything else is
// treated as a name inside the project's public/ dir (staticFile).
const resolveSrc = (s?: string) => {
  if (!s) return undefined;
  return /^(https?:|file:|data:)/.test(s) ? s : staticFile(s);
};

export type Word = { text: string; start: number; end: number };
export type MotionProps = {
  videoSrc?: string;       // the stitched avatar video (full-bleed background)
  audioSrc?: string;       // optional separate audio (else video audio is used)
  words: Word[];           // whisper word timings -> kinetic captions
  keywords?: string[];     // words to emphasize (accent + pop)
  brand?: { title?: string; handle?: string; accent?: string };
  showCaptions?: boolean;
  width?: number;
  height?: number;
  durationInSeconds?: number;
};

export const defaultMotionProps: MotionProps = {
  words: [
    { text: "This", start: 0.0, end: 0.3 },
    { text: "is", start: 0.3, end: 0.5 },
    { text: "your", start: 0.5, end: 0.8 },
    { text: "motion", start: 0.8, end: 1.35 },
    { text: "graphics", start: 1.35, end: 2.0 },
    { text: "layer", start: 2.0, end: 2.45 },
    { text: "working", start: 2.55, end: 3.2 },
  ],
  keywords: ["motion", "graphics"],
  brand: { title: "UGC MOTION", handle: "@yourbrand", accent: "#7CF5C4" },
  showCaptions: true,
  width: 1080,
  height: 1920,
  durationInSeconds: 4,
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

// group words into caption chunks of ~3 for a readable sliding window
function chunkWords(words: Word[], size = 3): Word[][] {
  const out: Word[][] = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size));
  return out;
}

export const MotionVideo: React.FC<MotionProps> = ({
  videoSrc,
  audioSrc,
  words,
  keywords = [],
  brand = {},
  showCaptions = true,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const accent = brand.accent || "#7CF5C4";
  const kw = new Set(keywords.map(norm));

  // ---- background: avatar video, or gradient when none (test render) ----
  const bg = videoSrc ? (
    <OffthreadVideo src={resolveSrc(videoSrc) as string} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
  ) : (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(120% 120% at 50% 0%, #15233b 0%, #0a0f1a 55%, #05070d 100%)",
      }}
    />
  );

  // ---- kinetic captions: show the chunk containing the active word ----
  const chunks = chunkWords(words, 3);
  let activeChunk: Word[] | null = null;
  for (const c of chunks) {
    if (t >= c[0].start && t <= c[c.length - 1].end + 0.15) {
      activeChunk = c;
      break;
    }
  }
  if (!activeChunk) {
    // hold the nearest upcoming/closing chunk so captions don't flicker to empty
    for (const c of chunks) if (t < c[0].start) { activeChunk = c; break; }
    if (!activeChunk && chunks.length) activeChunk = chunks[chunks.length - 1];
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {bg}
      {audioSrc ? <Audio src={resolveSrc(audioSrc) as string} /> : null}

      {/* subtle vignette for caption legibility */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0) 38%)",
        }}
      />

      {/* brand lower-third / handle (slides up, persists) */}
      {(brand.title || brand.handle) && (
        <BrandBar title={brand.title} handle={brand.handle} accent={accent} frame={frame} fps={fps} />
      )}

      {/* kinetic captions */}
      {showCaptions && activeChunk && (
        <AbsoluteFill
          style={{
            justifyContent: "flex-end",
            alignItems: "center",
            paddingBottom: 360,
          }}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              gap: "0.28em",
              maxWidth: "86%",
              fontFamily: "Inter, Arial, Helvetica, sans-serif",
              fontWeight: 900,
              fontSize: 78,
              lineHeight: 1.05,
              textAlign: "center",
            }}
          >
            {activeChunk.map((w, i) => {
              const active = t >= w.start && t <= w.end;
              const isKw = kw.has(norm(w.text));
              const pop = active
                ? spring({ frame: frame - Math.round(w.start * fps), fps, config: { damping: 12, mass: 0.4 } })
                : 0;
              const scale = 1 + 0.16 * pop;
              const color = active ? (isKw ? accent : "#ffffff") : isKw ? accent : "#d6dde8";
              return (
                <span
                  key={i}
                  style={{
                    color,
                    transform: `scale(${scale})`,
                    display: "inline-block",
                    textShadow: "0 4px 18px rgba(0,0,0,0.85), 0 1px 0 rgba(0,0,0,0.9)",
                    WebkitTextStroke: active ? "2px rgba(0,0,0,0.35)" : "0",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {w.text}
                </span>
              );
            })}
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};

const BrandBar: React.FC<{
  title?: string;
  handle?: string;
  accent: string;
  frame: number;
  fps: number;
}> = ({ title, handle, accent, frame, fps }) => {
  const inAnim = spring({ frame, fps, config: { damping: 14, mass: 0.6 } });
  const y = interpolate(inAnim, [0, 1], [80, 0]);
  const op = interpolate(inAnim, [0, 1], [0, 1]);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-start", alignItems: "flex-start", padding: 56 }}>
      <div
        style={{
          transform: `translateY(${y}px)`,
          opacity: op,
          display: "flex",
          alignItems: "center",
          gap: 16,
          background: "rgba(8,12,20,0.66)",
          border: `2px solid ${accent}`,
          borderRadius: 999,
          padding: "16px 28px",
          backdropFilter: "blur(6px)",
        }}
      >
        <div style={{ width: 18, height: 18, borderRadius: 999, background: accent }} />
        <span
          style={{
            fontFamily: "Inter, Arial, sans-serif",
            fontWeight: 800,
            fontSize: 34,
            color: "#fff",
            letterSpacing: "0.02em",
          }}
        >
          {title}
        </span>
        {handle && (
          <span style={{ fontFamily: "Inter, Arial, sans-serif", fontWeight: 600, fontSize: 28, color: accent }}>
            {handle}
          </span>
        )}
      </div>
    </AbsoluteFill>
  );
};
