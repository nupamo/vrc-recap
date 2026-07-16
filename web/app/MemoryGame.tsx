"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";
import { exportJourney, formatDate, type MemoryJourney, type MemoryMoment } from "./lib/memory";

type MemoryGameProps = {
  journey: MemoryJourney;
  avatarSpriteUrl: string | null;
  isDemo?: boolean;
};

type WalkTheme = {
  title: string;
  subtitle: string;
  accent: string;
};

const WALK_THEMES: WalkTheme[] = [
  { title: "FIRST LOGIN", subtitle: "처음 문을 열었던 밤", accent: "#8bc8d5" },
  { title: "MIDNIGHT PLAZA", subtitle: "약속 없이도 모이던 광장", accent: "#d28cc5" },
  { title: "PORTAL GARDEN", subtitle: "새 월드를 찾아 헤매던 계절", accent: "#80d5ae" },
  { title: "MEMORY LINE", subtitle: "몇 번이고 돌아온 시간", accent: "#e3ad72" },
  { title: "STAR ARCHIVE", subtitle: "이름을 별처럼 기억한 곳", accent: "#b2a2ed" },
  { title: "FESTIVAL CLOUD", subtitle: "웃음과 음악이 떠 있던 밤", accent: "#f2a9c2" },
  { title: "RAINY ROOFTOP", subtitle: "말없이 빗소리를 듣던 옥상", accent: "#74b9d2" },
  { title: "SNOW GLOBE", subtitle: "하얀 월드에 남은 발자국", accent: "#d5e9f4" },
  { title: "SUNRISE LOBBY", subtitle: "아침이 와도 끝나지 않은 이야기", accent: "#f4c17e" },
];

function themeForMoment(index: number, total: number): WalkTheme & { atlasIndex: number } {
  const atlasIndex = Math.min(8, Math.floor((index / Math.max(1, total)) * 9));
  return { ...WALK_THEMES[atlasIndex], atlasIndex };
}

function drawAtlasScene(
  context: CanvasRenderingContext2D,
  atlas: HTMLImageElement | null,
  atlasIndex: number,
  width: number,
  height: number,
  localProgress: number,
) {
  if (!atlas?.complete || !atlas.naturalWidth) {
    context.fillStyle = "#17162f";
    context.fillRect(0, 0, width, height);
    return;
  }
  const cellWidth = atlas.naturalWidth / 3;
  const cellHeight = atlas.naturalHeight / 3;
  const sourceX = (atlasIndex % 3) * cellWidth;
  const sourceY = Math.floor(atlasIndex / 3) * cellHeight;
  const overscan = width * 0.08;
  context.save();
  context.imageSmoothingEnabled = false;
  context.drawImage(
    atlas,
    sourceX,
    sourceY,
    cellWidth,
    cellHeight,
    -overscan * localProgress,
    0,
    width + overscan,
    height,
  );
  context.restore();
}

function drawMemoryComposite(
  context: CanvasRenderingContext2D,
  moment: MemoryMoment,
  width: number,
  height: number,
  alpha: number,
) {
  if (moment.memoryPixels.length < 432) return;
  const cellWidth = width / 16;
  const cellHeight = height / 9;
  context.save();
  context.globalAlpha = alpha;
  context.globalCompositeOperation = "soft-light";
  for (let y = 0; y < 9; y += 1) {
    for (let x = 0; x < 16; x += 1) {
      const offset = (y * 16 + x) * 3;
      const red = (moment.memoryPixels[offset] ?? 6) * 17;
      const green = (moment.memoryPixels[offset + 1] ?? 6) * 17;
      const blue = (moment.memoryPixels[offset + 2] ?? 6) * 17;
      context.fillStyle = `rgb(${red} ${green} ${blue})`;
      context.fillRect(
        Math.floor(x * cellWidth),
        Math.floor(y * cellHeight),
        Math.ceil(cellWidth + 1),
        Math.ceil(cellHeight + 1),
      );
    }
  }
  context.restore();
}

function drawPixelPostcard(
  context: CanvasRenderingContext2D,
  moment: MemoryMoment,
  x: number,
  y: number,
  alpha: number,
) {
  const width = 176;
  const height = 112;
  context.save();
  context.globalAlpha = alpha;
  context.fillStyle = "rgba(12, 11, 32, .84)";
  context.fillRect(Math.round(x - 8), Math.round(y - 8), width + 16, height + 32);
  context.strokeStyle = `${moment.accent}d8`;
  context.lineWidth = 3;
  context.strokeRect(Math.round(x - 4), Math.round(y - 4), width + 8, height + 8);
  for (let pixelY = 0; pixelY < 9; pixelY += 1) {
    for (let pixelX = 0; pixelX < 16; pixelX += 1) {
      const offset = (pixelY * 16 + pixelX) * 3;
      const red = (moment.memoryPixels[offset] ?? 6) * 17;
      const green = (moment.memoryPixels[offset + 1] ?? 6) * 17;
      const blue = (moment.memoryPixels[offset + 2] ?? 6) * 17;
      context.fillStyle = `rgb(${red} ${green} ${blue})`;
      context.fillRect(Math.round(x + pixelX * 11), Math.round(y + pixelY * 11), 12, 12);
    }
  }
  context.fillStyle = "rgba(247, 237, 207, .88)";
  context.font = "700 10px ui-monospace, monospace";
  context.fillText(formatDate(moment.date), Math.round(x), Math.round(y + height + 19));
  context.restore();
}

function drawSprite(
  context: CanvasRenderingContext2D,
  atlas: HTMLImageElement | null,
  x: number,
  ground: number,
  now: number,
  linked: boolean,
  alpha = 1,
  scale = 1,
) {
  if (!atlas?.complete || !atlas.naturalWidth) return;
  const frame = linked ? 6 + (Math.floor(now / 190) % 2) : 1 + (Math.floor(now / 150) % 3);
  const cellWidth = atlas.naturalWidth / 4;
  const cellHeight = atlas.naturalHeight / 3;
  const drawSize = 190 * scale;
  context.save();
  context.globalAlpha = alpha;
  context.imageSmoothingEnabled = false;
  context.shadowColor = linked ? "rgba(147, 245, 225, .72)" : "rgba(8, 7, 24, .5)";
  context.shadowBlur = linked ? 20 : 12;
  context.drawImage(
    atlas,
    (frame % 4) * cellWidth,
    Math.floor(frame / 4) * cellHeight,
    cellWidth,
    cellHeight,
    x - drawSize / 2,
    ground - drawSize + 18,
    drawSize,
    drawSize,
  );
  context.restore();
}

export default function MemoryGame({ journey, avatarSpriteUrl, isDemo = false }: MemoryGameProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const atlasRef = useRef<HTMLImageElement | null>(null);
  const spriteRef = useRef<HTMLImageElement | null>(null);
  const elapsedRef = useRef(0);
  const previousRef = useRef(0);
  const pausedRef = useRef(false);
  const speedRef = useRef(1);
  const activeIndexRef = useRef(0);
  const lastUiUpdateRef = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [progress, setProgress] = useState(0);
  const [captions, setCaptions] = useState(true);

  const activeMoment = journey.moments[activeIndex] ?? journey.moments[0];
  const activeTheme = themeForMoment(activeIndex, journey.moments.length);

  useEffect(() => {
    const atlas = new Image();
    const sprite = new Image();
    atlas.decoding = "async";
    sprite.decoding = "async";
    atlas.src = "/game/world-atlas-v2.png";
    sprite.src = avatarSpriteUrl || "/game/traveler-spritesheet.png";
    atlas.onload = () => { atlasRef.current = atlas; };
    sprite.onload = () => { spriteRef.current = sprite; };
    return () => {
      atlasRef.current = null;
      spriteRef.current = null;
    };
  }, [avatarSpriteUrl]);

  const togglePaused = useCallback(() => {
    setPaused((current) => {
      pausedRef.current = !current;
      return !current;
    });
  }, []);

  const changeSpeed = useCallback(() => {
    setSpeed((current) => {
      const next = current === 0.65 ? 1 : current === 1 ? 1.4 : 0.65;
      speedRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.key === " " || event.key.toLowerCase() === "p") {
        event.preventDefault();
        togglePaused();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [togglePaused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !journey.moments.length) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let animationFrame = 0;
    const memoryDuration = Math.max(6, Math.min(11, 420 / Math.max(1, journey.moments.length)));
    const walkingDuration = Math.max(30, journey.moments.length * memoryDuration);
    const holdAtSunrise = 4;

    const render = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const desiredDpr = Math.min(window.devicePixelRatio || 1, 2.5);
      if (canvas.width !== Math.round(rect.width * desiredDpr) || canvas.height !== Math.round(rect.height * desiredDpr)) {
        canvas.width = Math.round(rect.width * desiredDpr);
        canvas.height = Math.round(rect.height * desiredDpr);
      }
      context.setTransform(desiredDpr, 0, 0, desiredDpr, 0, 0);
      const width = rect.width;
      const height = rect.height;
      const ground = height - Math.max(78, Math.min(112, height * 0.13));
      if (!previousRef.current) previousRef.current = now;
      const delta = Math.min(0.05, (now - previousRef.current) / 1000);
      previousRef.current = now;
      if (!pausedRef.current) elapsedRef.current += delta * speedRef.current;
      const cycleLength = walkingDuration + holdAtSunrise;
      const cycleTime = elapsedRef.current % cycleLength;
      const walkProgress = Math.min(1, cycleTime / walkingDuration);
      const scaled = walkProgress * Math.max(0, journey.moments.length - 1);
      const index = Math.min(journey.moments.length - 1, Math.floor(scaled));
      const nextIndex = Math.min(journey.moments.length - 1, index + 1);
      const localProgress = scaled - index;
      const moment = journey.moments[index];
      const nextMoment = journey.moments[nextIndex];
      const theme = themeForMoment(index, journey.moments.length);

      if (index !== activeIndexRef.current) {
        activeIndexRef.current = index;
        setActiveIndex(index);
      }
      if (now - lastUiUpdateRef.current > 180) {
        lastUiUpdateRef.current = now;
        setProgress(walkProgress);
      }

      context.clearRect(0, 0, width, height);
      drawAtlasScene(context, atlasRef.current, theme.atlasIndex, width, height, localProgress);
      drawMemoryComposite(context, moment, width, ground, 0.42 * (1 - localProgress));
      if (nextMoment !== moment) drawMemoryComposite(context, nextMoment, width, ground, 0.42 * localProgress);

      const vignette = context.createLinearGradient(0, 0, 0, height);
      vignette.addColorStop(0, "rgba(8, 7, 27, .12)");
      vignette.addColorStop(0.64, "rgba(8, 7, 27, 0)");
      vignette.addColorStop(1, "rgba(8, 7, 27, .66)");
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);

      for (let dust = 0; dust < 34; dust += 1) {
        const dustX = ((dust * 151 - elapsedRef.current * (9 + dust % 4)) % (width + 80) + width + 80) % (width + 80) - 40;
        const dustY = 72 + ((dust * 67) % Math.max(100, ground - 130));
        context.globalAlpha = 0.26 + (dust % 5) * 0.08;
        context.fillStyle = dust % 3 === 0 ? theme.accent : "#f7edcf";
        context.fillRect(Math.round(dustX), Math.round(dustY), dust % 7 === 0 ? 3 : 2, dust % 7 === 0 ? 3 : 2);
      }
      context.globalAlpha = 1;

      const postcardX = width * 0.7 - localProgress * width * 0.48;
      const postcardY = Math.max(118, ground - 286 + Math.sin(now / 900) * 8);
      drawPixelPostcard(context, moment, postcardX, postcardY, Math.min(0.86, 1 - Math.abs(localProgress - 0.45) * 0.7));

      const playerX = Math.max(72, width * 0.27);
      const linked = moment.companionNames.length > 0;
      const companions = moment.companionNames.slice(0, 2);
      companions.forEach((name, companionIndex) => {
        const companionX = playerX - 66 - companionIndex * 52;
        drawSprite(context, spriteRef.current, companionX, ground, now + companionIndex * 90, true, 0.38 - companionIndex * 0.08, 0.82);
        context.fillStyle = "rgba(247, 237, 207, .78)";
        context.font = "700 10px ui-monospace, monospace";
        context.textAlign = "center";
        context.fillText(name.length > 14 ? `${name.slice(0, 13)}…` : name, companionX, ground - 124);
      });
      context.textAlign = "start";
      drawSprite(context, spriteRef.current, playerX, ground, now, linked, 1, 1);

      if (moment.companionNames.length === 0) {
        for (let echo = 0; echo < moment.echoStrength; echo += 1) {
          const echoX = width * 0.72 + echo * 44 - localProgress * 90;
          context.save();
          context.globalAlpha = 0.18 + echo * 0.08;
          context.fillStyle = "#d2cbed";
          context.shadowColor = theme.accent;
          context.shadowBlur = 14;
          context.fillRect(Math.round(echoX - 8), Math.round(ground - 62), 16, 52);
          context.fillRect(Math.round(echoX - 11), Math.round(ground - 82), 22, 20);
          context.restore();
        }
      }

      animationFrame = requestAnimationFrame(render);
    };
    animationFrame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrame);
  }, [journey]);

  return (
    <main className="memory-walk-shell" style={{ "--walk-accent": activeTheme.accent } as CSSProperties}>
      <header className="walk-topbar">
        {/* vinext currently duplicates React when next/link is used in this client-only route. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="walk-wordmark" aria-label="리캡으로 돌아가기"><span>VR</span><b>MEMORY WALK</b></a>
        <div className="walk-now">
          <small>{activeTheme.title}</small>
          <strong>{formatDate(activeMoment.date)}</strong>
        </div>
        <div className="walk-actions">
          <button type="button" onClick={togglePaused} aria-pressed={paused}>{paused ? "계속 걷기" : "잠시 멈춤"}</button>
          <button type="button" onClick={changeSpeed} aria-label="산책 속도 변경">{speed}×</button>
          <button type="button" onClick={() => setCaptions((current) => !current)} aria-pressed={captions}>기억 글</button>
        </div>
      </header>

      <canvas ref={canvasRef} className="memory-walk-canvas" aria-label="자동으로 이어지는 VRChat 기억 산책" />

      {captions && (
        <aside className="walk-memory-caption" key={activeMoment.id}>
          <span>MEMORY {String(activeIndex + 1).padStart(2, "0")} · {activeTheme.subtitle}</span>
          <strong>{activeMoment.worldName || "이름이 남지 않은 월드"}</strong>
          <p>{activeMoment.photoCount.toLocaleString("ko-KR")}장의 장면이 섞여 만든 이 시기의 빛이에요.</p>
          {activeMoment.companionNames.length > 0
            ? <div><small>함께 걷는 이름</small><b>{activeMoment.companionNames.join(" · ")}</b></div>
            : <small>잠깐 스친 사람들은 이 장면에 머뭅니다.</small>}
        </aside>
      )}

      <footer className="walk-timeline">
        <span>{formatDate(journey.startDate, true)}</span>
        <div className="walk-timeline-track">
          <i style={{ width: `${progress * 100}%` }} />
          {journey.moments.map((moment, index) => (
            <b key={moment.id} className={index === activeIndex ? "active" : ""} style={{ left: `${(index / Math.max(1, journey.moments.length - 1)) * 100}%` }} />
          ))}
        </div>
        <span>{formatDate(journey.endDate, true)}</span>
        <button type="button" onClick={() => exportJourney(journey)}>기억 인덱스 저장</button>
      </footer>

      <div className="walk-status" aria-live="polite">
        {paused ? "이 기억에 잠시 머무는 중" : "자동으로 기억 속을 걷고 있어요"}
        {isDemo && <span> · 내 사진으로 만든 공개 샘플</span>}
      </div>
    </main>
  );
}
