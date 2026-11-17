import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { RecapPV, type RecapProps } from "../video/RecapPV";
import { UI, type Lang } from "../lib/i18n";
import { photoSrc, type Photo } from "../lib/images";
import type { Aspect, JPlan, JRenderer, Look } from "../lib/jizura";
import { maskName, type Storyboard } from "../lib/storyboard";

export const FPS = 30;

export type Built = { story: Storyboard; photos: Record<string, Photo>; plan: JPlan; renderer: JRenderer };

type Props = {
  built: Built; lang: Lang; look: Look; aspect: Aspect; hideNames: boolean; hasPeople: boolean; busy: boolean; note?: string; viewer: boolean;
  onReroll: () => void; onLook: (l: Look) => void; onAspect: (a: Aspect) => void; onHideNames: (v: boolean) => void; onShare: () => void; onBack: () => void;
};

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export const PlayerShell: React.FC<Props> = (p) => {
  const T = UI[p.lang];
  const { story, photos, plan, renderer } = p.built;
  const ref = useRef<PlayerRef>(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [audio, setAudio] = useState<string | undefined>();
  const total = Math.max(1, Math.ceil(plan.duration * FPS));

  useEffect(() => {
    const pl = ref.current; if (!pl) return;
    const onFrame = (e: { detail: { frame: number } }) => setFrame(e.detail.frame);
    const onPlay = () => setPlaying(true), onPause = () => setPlaying(false);
    pl.addEventListener("frameupdate", onFrame); pl.addEventListener("play", onPlay); pl.addEventListener("pause", onPause);
    setPlaying(pl.isPlaying()); setFrame(pl.getCurrentFrame());   // autoplay may have started before these listeners existed
    return () => { pl.removeEventListener("frameupdate", onFrame); pl.removeEventListener("play", onPlay); pl.removeEventListener("pause", onPause); };
  }, []);
  useEffect(() => () => { if (audio) URL.revokeObjectURL(audio); }, [audio]);

  const onPhoto = useCallback((id: string) => { ref.current?.pause(); setOpen(id); }, []);
  const openWorld = useCallback((w: { id?: string; name: string }) => {
    ref.current?.pause();
    const url = w.id ? `https://vrchat.com/home/world/${encodeURIComponent(w.id)}` : `https://vrchat.com/home/search/${encodeURIComponent(w.name)}`;
    window.open(url, "_blank", "noopener");
  }, []);

  const inputProps: RecapProps = useMemo(() => ({ story, photos, plan, renderer, look: p.look, typeScale: 0.5, audioSrc: audio, openWorldLabel: T.openWorld, onPhoto, onWorld: openWorld }),
    [story, photos, plan, renderer, p.look, audio, T.openWorld, onPhoto, openWorld]);

  const seconds = frame / FPS;
  const current = [...story.chapters].reverse().find((c) => c.start <= seconds + 0.01)?.key;
  const info = open ? story.info[open] : undefined;
  const closeBox = () => { setOpen(null); ref.current?.play(); };

  return (
    <div className={`stage ${p.aspect === "9:16" ? "tall" : ""}`}>
      <div className="frame">
        <Player ref={ref} component={RecapPV} inputProps={inputProps} durationInFrames={total} fps={FPS} compositionWidth={plan.W} compositionHeight={plan.H}
          style={{ width: "100%" }} loop autoPlay controls={false} clickToPlay={false} doubleClickToFullscreen={false} spaceKeyToPlayOrPause />
        {p.busy ? <div className="veil"><span className="spin" /></div> : null}
        {open && photos[open] ? (
          <div className="lightbox" role="dialog" aria-modal="true" onClick={closeBox}>
            <img src={photoSrc(photos[open], 1600)} alt="" />
            <div className="meta" onClick={(e) => e.stopPropagation()}>
              <div>
                <strong>{info?.world ?? ""}</strong>
                <span>{info ? new Date(info.ts).toLocaleString(p.lang) : ""}</span>
                {info?.players.length ? <span className="who">{T.with}: {info.players.slice(0, 12).map((n) => (p.hideNames ? maskName(n) : n)).join(", ")}{info.players.length > 12 ? " …" : ""}</span> : null}
              </div>
              <div className="row">
                {info?.world ? <button type="button" onClick={() => openWorld({ id: info.worldId, name: info.world! })}>{T.openWorld} ↗</button> : null}
                <button type="button" className="primary" onClick={closeBox}>{T.close}</button>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="transport">
        <button type="button" className="primary play" onClick={() => ref.current?.toggle()}>{playing ? T.pause : T.play}</button>
        <div className="scrub">
          <input type="range" min={0} max={total - 1} value={frame} aria-label="seek" onChange={(e) => ref.current?.seekTo(+e.target.value)} />
          <div className="ticks">{story.chapters.map((c) => <i key={c.key} style={{ left: `${(c.start / plan.duration) * 100}%` }} />)}</div>
        </div>
        <span className="time">{clock(seconds)} / {clock(plan.duration)}</span>
      </div>

      <div className="chapters">
        {story.chapters.map((c) => (
          <button type="button" key={c.key} className={c.key === current ? "on" : ""} onClick={() => { ref.current?.seekTo(Math.round(c.start * FPS)); ref.current?.play(); }}>{c.label}</button>
        ))}
      </div>

      <div className="tools">
        {!p.viewer ? <button type="button" onClick={p.onReroll} disabled={p.busy}>{T.reroll}</button> : null}
        <div className="seg" role="group" aria-label={T.look}>
          <button type="button" className={p.look === "overlay" ? "on" : ""} onClick={() => p.onLook("overlay")} disabled={p.busy}>{T.lookOverlay}</button>
          <button type="button" className={p.look === "invert" ? "on" : ""} onClick={() => p.onLook("invert")} disabled={p.busy}>{T.lookInvert}</button>
        </div>
        <div className="seg" role="group" aria-label={T.aspect}>
          <button type="button" className={p.aspect === "16:9" ? "on" : ""} onClick={() => p.onAspect("16:9")} disabled={p.busy}>16:9</button>
          <button type="button" className={p.aspect === "9:16" ? "on" : ""} onClick={() => p.onAspect("9:16")} disabled={p.busy}>9:16</button>
        </div>
        {p.hasPeople && !p.viewer ? <label className="check"><input type="checkbox" checked={p.hideNames} onChange={(e) => p.onHideNames(e.target.checked)} disabled={p.busy} />{T.hideNames}</label> : null}
        <label className="file">{audio ? T.musicOn : T.music}
          <input type="file" accept="audio/*" onChange={(e) => { const file = e.target.files?.[0]; if (file) { setAudio(URL.createObjectURL(file)); ref.current?.seekTo(0); } }} />
        </label>
        <span className="grow" />
        {!p.viewer ? <button type="button" onClick={p.onShare} disabled={p.busy}>{T.share}</button> : null}
        <button type="button" onClick={p.onBack}>{T.back}</button>
      </div>
      {p.note ? <p className="note">{p.note}</p> : null}
    </div>
  );
};
