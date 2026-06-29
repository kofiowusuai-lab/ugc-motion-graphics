import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";

export type GraphicKind = "kinetic" | "quote" | "stat" | "image";
export type GraphicPayload = {
  text?: string;        // kinetic phrase / quote line / image caption
  number?: string;      // stat big figure, e.g. "90%"
  label?: string;       // stat label / quote attribution
  keywords?: string[];  // words to accent in kinetic
  imageSrc?: string;    // b-roll image (public-relative name or URL)
};

const resolveSrc = (s?: string) => (!s ? undefined : /^(https?:|file:|data:)/.test(s) ? s : staticFile(s));

const FONT = "Inter, Arial, Helvetica, sans-serif";
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

const Bg: React.FC<{ accent: string; variant?: number }> = ({ accent, variant = 0 }) => {
  const bgs = [
    "radial-gradient(130% 130% at 50% 0%, #16263f 0%, #0a0f1a 60%, #05070d 100%)",
    "radial-gradient(130% 130% at 50% 100%, #1c1430 0%, #0c0a16 60%, #05070d 100%)",
    "linear-gradient(160deg, #0b1626 0%, #0a0f1a 100%)",
  ];
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 90], [0, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ background: bgs[variant % bgs.length] }}>
      {/* soft moving accent glow */}
      <div
        style={{
          position: "absolute",
          width: 900,
          height: 900,
          left: "50%",
          top: interpolate(drift, [0, 1], [-200, -120]),
          transform: "translateX(-50%)",
          borderRadius: "50%",
          background: accent,
          opacity: 0.12,
          filter: "blur(120px)",
        }}
      />
    </AbsoluteFill>
  );
};

const KineticPhrase: React.FC<{ payload: GraphicPayload; accent: string }> = ({ payload, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const kw = new Set((payload.keywords || []).map(norm));
  const words = (payload.text || "").split(/\s+/).filter(Boolean);
  return (
    <AbsoluteFill>
      <Bg accent={accent} variant={0} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 90 }}>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: "0.25em",
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 120,
            lineHeight: 1.04,
            textAlign: "center",
          }}
        >
          {words.map((w, i) => {
            const delay = i * 3;
            const s = spring({ frame: frame - delay, fps, config: { damping: 13, mass: 0.5 } });
            const y = interpolate(s, [0, 1], [60, 0]);
            const op = interpolate(s, [0, 1], [0, 1]);
            const isKw = kw.has(norm(w));
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  transform: `translateY(${y}px)`,
                  opacity: op,
                  color: isKw ? accent : "#fff",
                  textShadow: "0 6px 26px rgba(0,0,0,0.6)",
                  letterSpacing: "-0.02em",
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const QuoteCard: React.FC<{ payload: GraphicPayload; accent: string }> = ({ payload, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 16, mass: 0.7 } });
  const op = interpolate(s, [0, 1], [0, 1]);
  const sc = interpolate(s, [0, 1], [0.94, 1]);
  const lineW = interpolate(frame, [6, 24], [0, 220], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return (
    <AbsoluteFill>
      <Bg accent={accent} variant={1} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 110 }}>
        <div style={{ opacity: op, transform: `scale(${sc})`, textAlign: "center", maxWidth: "88%" }}>
          <div style={{ fontFamily: FONT, fontSize: 160, fontWeight: 900, color: accent, lineHeight: 0.6, marginBottom: 18 }}>
            “
          </div>
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 92,
              lineHeight: 1.12,
              color: "#fff",
              letterSpacing: "-0.015em",
            }}
          >
            {payload.text}
          </div>
          <div style={{ height: 8, width: lineW, background: accent, borderRadius: 8, margin: "40px auto 0" }} />
          {payload.label ? (
            <div style={{ fontFamily: FONT, fontWeight: 600, fontSize: 40, color: "#aeb8c6", marginTop: 26 }}>
              {payload.label}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const StatPunch: React.FC<{ payload: GraphicPayload; accent: string }> = ({ payload, accent }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = spring({ frame, fps, config: { damping: 11, mass: 0.5 } });
  const sc = interpolate(s, [0, 1], [0.6, 1]);
  const op = interpolate(s, [0, 1], [0, 1]);
  const labelS = spring({ frame: frame - 8, fps, config: { damping: 16 } });
  return (
    <AbsoluteFill>
      <Bg accent={accent} variant={2} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 80 }}>
        <div
          style={{
            fontFamily: FONT,
            fontWeight: 900,
            fontSize: 300,
            color: accent,
            transform: `scale(${sc})`,
            opacity: op,
            lineHeight: 1,
            textShadow: "0 10px 50px rgba(0,0,0,0.5)",
          }}
        >
          {payload.number}
        </div>
        {payload.label ? (
          <div
            style={{
              fontFamily: FONT,
              fontWeight: 800,
              fontSize: 64,
              color: "#fff",
              textAlign: "center",
              maxWidth: "82%",
              marginTop: 20,
              opacity: interpolate(labelS, [0, 1], [0, 1]),
              transform: `translateY(${interpolate(labelS, [0, 1], [30, 0])}px)`,
            }}
          >
            {payload.label}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// B-roll IMAGE insert: full-bleed image with a slow Ken Burns zoom + optional caption.
const ImageInsert: React.FC<{ payload: GraphicPayload; accent: string }> = ({ payload, accent }) => {
  const frame = useCurrentFrame();
  const src = resolveSrc(payload.imageSrc);
  const scale = interpolate(frame, [0, 90], [1.06, 1.16], { extrapolateRight: "extend" });
  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {src ? (
        <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }} />
      ) : (
        <Bg accent={accent} variant={2} />
      )}
      <AbsoluteFill style={{ background: "linear-gradient(to top, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0) 45%)" }} />
      {payload.text ? (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 300 }}>
          <div
            style={{
              fontFamily: FONT, fontWeight: 900, fontSize: 76, color: "#fff", textAlign: "center",
              maxWidth: "86%", textShadow: "0 4px 18px rgba(0,0,0,0.85)",
              borderBottom: `6px solid ${accent}`, paddingBottom: 12,
            }}
          >
            {payload.text}
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};

export const GraphicScene: React.FC<{ kind: GraphicKind; payload: GraphicPayload; accent: string }> = ({
  kind,
  payload,
  accent,
}) => {
  if (kind === "quote") return <QuoteCard payload={payload} accent={accent} />;
  if (kind === "stat") return <StatPunch payload={payload} accent={accent} />;
  if (kind === "image") return <ImageInsert payload={payload} accent={accent} />;
  return <KineticPhrase payload={payload} accent={accent} />;
};
