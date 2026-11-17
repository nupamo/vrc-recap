// Minimal stand-in for the parts of `remotion` this project uses. It exists only so the app can be
// bundled and exercised where the real package cannot be installed. The real project imports
// `remotion` and `@remotion/player`; nothing in src/ refers to this file.
import React, { createContext, useContext, useEffect, useRef } from "react";

export type TimelineCtx = { frame: number; fps: number; width: number; height: number; durationInFrames: number; playing: boolean };
export const Timeline = createContext<TimelineCtx>({ frame: 0, fps: 30, width: 1920, height: 1080, durationInFrames: 1, playing: false });

export const useCurrentFrame = () => useContext(Timeline).frame;
export const useVideoConfig = () => { const { fps, width, height, durationInFrames } = useContext(Timeline); return { fps, width, height, durationInFrames }; };

const fill: React.CSSProperties = { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, width: "100%", height: "100%", display: "flex", flexDirection: "column" };
export const AbsoluteFill: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({ style, ...rest }) => <div {...rest} style={{ ...fill, ...style }} />;

type SeqProps = { from?: number; durationInFrames?: number; layout?: "absolute-fill" | "none"; premountFor?: number; name?: string; style?: React.CSSProperties; children: React.ReactNode };
export const Sequence: React.FC<SeqProps> = ({ from = 0, durationInFrames = Infinity, layout = "absolute-fill", premountFor = 0, style, children }) => {
  const parent = useContext(Timeline);
  const rel = parent.frame - from;
  const premount = rel < 0 && rel >= -premountFor;
  if (!premount && (rel < 0 || rel >= durationInFrames)) return null;
  const value = { ...parent, frame: premount ? 0 : rel, durationInFrames: Number.isFinite(durationInFrames) ? durationInFrames : parent.durationInFrames - from };
  const body = <Timeline.Provider value={value}>{children}</Timeline.Provider>;
  if (layout === "none") return premount ? <div style={{ display: "contents", visibility: "hidden" }}>{body}</div> : body;
  return <AbsoluteFill style={{ ...style, ...(premount ? { opacity: 0, pointerEvents: "none" } : null) }}>{body}</AbsoluteFill>;
};

type Extrapolate = "extend" | "clamp" | "identity";
export function interpolate(input: number, inputRange: readonly number[], outputRange: readonly number[], options: { extrapolateLeft?: Extrapolate; extrapolateRight?: Extrapolate; easing?: (t: number) => number } = {}): number {
  const { extrapolateLeft = "extend", extrapolateRight = "extend", easing = (t: number) => t } = options;
  let i = 1;
  while (i < inputRange.length - 1 && input > inputRange[i]) i++;
  const a = inputRange[i - 1], b = inputRange[i], oa = outputRange[i - 1], ob = outputRange[i];
  let x = input;
  if (x < a) { if (extrapolateLeft === "identity") return x; if (extrapolateLeft === "clamp") x = a; }
  if (x > b) { if (extrapolateRight === "identity") return x; if (extrapolateRight === "clamp") x = b; }
  if (a === b) return oa;
  const t = (x - a) / (b - a);
  return oa + (ob - oa) * (t >= 0 && t <= 1 ? easing(t) : t);
}

const out = (f: (t: number) => number) => (t: number) => 1 - f(1 - t);
const inOut = (f: (t: number) => number) => (t: number) => (t < 0.5 ? f(t * 2) / 2 : 1 - f((1 - t) * 2) / 2);
export const Easing = { linear: (t: number) => t, quad: (t: number) => t * t, cubic: (t: number) => t * t * t, in: (f: (t: number) => number) => f, out, inOut };

export function random(seed: string | number | null): number {
  if (seed === null) return Math.random();
  const s = String(seed);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h += h << 13; h ^= h >>> 7; h += h << 3; h ^= h >>> 17; h += h << 5;
  return (h >>> 0) / 4294967296;
}

export const Img: React.FC<React.ImgHTMLAttributes<HTMLImageElement>> = (props) => <img alt="" {...props} />;

export const Audio: React.FC<{ src: string; volume?: number }> = ({ src, volume = 1 }) => {
  const { frame, fps, playing } = useContext(Timeline);
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => { const a = ref.current; if (!a) return; a.volume = volume; if (playing) a.play().catch(() => undefined); else a.pause(); }, [playing, volume]);
  useEffect(() => { const a = ref.current; if (a && Math.abs(a.currentTime - frame / fps) > 0.3) a.currentTime = frame / fps; }, [frame, fps]);
  return <audio ref={ref} src={src} preload="auto" />;
};
