// The Remotion composition: photos underneath, JIZURA kinetic type on top, clickable hotspots above both.
// Everything is a pure function of the current frame, so it plays in <Player> and can be rendered later.
import React, { useEffect, useMemo, useRef } from "react";
import { AbsoluteFill, Audio, Easing, Img, Sequence, interpolate, random, useCurrentFrame, useVideoConfig } from "remotion";
import { photoSrc, type Photo } from "../lib/images";
import type { JPlan, JRenderer, Look } from "../lib/jizura";
import type { Beat, Storyboard } from "../lib/storyboard";

export type RecapProps = {
  story: Storyboard;
  photos: Record<string, Photo>;
  plan: JPlan;
  renderer: JRenderer;
  look: Look;
  /** canvas resolution of the type layer relative to the composition (0.5 = half) */
  typeScale: number;
  audioSrc?: string;
  openWorldLabel: string;
  onPhoto?: (photoId: string) => void;
  onWorld?: (world: { id?: string; name: string }) => void;
};

const f = (seconds: number, fps: number) => Math.round(seconds * fps);

/** Which photo is on screen at a given frame — shared by the layer and the hotspot. */
export function photoAt(story: Storyboard, photos: Record<string, Photo>, frame: number, fps: number): { beat: Beat; photoId?: string } | null {
  const t = frame / fps;
  let beat: Beat | undefined;
  for (const b of story.beats) { if (b.start <= t) beat = b; else break; }
  if (!beat) return null;
  const ids = beat.photos.filter((id) => photos[id]);
  if (!ids.length) return { beat };
  const i = Math.min(ids.length - 1, Math.max(0, Math.floor(((t - beat.start) / beat.dur) * ids.length)));
  return { beat, photoId: ids[i] };
}

const KenBurns: React.FC<{ photo: Photo; frames: number }> = ({ photo, frames }) => {
  const frame = useCurrentFrame();
  const { width } = useVideoConfig();
  const r = (k: string) => random(`${photo.id}-${k}`);
  const zoomIn = r("dir") > 0.5;
  const p = interpolate(frame, [0, Math.max(1, frames)], [0, 1], { extrapolateRight: "clamp", easing: Easing.out(Easing.quad) });
  const scale = zoomIn ? 1.06 + 0.1 * p : 1.16 - 0.1 * p;
  const dx = (r("x") - 0.5) * 3 * p, dy = (r("y") - 0.5) * 2 * p;
  const opacity = interpolate(frame, [0, 3], [0.55, 1], { extrapolateRight: "clamp" });
  return (
    <AbsoluteFill style={{ overflow: "hidden", opacity }}>
      <Img src={photoSrc(photo, width)} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `translate(${dx}%, ${dy}%) scale(${scale})` }} />
    </AbsoluteFill>
  );
};

const PhotoLayer: React.FC<{ story: Storyboard; photos: Record<string, Photo> }> = ({ story, photos }) => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill>
      {story.beats.map((beat, bi) => {
        const ids = beat.photos.filter((id) => photos[id]);
        if (!ids.length) return null;
        const from = f(beat.start, fps);
        const next = story.beats[bi + 1];
        const total = (next ? f(next.start, fps) : f(beat.start + beat.dur, fps) + fps * 2) - from;   // the last beat holds through the tail
        const slot = total / ids.length;
        return ids.map((id, i) => {
          const a = Math.round(i * slot), b = i === ids.length - 1 ? total : Math.round((i + 1) * slot);
          return (
            <Sequence key={`${beat.id}-${id}`} from={from + a} durationInFrames={b - a} premountFor={fps}>
              <KenBurns photo={photos[id]} frames={b - a} />
            </Sequence>
          );
        });
      })}
    </AbsoluteFill>
  );
};

const TypeLayer: React.FC<{ plan: JPlan; renderer: JRenderer; look: Look; typeScale: number }> = ({ plan, renderer, look, typeScale }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.round(plan.W * typeScale), h = Math.round(plan.H * typeScale);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    try { renderer.frame(ctx, plan, frame / fps, { scale: typeScale, transparent: look === "overlay" }); } catch { /* one bad frame must not stop playback */ }
  }, [frame, fps, plan, renderer, look, typeScale, w, h]);
  return <canvas ref={ref} width={w} height={h} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", mixBlendMode: look === "invert" ? "difference" : "normal" }} />;
};

const Caption: React.FC<{ story: Storyboard; photos: Record<string, Photo> }> = ({ story, photos }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const now = photoAt(story, photos, frame, fps);
  const info = now?.photoId ? story.info[now.photoId] : undefined;
  if (!info) return null;
  const d = new Date(info.ts);
  const stamp = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}  ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const u = width / 100;
  return (
    <div style={{ position: "absolute", left: 2.4 * u, top: 2.2 * u, color: "rgba(255,255,255,.82)", font: `500 ${1.25 * u}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`, letterSpacing: "0.08em", textShadow: "0 1px 6px rgba(0,0,0,.6)", pointerEvents: "none", lineHeight: 1.5 }}>
      <div>{stamp}</div>
      {info.world ? <div style={{ opacity: 0.75 }}>{info.world}</div> : null}
    </div>
  );
};

const Hotspots: React.FC<Pick<RecapProps, "story" | "photos" | "onPhoto" | "onWorld" | "openWorldLabel">> = ({ story, photos, onPhoto, onWorld, openWorldLabel }) => {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const now = photoAt(story, photos, frame, fps);
  if (!now) return null;
  const { beat, photoId } = now;
  const u = width / 100;
  const local = frame - f(beat.start, fps);
  const slide = interpolate(local, [4, 14], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
  return (
    <AbsoluteFill>
      {photoId && onPhoto ? <button type="button" aria-label="photo" onClick={() => onPhoto(photoId)} style={{ position: "absolute", inset: 0, background: "none", border: 0, padding: 0, cursor: "zoom-in" }} /> : null}
      {beat.world && onWorld ? (
        <button type="button" onClick={(e) => { e.stopPropagation(); onWorld(beat.world!); }}
          style={{ position: "absolute", right: 2.4 * u, bottom: 2.4 * u, transform: `translateY(${(1 - slide) * 2 * u}px)`, opacity: slide, display: "flex", alignItems: "center", gap: 0.8 * u,
            padding: `${0.7 * u}px ${1.3 * u}px`, borderRadius: 99 * u, border: "1px solid rgba(255,255,255,.55)", background: "rgba(0,0,0,.45)", color: "#fff", backdropFilter: "blur(8px)",
            font: `600 ${1.3 * u}px system-ui, "Noto Sans KR", "Noto Sans JP", sans-serif`, cursor: "pointer", maxWidth: "60%" }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{beat.world.name}</span>
          <span style={{ opacity: 0.7, whiteSpace: "nowrap" }}>{openWorldLabel} ↗</span>
        </button>
      ) : null}
    </AbsoluteFill>
  );
};

export const RecapPV: React.FC<RecapProps> = ({ story, photos, plan, renderer, look, typeScale, audioSrc, openWorldLabel, onPhoto, onWorld }) => {
  const scrim = useMemo(() => (look === "overlay"
    ? "linear-gradient(rgba(0,0,0,.50), rgba(0,0,0,.34) 45%, rgba(0,0,0,.56))"
    : "rgba(0,0,0,.12)"), [look]);
  return (
    <AbsoluteFill style={{ background: "#050506" }}>
      <PhotoLayer story={story} photos={photos} />
      <AbsoluteFill style={{ background: scrim, pointerEvents: "none" }} />
      <Hotspots story={story} photos={photos} onPhoto={onPhoto} onWorld={onWorld} openWorldLabel={openWorldLabel} />
      <TypeLayer plan={plan} renderer={renderer} look={look} typeScale={typeScale} />
      <Caption story={story} photos={photos} />
      {audioSrc ? <Audio src={audioSrc} /> : null}
    </AbsoluteFill>
  );
};
