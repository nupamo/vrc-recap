// Minimal stand-in for `@remotion/player` (see shim/remotion.tsx). Same props and ref methods as
// the subset the app uses: play, pause, toggle, seekTo, getCurrentFrame, isPlaying, add/removeEventListener.
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { Timeline } from "./remotion";

type Listener = (e: { detail: { frame: number } }) => void;
export type PlayerRef = {
  play: () => void; pause: () => void; toggle: () => void; seekTo: (frame: number) => void;
  getCurrentFrame: () => number; isPlaying: () => boolean;
  addEventListener: (name: string, fn: Listener) => void; removeEventListener: (name: string, fn: Listener) => void;
};
type Props<P> = {
  component: React.ComponentType<P>; inputProps: P; durationInFrames: number; fps: number; compositionWidth: number; compositionHeight: number;
  style?: React.CSSProperties; loop?: boolean; autoPlay?: boolean; controls?: boolean; clickToPlay?: boolean; doubleClickToFullscreen?: boolean; spaceKeyToPlayOrPause?: boolean;
};

function PlayerInner<P extends Record<string, unknown>>(props: Props<P>, ref: React.Ref<PlayerRef>) {
  const { component: Comp, inputProps, durationInFrames, fps, compositionWidth: W, compositionHeight: H, style, loop, autoPlay } = props;
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [scale, setScale] = useState(1);
  const box = useRef<HTMLDivElement>(null);
  const listeners = useRef(new Map<string, Set<Listener>>());
  const state = useRef({ frame: 0, playing: false });
  const emit = useCallback((name: string) => listeners.current.get(name)?.forEach((fn) => fn({ detail: { frame: state.current.frame } })), []);
  const go = useCallback((f: number) => { const c = Math.max(0, Math.min(durationInFrames - 1, Math.round(f))); state.current.frame = c; setFrame(c); emit("frameupdate"); }, [durationInFrames, emit]);
  const setPlay = useCallback((p: boolean) => { if (state.current.playing === p) return; state.current.playing = p; setPlaying(p); emit(p ? "play" : "pause"); }, [emit]);

  useImperativeHandle(ref, () => ({
    play: () => setPlay(true), pause: () => setPlay(false), toggle: () => setPlay(!state.current.playing), seekTo: go,
    getCurrentFrame: () => state.current.frame, isPlaying: () => state.current.playing,
    addEventListener: (n, fn) => { (listeners.current.get(n) ?? listeners.current.set(n, new Set()).get(n)!).add(fn); },
    removeEventListener: (n, fn) => { listeners.current.get(n)?.delete(fn); },
  }), [go, setPlay]);

  useEffect(() => { if (autoPlay) setPlay(true); }, [autoPlay, setPlay]);
  useEffect(() => { if (state.current.frame > durationInFrames - 1) go(0); }, [durationInFrames, go]);
  useEffect(() => {
    if (!playing) return;
    let raf = 0, t0 = performance.now(), f0 = state.current.frame, last = f0;
    const tick = (now: number) => {
      if (state.current.frame !== last) { t0 = now; f0 = state.current.frame; }   // a seek happened while playing
      let f = f0 + Math.floor(((now - t0) / 1000) * fps);
      if (f >= durationInFrames) { if (loop) f %= durationInFrames; else { go(durationInFrames - 1); setPlay(false); emit("ended"); return; } }
      if (f !== state.current.frame) go(f);
      last = state.current.frame;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, fps, durationInFrames, loop, go, setPlay, emit]);

  useLayoutEffect(() => {
    const el = box.current; if (!el) return;
    const fit = () => setScale(el.clientWidth / W);
    fit(); const ro = new ResizeObserver(fit); ro.observe(el); return () => ro.disconnect();
  }, [W]);

  return (
    <div ref={box} style={{ position: "relative", overflow: "hidden", aspectRatio: `${W} / ${H}`, ...style }}>
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, transform: `scale(${scale})`, transformOrigin: "0 0" }}>
        <Timeline.Provider value={{ frame, fps, width: W, height: H, durationInFrames, playing }}>
          <Comp {...inputProps} />
        </Timeline.Provider>
      </div>
    </div>
  );
}
export const Player = forwardRef(PlayerInner) as <P extends Record<string, unknown>>(p: Props<P> & { ref?: React.Ref<PlayerRef> }) => React.ReactElement;
