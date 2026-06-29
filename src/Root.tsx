import React from "react";
import { Composition } from "remotion";
import { MotionVideo, defaultMotionProps, MotionProps } from "./Composition";
import { BrollVideo, defaultBrollProps, BrollProps } from "./Broll";
import { StudioVideo, defaultStudioProps, StudioProps } from "./Studio";
import { MalikPunch, defaultMalikPunchProps, MalikPunchProps } from "./MalikPunch";
import { AVAPunch, defaultAVAPunchProps, AVAPunchProps } from "./AVAPunch";
import { AVALesson, defaultAVALessonProps, AVALessonProps } from "./AVALesson";

const FPS = 30;

const meta = (p: { durationInSeconds?: number; words?: { end: number }[]; width?: number; height?: number }) => {
  const fromWords = p.words && p.words.length ? Math.max(...p.words.map((w) => w.end)) + 0.6 : 0;
  const seconds = p.durationInSeconds || fromWords || 10;
  return { durationInFrames: Math.max(1, Math.ceil(seconds * FPS)), fps: FPS, width: p.width || 1080, height: p.height || 1920 };
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="MotionVideo"
        component={MotionVideo as React.FC<Record<string, unknown>>}
        durationInFrames={Math.ceil((defaultMotionProps.durationInSeconds || 10) * FPS)}
        fps={FPS}
        width={defaultMotionProps.width || 1080}
        height={defaultMotionProps.height || 1920}
        defaultProps={defaultMotionProps as unknown as Record<string, unknown>}
        calculateMetadata={({ props }) => meta(props as unknown as MotionProps)}
      />
      <Composition
        id="BrollVideo"
        component={BrollVideo as React.FC<Record<string, unknown>>}
        durationInFrames={Math.ceil((defaultBrollProps.durationInSeconds || 10) * FPS)}
        fps={FPS}
        width={defaultBrollProps.width || 1080}
        height={defaultBrollProps.height || 1920}
        defaultProps={defaultBrollProps as unknown as Record<string, unknown>}
        calculateMetadata={({ props }) => meta(props as unknown as BrollProps)}
      />
      <Composition
        id="StudioVideo"
        component={StudioVideo as React.FC<Record<string, unknown>>}
        durationInFrames={Math.ceil((defaultStudioProps.durationInSeconds || 10) * FPS)}
        fps={FPS}
        width={defaultStudioProps.width || 1080}
        height={defaultStudioProps.height || 1920}
        defaultProps={defaultStudioProps as unknown as Record<string, unknown>}
        calculateMetadata={({ props }) => meta(props as unknown as StudioProps)}
      />
      <Composition
        id="MalikPunch"
        component={MalikPunch as React.FC<Record<string, unknown>>}
        durationInFrames={Math.ceil((defaultMalikPunchProps.durationInSeconds || 10) * FPS)}
        fps={FPS}
        width={defaultMalikPunchProps.width || 1080}
        height={defaultMalikPunchProps.height || 1920}
        defaultProps={defaultMalikPunchProps as unknown as Record<string, unknown>}
        calculateMetadata={({ props }) => meta(props as unknown as MalikPunchProps)}
      />
      <Composition
        id="AVAPunch"
        component={AVAPunch as React.FC<Record<string, unknown>>}
        durationInFrames={Math.ceil((defaultAVAPunchProps.durationInSeconds || 10) * FPS)}
        fps={FPS}
        width={defaultAVAPunchProps.width || 1920}
        height={defaultAVAPunchProps.height || 1080}
        defaultProps={defaultAVAPunchProps as unknown as Record<string, unknown>}
        calculateMetadata={({ props }) => meta(props as unknown as AVAPunchProps)}
      />
      <Composition
        id="AVALesson"
        component={AVALesson as React.FC<Record<string, unknown>>}
        durationInFrames={Math.ceil((defaultAVALessonProps.durationInSeconds || 10) * FPS)}
        fps={FPS}
        width={defaultAVALessonProps.width || 1920}
        height={defaultAVALessonProps.height || 1080}
        defaultProps={defaultAVALessonProps as unknown as Record<string, unknown>}
        calculateMetadata={({ props }) => meta(props as unknown as AVALessonProps)}
      />
    </>
  );
};
