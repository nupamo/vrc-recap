"use client";

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  analyzeFiles,
  exportJourney,
  exportRecapCard,
  formatDate,
  releaseJourney,
  type AnalysisProgress,
  type MemoryJourney,
} from "./lib/memory";
import { createGameSession, GAME_SESSION_KEY } from "./lib/gameSession";
import { createPublicSampleJourney } from "./lib/personalSample";

type AppPhase = "intro" | "analyzing" | "recap";
type Direction = "left" | "right" | "jump" | "run";

type LocalFileHandle = {
  kind: "file";
  getFile: () => Promise<File>;
};

type LocalDirectoryHandle = {
  kind: "directory";
  values: () => AsyncIterable<LocalFileHandle | LocalDirectoryHandle>;
};

type FolderPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<LocalDirectoryHandle>;
};

const emptyProgress: AnalysisProgress = {
  current: 0,
  total: 1,
  label: "산책길을 준비하는 중",
};

const AVATAR_CELL_WIDTH = 48;
const AVATAR_CELL_HEIGHT = 64;
const MEMORY_STEP = 640;

type StageTheme = {
  id: string;
  number: string;
  title: string;
  subtitle: string;
  sky: string;
  accent: string;
  ground: string;
  landmark: "skyport" | "plaza" | "garden" | "rail" | "archive" | "festival" | "rooftop" | "snow" | "sunrise";
  mechanic: string;
  physics: {
    acceleration: number;
    baseSpeed: number;
    jumpVelocity: number;
    gravity: number;
    airControl: number;
    friction: number;
    maxJumps: number;
  };
};

const STAGE_THEMES: StageTheme[] = [
  {
    id: "first-login", number: "01", title: "FIRST LOGIN", subtitle: "처음 문을 열었던 밤",
    sky: "#24264f", accent: "#8bc8d5", ground: "#35395f", landmark: "skyport", mechanic: "낯선 하늘 · 첫 로그인",
    physics: { acceleration: 720, baseSpeed: 260, jumpVelocity: -510, gravity: 820, airControl: 1, friction: 0.002, maxJumps: 1 },
  },
  {
    id: "midnight-plaza", number: "02", title: "MIDNIGHT PLAZA", subtitle: "약속 없이도 모이던 광장",
    sky: "#382552", accent: "#d28cc5", ground: "#4b345d", landmark: "plaza", mechanic: "자주 모인 밤 · 네온의 잔상",
    physics: { acceleration: 980, baseSpeed: 280, jumpVelocity: -470, gravity: 980, airControl: 0.58, friction: 0.002, maxJumps: 1 },
  },
  {
    id: "portal-garden", number: "03", title: "PORTAL GARDEN", subtitle: "새 월드를 찾아 헤매던 계절",
    sky: "#193e46", accent: "#80d5ae", ground: "#28564f", landmark: "garden", mechanic: "처음 본 월드 · 초록빛 문",
    physics: { acceleration: 720, baseSpeed: 260, jumpVelocity: -570, gravity: 980, airControl: 0.58, friction: 0.002, maxJumps: 1 },
  },
  {
    id: "memory-line", number: "04", title: "MEMORY LINE", subtitle: "몇 번이고 다시 탄 시간열차",
    sky: "#23334d", accent: "#e3ad72", ground: "#344861", landmark: "rail", mechanic: "되풀이된 방문 · 시간열차",
    physics: { acceleration: 870, baseSpeed: 320, jumpVelocity: -470, gravity: 980, airControl: 0.58, friction: 0.002, maxJumps: 1 },
  },
  {
    id: "star-archive", number: "05", title: "STAR ARCHIVE", subtitle: "서로의 이름을 별처럼 모은 곳",
    sky: "#30264f", accent: "#b2a2ed", ground: "#493b68", landmark: "archive", mechanic: "다시 만난 이름 · 별의 서고",
    physics: { acceleration: 720, baseSpeed: 260, jumpVelocity: -470, gravity: 610, airControl: 0.58, friction: 0.002, maxJumps: 1 },
  },
  {
    id: "festival-cloud", number: "06", title: "FESTIVAL CLOUD", subtitle: "웃음과 음악이 떠 있던 축제",
    sky: "#46345f", accent: "#f2a9c2", ground: "#5c4773", landmark: "festival", mechanic: "사진이 많던 밤 · 축제의 빛",
    physics: { acceleration: 840, baseSpeed: 270, jumpVelocity: -530, gravity: 760, airControl: 0.65, friction: 0.01, maxJumps: 1 },
  },
  {
    id: "rainy-rooftop", number: "07", title: "RAINY ROOFTOP", subtitle: "말없이 빗소리를 듣던 옥상",
    sky: "#233544", accent: "#74b9d2", ground: "#354b59", landmark: "rooftop", mechanic: "조용한 대화 · 빗소리의 층",
    physics: { acceleration: 720, baseSpeed: 300, jumpVelocity: -470, gravity: 980, airControl: 0.58, friction: 0.28, maxJumps: 1 },
  },
  {
    id: "snow-globe", number: "08", title: "SNOW GLOBE", subtitle: "하얀 월드에 발자국을 남긴 밤",
    sky: "#40506b", accent: "#d5e9f4", ground: "#52647b", landmark: "snow", mechanic: "멀어진 계절 · 설원의 흔적",
    physics: { acceleration: 700, baseSpeed: 250, jumpVelocity: -490, gravity: 880, airControl: 0.62, friction: 0.01, maxJumps: 2 },
  },
  {
    id: "sunrise-lobby", number: "09", title: "SUNRISE LOBBY", subtitle: "아침이 와도 끝나지 않은 이야기",
    sky: "#5a3c58", accent: "#f4c17e", ground: "#624d64", landmark: "sunrise", mechanic: "지금까지 이어진 · 새벽의 로비",
    physics: { acceleration: 860, baseSpeed: 350, jumpVelocity: -500, gravity: 920, airControl: 0.7, friction: 0.004, maxJumps: 1 },
  },
];

function formatHour(hour: number): string {
  const period = hour < 12 ? "오전" : "오후";
  const display = hour % 12 || 12;
  return `${period} ${display}시`;
}

async function readDirectory(handle: LocalDirectoryHandle): Promise<File[]> {
  const files: File[] = [];
  const directories: LocalDirectoryHandle[] = [];
  let batch: LocalFileHandle[] = [];

  const flushBatch = async () => {
    if (!batch.length) return;
    files.push(...(await Promise.all(batch.map((entry) => entry.getFile()))));
    batch = [];
  };

  for await (const entry of handle.values()) {
    if (entry.kind === "file") {
      batch.push(entry);
      if (batch.length === 32) await flushBatch();
    } else {
      directories.push(entry);
    }
  }
  await flushBatch();
  for (const directory of directories) {
    const nestedFiles = await readDirectory(directory);
    for (const file of nestedFiles) files.push(file);
  }
  return files;
}

async function createAvatarPixelSprite(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, {
    resizeWidth: 96,
    resizeHeight: 96,
    resizeQuality: "high",
  });
  const source = document.createElement("canvas");
  source.width = 48;
  source.height = 64;
  const sourceContext = source.getContext("2d", { willReadFrequently: true });
  if (!sourceContext) {
    bitmap.close();
    throw new Error("아바타 픽셀 캔버스를 만들 수 없습니다.");
  }

  const scale = Math.min(source.width / bitmap.width, source.height / bitmap.height);
  const drawWidth = bitmap.width * scale;
  const drawHeight = bitmap.height * scale;
  sourceContext.drawImage(
    bitmap,
    0,
    0,
    bitmap.width,
    bitmap.height,
    (source.width - drawWidth) / 2,
    (source.height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  bitmap.close();

  const image = sourceContext.getImageData(0, 0, source.width, source.height);
  const data = image.data;
  const cornerOffsets = [0, (source.width - 1) * 4, (source.height - 1) * source.width * 4, (source.width * source.height - 1) * 4];
  const background = [0, 1, 2].map((channel) => (
    cornerOffsets.reduce((sum, offset) => sum + data[offset + channel], 0) / cornerOffsets.length
  ));
  const visited = new Uint8Array(source.width * source.height);
  const queue: number[] = [];
  const isBackground = (pixel: number) => {
    const offset = pixel * 4;
    const delta = Math.hypot(
      data[offset] - background[0],
      data[offset + 1] - background[1],
      data[offset + 2] - background[2],
    );
    return data[offset + 3] < 24 || delta < 72;
  };
  const enqueue = (pixel: number) => {
    if (visited[pixel] || !isBackground(pixel)) return;
    visited[pixel] = 1;
    queue.push(pixel);
  };
  for (let x = 0; x < source.width; x += 1) {
    enqueue(x);
    enqueue((source.height - 1) * source.width + x);
  }
  for (let y = 0; y < source.height; y += 1) {
    enqueue(y * source.width);
    enqueue(y * source.width + source.width - 1);
  }
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const pixel = queue[cursor];
    const x = pixel % source.width;
    const y = Math.floor(pixel / source.width);
    if (x > 0) enqueue(pixel - 1);
    if (x + 1 < source.width) enqueue(pixel + 1);
    if (y > 0) enqueue(pixel - source.width);
    if (y + 1 < source.height) enqueue(pixel + source.width);
  }

  let opaque = 0;
  for (let pixel = 0; pixel < visited.length; pixel += 1) {
    const offset = pixel * 4;
    if (visited[pixel]) data[offset + 3] = 0;
    if (data[offset + 3] > 32) opaque += 1;
  }
  const needsSilhouetteMask = opaque < visited.length * 0.08 || opaque > visited.length * 0.82;
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const offset = (y * source.width + x) * 4;
      if (needsSilhouetteMask) {
        const normalizedY = y / source.height;
        const halfWidth = normalizedY < 0.32 ? 0.2 : normalizedY < 0.72 ? 0.3 : 0.22;
        if (Math.abs(x / source.width - 0.5) > halfWidth) data[offset + 3] = 0;
      }
      data[offset + 3] = data[offset + 3] > 88 ? 255 : 0;
    }
  }

  type Rgb = [number, number, number];
  const quantize = (value: number) => Math.round(Math.max(0, Math.min(255, value)) / 17) * 17;
  const averageRegion = (
    left: number,
    top: number,
    right: number,
    bottom: number,
    fallback: Rgb,
  ): Rgb => {
    const sum = [0, 0, 0];
    let samples = 0;
    for (let y = Math.floor(top * source.height); y < Math.ceil(bottom * source.height); y += 1) {
      for (let x = Math.floor(left * source.width); x < Math.ceil(right * source.width); x += 1) {
        const offset = (y * source.width + x) * 4;
        if (data[offset + 3] < 128) continue;
        sum[0] += data[offset];
        sum[1] += data[offset + 1];
        sum[2] += data[offset + 2];
        samples += 1;
      }
    }
    if (!samples) return fallback;
    return [quantize(sum[0] / samples), quantize(sum[1] / samples), quantize(sum[2] / samples)];
  };
  const mix = (color: Rgb, amount: number, target: number): Rgb => color.map((channel) => (
    quantize(channel + (target - channel) * amount)
  )) as Rgb;
  const css = (color: Rgb) => `rgb(${color[0]} ${color[1]} ${color[2]})`;

  const fallbackAccent: Rgb = [102, 204, 204];
  const hair = averageRegion(0.2, 0.02, 0.8, 0.3, [51, 51, 85]);
  const face = averageRegion(0.34, 0.16, 0.66, 0.4, [221, 187, 153]);
  const outfit = averageRegion(0.16, 0.35, 0.84, 0.68, [85, 102, 153]);
  const lower = averageRegion(0.22, 0.65, 0.78, 0.92, [51, 68, 102]);
  let accent = fallbackAccent;
  let bestSaturation = -1;
  let featureHash = 2166136261;
  for (let pixel = 0; pixel < source.width * source.height; pixel += 3) {
    const offset = pixel * 4;
    if (data[offset + 3] < 128) continue;
    const color: Rgb = [data[offset], data[offset + 1], data[offset + 2]];
    const saturation = Math.max(...color) - Math.min(...color);
    if (saturation > bestSaturation) {
      bestSaturation = saturation;
      accent = color.map(quantize) as Rgb;
    }
    featureHash ^= data[offset] + data[offset + 1] * 3 + data[offset + 2] * 7;
    featureHash = Math.imul(featureHash, 16777619) >>> 0;
  }

  const outline = mix(hair, 0.72, 0);
  const hairShadow = mix(hair, 0.38, 0);
  const faceShadow = mix(face, 0.2, 0);
  const outfitShadow = mix(outfit, 0.35, 0);
  const outfitLight = mix(outfit, 0.24, 255);
  const lowerShadow = mix(lower, 0.42, 0);
  const eye = mix(accent, 0.2, 255);

  const base = document.createElement("canvas");
  base.width = 32;
  base.height = 48;
  const baseContext = base.getContext("2d");
  if (!baseContext) throw new Error("아바타 픽셀 시트를 만들 수 없습니다.");
  baseContext.imageSmoothingEnabled = false;
  const pixel = (color: Rgb, x: number, y: number, width: number, height: number) => {
    baseContext.fillStyle = css(color);
    baseContext.fillRect(x, y, width, height);
  };

  // The photo contributes only a compact palette and feature hash. The body is newly drawn pixel art.
  if (featureHash % 3 === 0) {
    pixel(outline, 8, 1, 4, 6);
    pixel(hair, 9, 1, 3, 5);
    pixel(outline, 20, 1, 4, 6);
    pixel(hair, 20, 1, 3, 5);
  } else if (featureHash % 3 === 1) {
    pixel(outline, 10, 0, 3, 5);
    pixel(accent, 11, 1, 1, 3);
    pixel(outline, 19, 0, 3, 5);
    pixel(accent, 20, 1, 1, 3);
  }
  pixel(outline, 9, 3, 14, 12);
  pixel(hair, 10, 3, 12, 5);
  pixel(hairShadow, 9, 7, 3, 6);
  pixel(face, 12, 7, 9, 6);
  pixel(faceShadow, 12, 12, 9, 2);
  pixel(eye, 13, 9, 2, 2);
  pixel(eye, 19, 9, 2, 2);
  pixel(accent, 16, 12, 2, 1);

  pixel(outline, 7, 14, 18, 16);
  pixel(outfit, 9, 15, 14, 14);
  pixel(outfitLight, 10, 16, 3, 10);
  pixel(outfitShadow, 20, 17, 3, 11);
  pixel(faceShadow, 4, 18, 4, 11);
  pixel(face, 5, 18, 3, 9);
  pixel(faceShadow, 24, 18, 4, 11);
  pixel(face, 24, 18, 3, 9);
  pixel(accent, featureHash % 2 === 0 ? 14 : 11, 18, featureHash % 2 === 0 ? 4 : 10, 3);
  if (featureHash % 5 === 0) pixel(eye, 15, 21, 3, 4);

  pixel(outline, 8, 29, 16, 5);
  pixel(lower, 9, 29, 14, 4);
  pixel(outline, 8, 33, 8, 15);
  pixel(lower, 9, 33, 6, 12);
  pixel(lowerShadow, 9, 43, 7, 5);
  pixel(outline, 16, 33, 8, 15);
  pixel(lower, 17, 33, 6, 12);
  pixel(lowerShadow, 16, 43, 7, 5);
  pixel(outfitLight, 10, 34, 2, 7);
  pixel(outfitLight, 18, 34, 2, 7);

  const sheet = document.createElement("canvas");
  sheet.width = AVATAR_CELL_WIDTH * 4;
  sheet.height = AVATAR_CELL_HEIGHT * 3;
  const context = sheet.getContext("2d");
  if (!context) throw new Error("아바타 애니메이션 시트를 만들 수 없습니다.");
  context.imageSmoothingEnabled = false;
  const frames = [
    { x: 0, bob: 0, left: 0, right: 0 },
    { x: -1, bob: 1, left: 2, right: -1 },
    { x: 0, bob: 0, left: -1, right: 2 },
    { x: 1, bob: 1, left: 2, right: -1 },
    { x: 0, bob: 0, left: 0, right: 0 },
    { x: 0, bob: -1, left: 0, right: 0 },
    { x: -1, bob: 1, left: 1, right: 0 },
    { x: 1, bob: 1, left: 0, right: 1 },
    { x: 0, bob: 0, left: 0, right: 0 },
    { x: -1, bob: 1, left: 1, right: -1 },
    { x: 1, bob: -1, left: -1, right: 1 },
    { x: 0, bob: -2, left: 0, right: 0 },
  ];
  frames.forEach((frame, index) => {
    const cellX = (index % 4) * AVATAR_CELL_WIDTH;
    const cellY = Math.floor(index / 4) * AVATAR_CELL_HEIGHT;
    const x = cellX + 8 + frame.x;
    const y = cellY + 10 + frame.bob;
    context.drawImage(base, 0, 0, 32, 34, x, y, 32, 34);
    context.drawImage(base, 0, 34, 16, 14, x - 1, y + 34 + frame.left, 16, 14);
    context.drawImage(base, 16, 34, 16, 14, x + 1, y + 34 + frame.right, 16, 14);
  });
  return sheet.toDataURL("image/png");
}

function PixelConstellation() {
  return (
    <div className="constellation" aria-hidden="true">
      {Array.from({ length: 19 }, (_, index) => (
        <i key={index} />
      ))}
    </div>
  );
}

function Intro({
  onPickFolder,
  onOpenFallback,
  onDemo,
  avatarSpriteUrl,
  onAvatar,
  error,
}: {
  onPickFolder: () => void;
  onOpenFallback: () => void;
  onDemo: () => void;
  avatarSpriteUrl: string | null;
  onAvatar: (file: File | undefined) => void;
  error: string | null;
}) {
  const avatarInput = useRef<HTMLInputElement>(null);

  return (
    <main className="intro-shell">
      <PixelConstellation />
      <nav className="topbar" aria-label="서비스 정보">
        <a className="wordmark" href="#top" aria-label="VRChat Recap 처음으로">
          <span>VR</span>
          VRCHAT RECAP
        </a>
        <div className="local-badge"><i /> 이 기기에서만</div>
      </nav>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">YOUR SCREENSHOTS · YOUR YEARS · YOUR RECAP</p>
          <h1>
            당신의 VRChat,
            <br />
            다시 <em>만나볼까요.</em>
          </h1>
          <p className="hero-description">
            모든 사진을 이 기기의 로컬 인물 모델로 한 장씩 살펴보고, 월드·플레이어 메타데이터를 엮어
            아바타가 바뀌어도 같은 VRChat 사용자로 이어지는 recap을 만듭니다.
          </p>

          <div className="hero-actions">
            <button className="primary-button" type="button" onClick={onPickFolder}>
              <span className="folder-glyph" aria-hidden="true" />
              스크린샷 폴더 고르기
            </button>
            <button className="text-button" type="button" onClick={onDemo}>
              내 사진 기억 샘플 보기 <span aria-hidden="true">→</span>
            </button>
          </div>

          <div className="avatar-choice">
            <button
              className={`avatar-token ${avatarSpriteUrl ? "has-avatar" : ""}`}
              type="button"
              onClick={() => avatarInput.current?.click()}
              aria-label="내 아바타 사진 선택"
              style={avatarSpriteUrl ? {
                backgroundImage: `url(${avatarSpriteUrl})`,
                backgroundSize: "400% 300%",
                backgroundPosition: "0 0",
              } : undefined}
            >
              {!avatarSpriteUrl && <span>+</span>}
            </button>
            <div>
              <strong>지금의 내 아바타</strong>
              <span>사진을 붙이지 않고, 이 기기에서 새 픽셀 캐릭터를 만듭니다</span>
            </div>
            <input
              ref={avatarInput}
              className="visually-hidden"
              type="file"
              accept="image/*"
              onChange={(event) => onAvatar(event.target.files?.[0])}
            />
          </div>

          {error && (
            <div className="error-note" role="alert">
              {error} <button onClick={onOpenFallback}>다른 방식으로 고르기</button>
            </div>
          )}
        </div>

        <div className="hero-scene" aria-label="VRChat Recap 게임 미리보기">
          <div className="scene-date">2022 · 08 · 14</div>
          <div className="moon" />
          <div className="pixel-cloud cloud-one" />
          <div className="pixel-cloud cloud-two" />
          <div className="distant-city" />
          <div className="memory-frame frame-one"><span>그 여름의 월드</span></div>
          <div className="memory-frame frame-two"><span>새벽 2:13</span></div>
          <div className="preview-echo echo-one"><i /><b /></div>
          <div className="preview-echo echo-two"><i /><b /></div>
          <div className="preview-player"><i /><b /><span /></div>
          <div className="preview-ground" />
          <div className="scene-caption">
            <b>RECAP이 끝나면, 기억이 스스로 흐릅니다</b>
            <span>9 ERAS · ONE CONTINUOUS MEMORY WALK</span>
          </div>
        </div>
      </section>

      <section className="privacy-strip" aria-label="개인정보 처리 원칙">
        <article>
          <span className="privacy-number">01</span>
          <div><b>업로드하지 않아요</b><p>사진은 서버나 외부 AI로 전송되지 않습니다.</p></div>
        </article>
        <article>
          <span className="privacy-number">02</span>
          <div><b>전부, 한 장씩만 봐요</b><p>모든 사진을 작은 12-bit 지문으로 바꾸고 비트맵을 즉시 닫습니다.</p></div>
        </article>
        <article>
          <span className="privacy-number">03</span>
          <div><b>학습에 쓰지 않아요</b><p>새로고침하면 사진 연결도 사라집니다.</p></div>
        </article>
      </section>
    </main>
  );
}

function Analyzing({ progress }: { progress: AnalysisProgress }) {
  const percent = Math.max(3, Math.round((progress.current / Math.max(1, progress.total)) * 100));
  return (
    <main className="analyzing-shell" aria-live="polite">
      <PixelConstellation />
      <div className="analyzing-card">
        <div className="scanner-orbit"><span /><i /><b /></div>
        <p className="eyebrow">LOCAL MEMORY WEAVING</p>
        <h1>추억 사이에 길을 놓고 있어요</h1>
        <p>{progress.label}</p>
        <div className="progress-track" aria-label={`분석 ${percent}%`}>
          <span style={{ width: `${percent}%` }} />
        </div>
        <div className="progress-meta"><span>{percent}%</span><span>사진은 이 기기를 떠나지 않아요</span></div>
      </div>
    </main>
  );
}

function RecapDeck({
  journey,
  onPlay,
  onRestart,
}: {
  journey: MemoryJourney;
  onPlay: () => void;
  onRestart: () => void;
}) {
  const [slide, setSlide] = useState(0);
  const totalSlides = 9;
  const stats = journey.stats;
  const years = stats.activeYears;
  const peakYearPhotos = Math.max(...years.map((year) => year.photos), 1);
  const backgroundMoment = journey.moments[Math.min(journey.moments.length - 1, Math.round((slide / (totalSlides - 1)) * (journey.moments.length - 1)))];

  const move = useCallback((direction: number) => {
    setSlide((current) => Math.max(0, Math.min(totalSlides - 1, current + direction)));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowRight") move(1);
      if (event.key === "ArrowLeft") move(-1);
      if (event.key === "Enter" && slide === totalSlides - 1) onPlay();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [move, onPlay, slide]);

  const backgroundStyle = backgroundMoment?.previewUrl
    ? { backgroundImage: `url(${backgroundMoment.previewUrl})` }
    : { backgroundColor: backgroundMoment?.accent ?? "#272343" };

  return (
    <main className="recap-shell">
      <div className="recap-photo" style={backgroundStyle} aria-hidden="true" />
      <div className="recap-wash" aria-hidden="true" />
      <header className="recap-header">
        <div className="hud-brand"><span>VR</span><b>VRCHAT RECAP</b></div>
        <div className="recap-dots" aria-label={`${totalSlides}장 중 ${slide + 1}장`}>
          {Array.from({ length: totalSlides }, (_, index) => (
            <button key={index} className={index === slide ? "active" : ""} onClick={() => setSlide(index)} aria-label={`${index + 1}번째 recap 보기`} />
          ))}
        </div>
        <button className="hud-button" type="button" onClick={onRestart}>다른 폴더</button>
      </header>

      <section className={`recap-slide recap-slide-${slide}`} key={slide} aria-live="polite">
        {slide === 0 && (
          <div className="recap-cover">
            <p className="eyebrow">YOUR VRCHAT STORY, REWOUND</p>
            <span className="recap-range">{new Date(journey.startDate).getFullYear()} — {new Date(journey.endDate).getFullYear()}</span>
            <h1><b>{journey.totalPhotos.toLocaleString("ko-KR")}</b>장의 밤</h1>
            <p>{stats.activeDays.toLocaleString("ko-KR")}일 동안 남긴 장면이 다시 하나의 길이 됩니다.</p>
          </div>
        )}

        {slide === 1 && (
          <div className="recap-rhythm">
            <p className="eyebrow">YOUR TIME SIGNATURE</p>
            <h2>{stats.recapPersona}</h2>
            <div className="rhythm-clock"><span>{String(stats.favoriteHour).padStart(2, "0")}:00</span><i /></div>
            <p>가장 자주 셔터를 누른 시간은 <strong>{formatHour(stats.favoriteHour)}</strong>.</p>
            <div className="recap-stat-row"><b>{stats.lateNightPercent}%</b><span>새벽 5시 이전에 남긴 장면</span></div>
          </div>
        )}

        {slide === 2 && (
          <div className="recap-peak">
            <p className="eyebrow">THE NIGHT THAT KEPT GOING</p>
            <span className="peak-date">{formatDate(stats.busiestDay)}</span>
            <h2><b>{stats.busiestDayPhotos.toLocaleString("ko-KR")}</b>장</h2>
            <p>하루 중 가장 많은 추억이 남은 날이에요.</p>
            <div className="peak-facts">
              <div><b>{stats.longestSessionPhotos}</b><span>가장 긴 세션의 사진</span></div>
              <div><b>{stats.longestStreakDays}</b><span>최장 연속 접속 일수</span></div>
              <div><b>{stats.totalSessions}</b><span>함께 이어진 밤</span></div>
            </div>
          </div>
        )}

        {slide === 3 && (
          <div className="recap-years">
            <p className="eyebrow">YOUR ERAS</p>
            <h2>시간마다 다른 색으로 빛났어요.</h2>
            <div className="year-bars">
              {years.map((year, index) => (
                <div className="year-bar" key={year.year}>
                  <div><i style={{ height: `${Math.max(10, (year.photos / peakYearPhotos) * 100)}%`, background: STAGE_THEMES[index % STAGE_THEMES.length].accent }} /></div>
                  <b>{year.year}</b>
                  <span>{year.photos.toLocaleString("ko-KR")}장</span>
                  <small>{year.activeDays}일</small>
                </div>
              ))}
            </div>
          </div>
        )}

        {slide === 4 && (
          <div className="recap-worlds">
            <p className="eyebrow">PLACES YOU RETURNED TO</p>
            <h2>다시 문을 열었던 월드들</h2>
            <p>PNG 메타데이터가 남아 있는 사진은 실제 월드 이름과 서로 다른 방문 횟수로 정리했어요.</p>
            {stats.topWorlds.length ? (
              <div className="world-grid">
                {stats.topWorlds.map((world, index) => (
                  <article key={`${world.displayName}-${index}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <b>{world.displayName}</b>
                    <strong>{world.visitCount}회</strong>
                    <small>{world.photoCount.toLocaleString("ko-KR")}장의 장면</small>
                  </article>
                ))}
              </div>
            ) : (
              <div className="motif-stack">
                {stats.topMotifs.map((motif, index) => (
                  <div key={motif.motif} style={{ borderColor: motif.accent }}>
                    <span style={{ background: motif.accent }}>{String(index + 1).padStart(2, "0")}</span>
                    <b>WORLD ECHO {motif.motif + 1}</b>
                    <small>{motif.appearances}번의 시대에 다시 등장</small>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {slide === 5 && (
          <div className="recap-companions">
            <p className="eyebrow">THE ONES WHO KEPT RETURNING</p>
            <h2>여러 밤을 건너 다시 만난 이름</h2>
            <p>로컬 AI가 아바타가 보이는 장면을 찾고, 이름은 VRChat 사용자 ID로 묶었어요. 아바타를 바꿔도 같은 사람으로 이어집니다.</p>
            {stats.companions.length ? (
              <div className="companion-grid">
                {stats.companions.map((companion, index) => (
                  <article key={`${companion.displayName}-${index}`}>
                    <i>{companion.displayName.slice(0, 1).toLocaleUpperCase("ko-KR")}</i>
                    <div>
                      <b>{companion.displayName}</b>
                      <span>{companion.instanceCount}개 인스턴스 · {companion.activeDays}일 · AI 근거 {companion.visualEvidencePhotos}장</span>
                    </div>
                    <strong>{"◆".repeat(companion.closeness)}</strong>
                  </article>
                ))}
              </div>
            ) : (
              <div className="recap-empty">반복해서 만난 이름이 없거나, 이 폴더에는 플레이어 메타데이터가 없어요.</div>
            )}
          </div>
        )}

        {slide === 6 && (
          <div className="recap-analysis">
            <p className="eyebrow">EVERY FRAME, LOCALLY</p>
            <h2>사진도, 모델도 이 기기 안에서.</h2>
            <p>내장된 EfficientDet Lite0가 한 장씩 아바타 단서를 찾고 즉시 비트맵을 닫았어요. 얼굴 특징이나 원본 이미지는 저장하지 않습니다.</p>
            <div className="analysis-grid">
              <article><span>LOCAL MODEL</span><b>{stats.localModelStatus === "ready" ? "ON" : "OFF"}</b><small>{stats.localModel}</small></article>
              <article><span>AI PASS</span><b>{stats.modelAnalyzed.toLocaleString("ko-KR")}</b><small>/ {journey.totalPhotos.toLocaleString("ko-KR")}장</small></article>
              <article><span>AVATAR SCENES</span><b>{stats.avatarScenes.toLocaleString("ko-KR")}</b><small>{stats.avatarDetections.toLocaleString("ko-KR")}개 로컬 감지</small></article>
              <article><span>METADATA</span><b>{stats.metadataCoverage}%</b><small>월드·인스턴스 정보 확인</small></article>
              <article><span>UPLOAD</span><b>0</b><small>브라우저 밖으로 나간 사진</small></article>
            </div>
          </div>
        )}

        {slide === 7 && (
          <div className="recap-awards">
            <p className="eyebrow">YOUR MEMORY ACHIEVEMENTS</p>
            <h2>당신만의 타임캡슐 배지</h2>
            <p>얼굴 특징을 저장하지 않고 날짜, 촬영 리듬, 로컬 AI와 VRChat 사용자 ID로 만든 기록이에요.</p>
            <div className="award-grid">
              {stats.awards.map((award, index) => (
                <article key={award.id} style={{ "--award-accent": STAGE_THEMES[index % STAGE_THEMES.length].accent } as CSSProperties}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <b>{award.title}</b>
                  <strong>{award.value}</strong>
                  <small>{award.description}</small>
                </article>
              ))}
            </div>
            <div className="award-footnote"><b>{stats.favoriteSeason}</b>의 기억 · 주말 장면 <b>{stats.weekendPercent}%</b></div>
          </div>
        )}

        {slide === 8 && (
          <div className="recap-gate">
            <p className="eyebrow">NOW, WALK THROUGH IT</p>
            <h2>아홉 시대가 하나의 산책길이 되었습니다.</h2>
            <div className="stage-tickets">
              {STAGE_THEMES.map((stage) => (
                <div key={stage.id}><span>{stage.number}</span><b>{stage.title}</b><small>{stage.subtitle}</small><em>{stage.mechanic}</em></div>
              ))}
            </div>
            <div className="recap-gate-actions">
              <button type="button" className="primary-button" onClick={onPlay}>자동 기억 산책 열기 <span aria-hidden="true">→</span></button>
              <button type="button" className="secondary-button" onClick={() => void exportRecapCard(journey)}>내 recap 카드 저장</button>
            </div>
          </div>
        )}
      </section>

      <footer className="recap-footer">
        <button type="button" onClick={() => move(-1)} disabled={slide === 0}>← 이전</button>
        <span>{String(slide + 1).padStart(2, "0")} / {String(totalSlides).padStart(2, "0")}</span>
        {slide < totalSlides - 1
          ? <button type="button" onClick={() => move(1)}>다음 이야기 →</button>
          : <button type="button" onClick={onPlay}>기억 산책 시작 →</button>}
      </footer>
    </main>
  );
}

type SpriteMotion = "idle" | "walk" | "run" | "jump" | "fall" | "wave" | "collect" | "linked" | "dance" | "slide" | "doubleJump" | "celebrate";

const SPRITE_FRAME: Record<SpriteMotion, number> = {
  idle: 0,
  walk: 1,
  run: 2,
  jump: 3,
  fall: 4,
  wave: 5,
  collect: 6,
  linked: 7,
  dance: 8,
  slide: 9,
  doubleJump: 10,
  celebrate: 11,
};

function stageForMoment(index: number, total: number): StageTheme {
  const stageIndex = Math.min(
    STAGE_THEMES.length - 1,
    Math.floor((index / Math.max(1, total)) * STAGE_THEMES.length),
  );
  return STAGE_THEMES[stageIndex];
}

type MemoryPlatform = {
  x: number;
  width: number;
  height: number;
  accent: string;
  bounce: boolean;
};

function buildMemoryPlatforms(totalMoments: number): MemoryPlatform[] {
  const platforms: MemoryPlatform[] = [];
  for (let index = 0; index < Math.max(0, totalMoments - 1); index += 1) {
    const stage = stageForMoment(index, totalMoments);
    const worldX = 140 + index * MEMORY_STEP;
    const heightBonus = stage.id === "portal-garden" || stage.id === "star-archive" ? 22 : 0;
    platforms.push(
      {
        x: worldX + 188,
        width: 112 + (index % 2) * 18,
        height: 46 + (index % 3) * 12 + heightBonus,
        accent: stage.accent,
        bounce: stage.id === "festival-cloud",
      },
      {
        x: worldX + 390,
        width: 116 + ((index + 1) % 2) * 20,
        height: 88 + ((index + 1) % 3) * 14 + heightBonus,
        accent: stage.accent,
        bounce: stage.id === "festival-cloud",
      },
    );
  }
  return platforms;
}

function drawLimb(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  color: string,
  angle: number,
) {
  context.save();
  context.translate(Math.round(x), Math.round(y));
  context.rotate(angle);
  context.fillStyle = color;
  context.fillRect(Math.round(-width / 2), 0, width, height);
  context.restore();
}

function drawEchoSprite(
  context: CanvasRenderingContext2D,
  x: number,
  ground: number,
  color: string,
  alpha: number,
  now: number,
  linked = false,
) {
  const stride = Math.sin(now / 135 + x * 0.02);
  const bob = Math.abs(stride) * 2;
  context.save();
  context.globalAlpha = alpha;
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.fillStyle = color;
  context.fillRect(Math.round(x - 14), Math.round(ground - 88 - bob), 28, 26);
  context.fillRect(Math.round(x - 18), Math.round(ground - 60 - bob), 36, 40);
  drawLimb(context, x - 9, ground - 22 - bob, 10, 24, color, stride * 0.42);
  drawLimb(context, x + 9, ground - 22 - bob, 10, 24, color, -stride * 0.42);
  drawLimb(context, x - 18, ground - 56 - bob, 8, 28, color, linked ? -1.15 : -stride * 0.3);
  drawLimb(context, x + 18, ground - 56 - bob, 8, 28, color, stride * 0.3);
  context.fillStyle = "rgba(255,255,255,.62)";
  context.fillRect(Math.round(x - 7), Math.round(ground - 79 - bob), 4, 4);
  context.fillRect(Math.round(x + 4), Math.round(ground - 79 - bob), 4, 4);
  context.restore();
}

function drawAtlasPlayerSprite(
  context: CanvasRenderingContext2D,
  x: number,
  ground: number,
  motion: SpriteMotion,
  velocityX: number,
  atlas: HTMLImageElement,
  now: number,
): boolean {
  if (!atlas.complete || atlas.naturalWidth <= 0 || atlas.naturalHeight <= 0) return false;

  const frame = motion === "walk" || motion === "run"
    ? 1 + (Math.floor(now / (motion === "run" ? 95 : 155)) % 3)
    : motion === "linked"
      ? 6 + (Math.floor(now / 190) % 2)
      : SPRITE_FRAME[motion];
  const cellWidth = atlas.naturalWidth / 4;
  const cellHeight = atlas.naturalHeight / 3;
  const column = frame % 4;
  const row = Math.floor(frame / 4);
  const drawSize = 194;
  const drawTop = ground - drawSize + 18;
  const facing = velocityX < -3 ? -1 : 1;

  context.save();
  context.translate(Math.round(x), 0);
  context.scale(facing, 1);
  context.imageSmoothingEnabled = false;
  context.shadowColor = "rgba(8, 7, 24, .48)";
  context.shadowBlur = 12;
  context.drawImage(
    atlas,
    column * cellWidth,
    row * cellHeight,
    cellWidth,
    cellHeight,
    -drawSize / 2,
    drawTop,
    drawSize,
    drawSize,
  );
  context.restore();

  return true;
}

function drawPlayerSprite(
  context: CanvasRenderingContext2D,
  x: number,
  ground: number,
  motion: SpriteMotion,
  velocityX: number,
  now: number,
  spriteAtlas: HTMLImageElement | null,
) {
  if (spriteAtlas && drawAtlasPlayerSprite(context, x, ground, motion, velocityX, spriteAtlas, now)) return;

  const facing = velocityX < -3 ? -1 : 1;
  const running = motion === "run";
  const dancing = motion === "dance";
  const sliding = motion === "slide";
  const celebrating = motion === "celebrate";
  const walking = motion === "walk" || running || motion === "linked" || sliding;
  const walkPhase = Math.sin(now / (running || sliding ? 72 : 105));
  const bob = walking
    ? Math.abs(walkPhase) * (running ? 5 : 3)
    : dancing
      ? Math.abs(Math.sin(now / 105)) * 7
      : celebrating
        ? Math.abs(Math.sin(now / 82)) * 8
        : motion === "doubleJump"
          ? Math.sin(now / 70) * 2
    : motion === "collect"
      ? 9
      : motion === "idle"
        ? Math.sin(now / 520) * 1.5
        : 0;
  const legSwing = dancing
    ? Math.sin(now / 92) * 0.9
    : celebrating
      ? Math.sin(now / 82) * 0.72
      : walking
    ? sliding
      ? 0.5 * facing
      : walkPhase * (running ? 0.68 : 0.46)
    : motion === "jump"
      ? -0.32
      : motion === "doubleJump"
        ? -0.76
      : motion === "fall"
        ? 0.32
        : 0;
  const armSwing = walking ? -walkPhase * (running ? 0.62 : 0.38) : 0;
  const leftArm = celebrating
    ? -2.45
    : motion === "doubleJump"
      ? -2.1
      : dancing
        ? -1.55 + Math.sin(now / 110) * 0.55
        : motion === "wave"
    ? -2.45
    : motion === "collect"
      ? -1.15
      : motion === "linked"
        ? -1.35
        : armSwing;
  const rightArm = celebrating
    ? 2.45
    : motion === "doubleJump"
      ? 2.1
      : dancing
        ? 1.55 + Math.sin(now / 110) * 0.55
        : motion === "collect"
          ? 1.15
          : -armSwing;
  const bodyTop = ground - 66 - bob;

  context.save();
  context.fillStyle = "rgba(10, 8, 27, .34)";
  context.fillRect(Math.round(x - 30), Math.round(ground + 3), 60, 8);

  context.fillStyle = "#efb56f";
  context.fillRect(Math.round(x - 24), Math.round(bodyTop), 48, 50);
  context.fillStyle = "#d78568";
  context.fillRect(Math.round(x - 24), Math.round(bodyTop + 36), 48, 14);
  context.fillStyle = "#7fc9b7";
  context.fillRect(Math.round(x - 24 * facing), Math.round(bodyTop + 10), 8 * facing, 9);

  drawLimb(context, x - 13, bodyTop + 47, 13, 35, "#3f365b", legSwing);
  drawLimb(context, x + 13, bodyTop + 47, 13, 35, "#3f365b", -legSwing);
  drawLimb(context, x - 24, bodyTop + 8, 11, 39, "#efb56f", leftArm);
  drawLimb(context, x + 24, bodyTop + 8, 11, 39, "#efb56f", rightArm);

  const headSize = 64;
  const headX = x - headSize / 2;
  const headY = bodyTop - 56;
  context.fillStyle = "#f7edcf";
  context.fillRect(Math.round(headX - 3), Math.round(headY - 3), headSize + 6, headSize + 6);
  context.fillStyle = "#332a4e";
  context.fillRect(Math.round(headX), Math.round(headY), headSize, headSize);

  const blink = Math.floor(now / 190) % 17 === 0;
  context.fillStyle = "#f1d1ad";
  context.fillRect(Math.round(headX + 5), Math.round(headY + 5), headSize - 10, headSize - 10);
  context.fillStyle = "#332a4e";
  context.fillRect(Math.round(headX + 14), Math.round(headY + 26), 8, blink ? 2 : 7);
  context.fillRect(Math.round(headX + 36), Math.round(headY + 26), 8, blink ? 2 : 7);
  context.fillRect(Math.round(headX + 25), Math.round(headY + 40), 9, 3);

  if (motion === "collect" || celebrating || motion === "doubleJump" || dancing) {
    context.fillStyle = celebrating ? "#f2a9c2" : motion === "doubleJump" ? "#d5e9f4" : "#f7edcf";
    const sparkleCount = celebrating ? 8 : dancing ? 6 : 4;
    for (let sparkle = 0; sparkle < sparkleCount; sparkle += 1) {
      const angle = now / 260 + sparkle * ((Math.PI * 2) / sparkleCount);
      const sparkleX = x + Math.cos(angle) * (celebrating ? 62 : 48);
      const sparkleY = headY + 28 + Math.sin(angle) * (celebrating ? 58 : 46);
      context.save();
      context.translate(Math.round(sparkleX), Math.round(sparkleY));
      context.rotate(Math.PI / 4);
      context.fillRect(-4, -4, celebrating ? 10 : 8, celebrating ? 10 : 8);
      context.restore();
    }
  }

  const scarfDirection = facing * (8 + Math.min(running || sliding ? 40 : 22, Math.abs(velocityX) * 0.09));
  context.fillStyle = "#7fc9b7";
  context.fillRect(Math.round(x - 17 * facing), Math.round(bodyTop - 2), 34 * facing, 8);
  context.fillRect(Math.round(x - 15 * facing - scarfDirection), Math.round(bodyTop + 2 + walkPhase * 3), scarfDirection, 7);
  context.restore();
}

function drawWorldAtlas(
  context: CanvasRenderingContext2D,
  stage: StageTheme,
  width: number,
  ground: number,
  atlas: HTMLImageElement | null,
): boolean {
  if (!atlas?.complete || atlas.naturalWidth <= 0 || atlas.naturalHeight <= 0) return false;
  const stageIndex = Math.max(0, STAGE_THEMES.findIndex((candidate) => candidate.id === stage.id));
  const cellWidth = atlas.naturalWidth / 3;
  const cellHeight = atlas.naturalHeight / 3;
  const cellX = (stageIndex % 3) * cellWidth;
  const cellY = Math.floor(stageIndex / 3) * cellHeight;
  const destinationAspect = width / Math.max(1, ground);
  const sourceAspect = cellWidth / cellHeight;
  let sourceX = cellX;
  let sourceY = cellY;
  let sourceWidth = cellWidth;
  let sourceHeight = cellHeight;

  if (destinationAspect > sourceAspect) {
    sourceHeight = cellWidth / destinationAspect;
    sourceY = cellY + (cellHeight - sourceHeight) * 0.58;
  } else {
    sourceWidth = cellHeight * destinationAspect;
    sourceX = cellX + (cellWidth - sourceWidth) / 2;
  }

  context.save();
  context.globalAlpha = 0.94;
  context.imageSmoothingEnabled = false;
  context.drawImage(
    atlas,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    0,
    0,
    width,
    ground,
  );
  context.restore();
  return true;
}

function drawStageScenery(
  context: CanvasRenderingContext2D,
  stage: StageTheme,
  camera: number,
  width: number,
  ground: number,
  now: number,
  worldAtlas: HTMLImageElement | null,
) {
  const hasAtlas = drawWorldAtlas(context, stage, width, ground, worldAtlas);
  const drift = -((camera * 0.16) % 260);
  context.save();
  context.globalAlpha = hasAtlas ? 0.25 : 0.48;
  context.fillStyle = stage.sky;
  context.fillRect(0, 0, width, ground);
  context.fillStyle = stage.accent;

  if (stage.landmark === "skyport") {
    for (let x = drift - 120; x < width + 180; x += 220) {
      context.fillRect(Math.round(x), ground - 170, 90, 110);
      context.fillRect(Math.round(x + 24), ground - 205, 42, 35);
      context.fillRect(Math.round(x + 105), ground - 105, 74, 14);
    }
  } else if (stage.landmark === "plaza") {
    for (let x = drift - 80; x < width + 180; x += 180) {
      context.fillRect(Math.round(x), ground - 150, 9, 150);
      context.strokeStyle = stage.accent;
      context.lineWidth = 4;
      context.strokeRect(Math.round(x + 22), ground - 145, 88, 52);
      context.fillRect(Math.round(x + 35), ground - 127, 62, 6);
    }
  } else if (stage.landmark === "garden") {
    for (let x = drift - 100; x < width + 180; x += 190) {
      context.fillRect(Math.round(x + 38), ground - 122, 16, 122);
      context.fillRect(Math.round(x), ground - 176, 94, 56);
      context.fillRect(Math.round(x + 15), ground - 205, 64, 36);
      context.fillStyle = "#f7edcf";
      context.fillRect(Math.round(x + 110), ground - 116, 12, 18);
      context.fillStyle = stage.accent;
    }
  } else if (stage.landmark === "rail") {
    const trainX = ((now * 0.035 - camera * 0.34) % (width + 700)) - 620;
    context.fillRect(Math.round(trainX), ground - 205, 520, 112);
    context.fillStyle = stage.sky;
    for (let windowIndex = 0; windowIndex < 7; windowIndex += 1) {
      context.fillRect(Math.round(trainX + 32 + windowIndex * 68), ground - 178, 44, 45);
    }
    context.strokeStyle = stage.accent;
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(0, ground - 52);
    context.lineTo(width, ground - 52);
    context.stroke();
  } else if (stage.landmark === "archive") {
    for (let x = drift - 100; x < width + 180; x += 170) {
      context.fillRect(Math.round(x), ground - 190, 24, 190);
      context.fillRect(Math.round(x - 18), ground - 198, 60, 12);
      context.fillRect(Math.round(x - 12), ground - 24, 48, 24);
      context.strokeStyle = "rgba(247,237,207,.58)";
      context.beginPath();
      context.arc(Math.round(x + 84), ground - 118, 26, 0, Math.PI * 2);
      context.stroke();
    }
  } else if (stage.landmark === "festival") {
    for (let x = drift - 120; x < width + 220; x += 210) {
      context.fillRect(Math.round(x), ground - 84, 138, 20);
      context.fillRect(Math.round(x + 18), ground - 101, 104, 18);
      context.fillRect(Math.round(x + 42), ground - 116, 58, 16);
      context.strokeStyle = "rgba(247,237,207,.46)";
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(Math.round(x - 20), ground - 180);
      context.lineTo(Math.round(x + 162), ground - 150);
      context.stroke();
      for (let lantern = 0; lantern < 5; lantern += 1) {
        context.fillRect(Math.round(x + lantern * 37), ground - 176 + lantern * 6, 12, 18);
      }
    }
  } else if (stage.landmark === "rooftop") {
    for (let x = drift - 120; x < width + 220; x += 190) {
      const towerHeight = 110 + (Math.abs(Math.round(x / 190)) % 3) * 42;
      context.fillRect(Math.round(x), ground - towerHeight, 128, towerHeight);
      context.fillStyle = stage.sky;
      for (let windowIndex = 0; windowIndex < 6; windowIndex += 1) {
        context.fillRect(Math.round(x + 18 + (windowIndex % 2) * 48), ground - towerHeight + 24 + Math.floor(windowIndex / 2) * 28, 22, 11);
      }
      context.fillStyle = stage.accent;
      context.fillRect(Math.round(x + 56), ground - towerHeight - 38, 7, 38);
      context.fillRect(Math.round(x + 43), ground - towerHeight - 38, 34, 5);
    }
    context.strokeStyle = "rgba(173,220,237,.54)";
    context.lineWidth = 2;
    for (let rain = 0; rain < 34; rain += 1) {
      const rainX = (rain * 83 + now * 0.18) % (width + 80) - 40;
      const rainY = (rain * 47 + now * 0.32) % Math.max(1, ground - 30);
      context.beginPath();
      context.moveTo(Math.round(rainX), Math.round(rainY));
      context.lineTo(Math.round(rainX - 9), Math.round(rainY + 20));
      context.stroke();
    }
  } else if (stage.landmark === "snow") {
    for (let x = drift - 100; x < width + 220; x += 220) {
      context.beginPath();
      context.arc(Math.round(x + 58), ground, 66, Math.PI, Math.PI * 2);
      context.fill();
      context.fillRect(Math.round(x + 42), ground - 42, 32, 42);
      context.fillStyle = "rgba(247,253,255,.72)";
      context.fillRect(Math.round(x + 50), ground - 33, 16, 33);
      context.fillStyle = stage.accent;
      context.beginPath();
      context.moveTo(Math.round(x + 154), ground - 142);
      context.lineTo(Math.round(x + 112), ground - 62);
      context.lineTo(Math.round(x + 196), ground - 62);
      context.closePath();
      context.fill();
      context.fillRect(Math.round(x + 148), ground - 62, 12, 62);
    }
    context.fillStyle = "rgba(247,253,255,.72)";
    for (let snow = 0; snow < 30; snow += 1) {
      const snowX = (snow * 101 + Math.sin(now / 620 + snow) * 24) % (width + 60) - 30;
      const snowY = (snow * 61 + now * 0.025) % Math.max(1, ground - 20);
      context.fillRect(Math.round(snowX), Math.round(snowY), snow % 5 === 0 ? 4 : 2, snow % 5 === 0 ? 4 : 2);
    }
  } else {
    context.fillStyle = "rgba(247, 214, 164, .72)";
    context.beginPath();
    context.arc(width * 0.72, ground - 92, 74, Math.PI, Math.PI * 2);
    context.fill();
    context.fillStyle = stage.accent;
    for (let x = drift - 80; x < width + 180; x += 240) {
      context.fillRect(Math.round(x), ground - 135, 80, 135);
      context.fillRect(Math.round(x - 16), ground - 145, 112, 12);
    }
  }

  context.globalAlpha = 0.86;
  context.fillStyle = stage.accent;
  const markerDrift = -((camera * 0.72) % 210);
  for (let x = markerDrift - 80; x < width + 160; x += 210) {
    if (stage.landmark === "skyport") {
      context.fillRect(Math.round(x + 20), ground - 42, 5, 24);
      context.fillRect(Math.round(x + 12), ground - 42, 21, 5);
      context.fillRect(Math.round(x + 16), ground - 50, 13, 5);
    } else if (stage.landmark === "plaza") {
      context.fillRect(Math.round(x), ground - 14, 88, 10);
      context.fillStyle = "rgba(247,237,207,.78)";
      context.fillRect(Math.round(x + 12), ground - 11, 18, 4);
      context.fillRect(Math.round(x + 48), ground - 11, 28, 4);
      context.fillStyle = stage.accent;
    } else if (stage.landmark === "garden") {
      context.fillRect(Math.round(x + 10), ground - 22, 64, 8);
      context.fillRect(Math.round(x + 25), ground - 32, 34, 10);
    } else if (stage.landmark === "rail") {
      for (let arrow = 0; arrow < 3; arrow += 1) {
        context.save();
        context.translate(Math.round(x + arrow * 24), ground - 18);
        context.rotate(Math.PI / 4);
        context.fillRect(-7, -7, 14, 14);
        context.restore();
      }
    } else if (stage.landmark === "archive") {
      context.save();
      context.translate(Math.round(x + 36), ground - 62 + Math.sin(now / 300 + x) * 12);
      context.rotate(now / 900);
      context.strokeStyle = stage.accent;
      context.lineWidth = 4;
      context.strokeRect(-14, -14, 28, 28);
      context.restore();
    } else if (stage.landmark === "festival") {
      context.fillRect(Math.round(x), ground - 16, 86, 10);
      context.fillRect(Math.round(x + 17), ground - 25, 52, 9);
      context.fillStyle = "rgba(247,237,207,.78)";
      context.fillRect(Math.round(x + 34), ground - 30, 18, 5);
      context.fillStyle = stage.accent;
    } else if (stage.landmark === "rooftop") {
      context.fillRect(Math.round(x), ground - 7, 98, 5);
      context.strokeStyle = "rgba(213,233,244,.72)";
      context.lineWidth = 3;
      context.beginPath();
      context.ellipse(Math.round(x + 49), ground - 6, 34, 5, 0, 0, Math.PI * 2);
      context.stroke();
    } else if (stage.landmark === "snow") {
      context.save();
      context.translate(Math.round(x + 38), ground - 28);
      context.strokeStyle = stage.accent;
      context.lineWidth = 3;
      for (let arm = 0; arm < 3; arm += 1) {
        context.rotate(Math.PI / 3);
        context.beginPath();
        context.moveTo(-18, 0);
        context.lineTo(18, 0);
        context.stroke();
      }
      context.restore();
    } else {
      context.beginPath();
      context.moveTo(Math.round(x), ground - 24);
      context.lineTo(Math.round(x + 25), ground - 12);
      context.lineTo(Math.round(x), ground);
      context.closePath();
      context.fill();
      context.beginPath();
      context.moveTo(Math.round(x + 30), ground - 24);
      context.lineTo(Math.round(x + 55), ground - 12);
      context.lineTo(Math.round(x + 30), ground);
      context.closePath();
      context.fill();
    }
  }
  context.restore();
}

// The former manual platformer is intentionally not mounted; /game owns the automatic memory walk.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function WalkGame({
  journey,
  avatarUrl,
  onRestart,
}: {
  journey: MemoryJourney;
  avatarUrl: string | null;
  onRestart: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useRef(new Set<Direction>());
  const jumpQueued = useRef(false);
  const activeIndexRef = useRef(0);
  const player = useRef({ x: 64, y: 0, vy: 0, vx: 0, jumpsUsed: 0, initialized: false });
  const collectedShards = useRef(new Set<string>());
  const lastCollectAt = useRef(Number.NEGATIVE_INFINITY);
  const autoWalkRef = useRef(false);
  const pausedRef = useRef(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [finished, setFinished] = useState(false);
  const [discovered, setDiscovered] = useState(() => new Set([0]));
  const [shardsCollected, setShardsCollected] = useState(0);
  const [autoWalk, setAutoWalk] = useState(false);
  const [paused, setPaused] = useState(false);
  const avatarImage = useRef<HTMLImageElement | null>(null);
  const worldAtlasImage = useRef<HTMLImageElement | null>(null);
  const spriteAtlasImage = useRef<HTMLImageElement | null>(null);
  const platforms = useMemo(() => buildMemoryPlatforms(journey.moments.length), [journey.moments.length]);
  const activeMoment = journey.moments[activeIndex] ?? journey.moments[0];
  const activeStage = stageForMoment(activeIndex, journey.moments.length);
  const progress = journey.moments.length <= 1 ? 100 : Math.round((activeIndex / (journey.moments.length - 1)) * 100);
  const totalShards = journey.moments.length * 3;

  useEffect(() => {
    if (!avatarUrl) {
      avatarImage.current = null;
      return;
    }
    const image = new Image();
    image.src = avatarUrl;
    image.onload = () => { avatarImage.current = image; };
    return () => { avatarImage.current = null; };
  }, [avatarUrl]);

  useEffect(() => {
    const worldAtlas = new Image();
    const spriteAtlas = new Image();
    worldAtlas.decoding = "async";
    spriteAtlas.decoding = "async";
    worldAtlas.src = "/game/world-atlas.png";
    spriteAtlas.src = "/game/traveler-spritesheet.png";
    worldAtlas.onload = () => { worldAtlasImage.current = worldAtlas; };
    spriteAtlas.onload = () => { spriteAtlasImage.current = spriteAtlas; };
    return () => {
      worldAtlasImage.current = null;
      spriteAtlasImage.current = null;
    };
  }, []);

  const setDirection = useCallback((direction: Direction, pressed: boolean) => {
    if (direction === "jump" && pressed) jumpQueued.current = true;
    if (pressed) keys.current.add(direction);
    else keys.current.delete(direction);
  }, []);

  const toggleAutoWalk = useCallback(() => {
    setAutoWalk((current) => {
      autoWalkRef.current = !current;
      return !current;
    });
  }, []);

  const togglePaused = useCallback(() => {
    setPaused((current) => {
      pausedRef.current = !current;
      return !current;
    });
  }, []);

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if (["ArrowLeft", "ArrowRight", " ", "a", "A", "d", "D", "w", "W", "Shift", "p", "P", "r", "R"].includes(event.key)) {
        event.preventDefault();
      }
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") setDirection("left", true);
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") setDirection("right", true);
      if (!event.repeat && (event.key === " " || event.key.toLowerCase() === "w")) setDirection("jump", true);
      if (event.key === "Shift") setDirection("run", true);
      if (!event.repeat && event.key.toLowerCase() === "p") togglePaused();
      if (!event.repeat && event.key.toLowerCase() === "r") toggleAutoWalk();
    };
    const up = (event: KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") setDirection("left", false);
      if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") setDirection("right", false);
      if (event.key === " " || event.key.toLowerCase() === "w") setDirection("jump", false);
      if (event.key === "Shift") setDirection("run", false);
    };
    const pauseWhenHidden = () => {
      if (document.hidden) {
        pausedRef.current = true;
        setPaused(true);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      document.removeEventListener("visibilitychange", pauseWhenHidden);
    };
  }, [setDirection, toggleAutoWalk, togglePaused]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let previous = performance.now();
    const endX = 140 + Math.max(0, journey.moments.length - 1) * MEMORY_STEP + 250;

    const render = (now: number) => {
      const rect = canvas.getBoundingClientRect();
      const desiredDpr = Math.min(window.devicePixelRatio || 1, 3);
      const pixelBudgetDpr = Math.sqrt(20_000_000 / Math.max(1, rect.width * rect.height));
      const dpr = Math.max(1, Math.min(desiredDpr, pixelBudgetDpr));
      if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
      }
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      const width = rect.width;
      const height = rect.height;
      const ground = height - 96;
      const state = player.current;
      if (!state.initialized) {
        state.y = ground;
        state.initialized = true;
      }

      const rawDt = Math.min(0.035, Math.max(0.001, (now - previous) / 1000));
      previous = now;
      const dt = pausedRef.current ? 0 : rawDt;
      const physicsStage = stageForMoment(activeIndexRef.current, journey.moments.length);
      const left = keys.current.has("left");
      const right = keys.current.has("right") || (autoWalkRef.current && !left);
      const running = keys.current.has("run");
      const supportedByPlatform = platforms.some((platform) => (
        Math.abs(state.vy) < 1
        &&
        state.x >= platform.x - 18
        && state.x <= platform.x + platform.width + 18
        && Math.abs(state.y - (ground - platform.height)) < 2
      ));
      const onGround = Math.abs(state.y - ground) < 1 || supportedByPlatform;
      const stagePhysics = physicsStage.physics;
      const airControl = onGround ? 1 : stagePhysics.airControl;
      if (left !== right) state.vx += (right ? 1 : -1) * stagePhysics.acceleration * airControl * dt;
      else state.vx *= Math.pow(stagePhysics.friction, dt);
      const maxSpeed = running ? stagePhysics.baseSpeed + 90 : stagePhysics.baseSpeed;
      state.vx = Math.max(-maxSpeed, Math.min(maxSpeed, state.vx));
      if (onGround) state.jumpsUsed = 0;
      const canDoubleJump = stagePhysics.maxJumps > 1 && state.jumpsUsed < stagePhysics.maxJumps;
      if (jumpQueued.current && (onGround || canDoubleJump) && !pausedRef.current) {
        state.vy = stagePhysics.jumpVelocity;
        state.jumpsUsed += 1;
      }
      jumpQueued.current = false;
      state.vy += stagePhysics.gravity * dt;
      const previousY = state.y;
      state.x = Math.max(46, Math.min(endX, state.x + state.vx * dt));
      state.y += state.vy * dt;
      let landingPlatform: MemoryPlatform | null = null;
      if (state.vy >= 0) {
        for (const platform of platforms) {
          const platformTop = ground - platform.height;
          const withinPlatform = state.x >= platform.x - 18 && state.x <= platform.x + platform.width + 18;
          const crossedPlatform = previousY <= platformTop + 1 && state.y >= platformTop;
          if (withinPlatform && crossedPlatform && (!landingPlatform || platform.height > landingPlatform.height)) {
            landingPlatform = platform;
          }
        }
      }
      if (landingPlatform) {
        state.y = ground - landingPlatform.height;
        if (landingPlatform.bounce && !pausedRef.current) {
          state.vy = -360;
          state.jumpsUsed = 1;
        } else {
          state.vy = 0;
          state.jumpsUsed = 0;
        }
      } else if (state.y >= ground) {
        state.y = ground;
        state.vy = 0;
        state.jumpsUsed = 0;
      }

      const nextIndex = Math.max(0, Math.min(journey.moments.length - 1, Math.round((state.x - 140) / MEMORY_STEP)));
      if (nextIndex !== activeIndexRef.current) {
        activeIndexRef.current = nextIndex;
        setActiveIndex(nextIndex);
        setDiscovered((previousSet) => new Set(previousSet).add(nextIndex));
      }
      if (state.x >= endX - 4) setFinished(true);

      const camera = Math.max(0, Math.min(endX - width * 0.65, state.x - width * 0.28));
      context.clearRect(0, 0, width, height);

      const renderStage = stageForMoment(activeIndexRef.current, journey.moments.length);
      drawStageScenery(context, renderStage, camera, width, ground, now, worldAtlasImage.current);

      context.fillStyle = "rgba(250, 239, 209, .62)";
      for (let index = 0; index < 44; index += 1) {
        const starX = ((index * 173 + 67) % Math.max(1, Math.round(endX))) - camera * (0.08 + (index % 3) * 0.03);
        const x = ((starX % (width + 60)) + width + 60) % (width + 60) - 30;
        const y = 32 + ((index * 71) % Math.max(80, Math.round(height * 0.48)));
        const size = index % 7 === 0 ? 3 : 2;
        context.fillRect(Math.round(x), Math.round(y), size, size);
      }

      context.fillStyle = renderStage.ground;
      context.fillRect(0, ground, width, height - ground);
      context.fillStyle = `${renderStage.accent}99`;
      for (let x = -((camera * 0.65) % 64); x < width + 64; x += 64) {
        context.fillRect(Math.round(x), ground, 40, 6);
      }
      context.fillStyle = `${renderStage.accent}42`;
      for (const platform of platforms) {
        const platformX = platform.x - camera;
        if (platformX < -platform.width - 30 || platformX > width + 30) continue;
        const platformY = ground - platform.height;
        context.fillStyle = `${platform.accent}8f`;
        context.fillRect(Math.round(platformX), Math.round(platformY), platform.width, 16);
        context.fillStyle = `${platform.accent}42`;
        context.fillRect(Math.round(platformX + 12), Math.round(platformY + 16), 9, 24);
        context.fillRect(Math.round(platformX + platform.width - 21), Math.round(platformY + 16), 9, 24);
        if (platform.bounce) {
          context.fillStyle = "rgba(247,237,207,.78)";
          context.fillRect(Math.round(platformX + 18), Math.round(platformY + 4), platform.width - 36, 4);
        }
      }

      journey.moments.forEach((moment, index) => {
        const worldX = 140 + index * MEMORY_STEP;
        const x = worldX - camera;
        if (x < -220 || x > width + MEMORY_STEP) return;
        const momentStage = stageForMoment(index, journey.moments.length);
        const previousStage = index > 0 ? stageForMoment(index - 1, journey.moments.length) : null;
        if (!previousStage || momentStage.id !== previousStage.id) {
          context.fillStyle = `${momentStage.accent}aa`;
          context.fillRect(Math.round(x - 58), ground - 210, 12, 210);
          context.fillRect(Math.round(x + 46), ground - 210, 12, 210);
          context.fillRect(Math.round(x - 58), ground - 210, 116, 12);
          context.fillStyle = "rgba(247,237,207,.72)";
          context.fillRect(Math.round(x - 38), ground - 188, 76, 5);
        }

        for (let shard = 0; shard < 3; shard += 1) {
          const shardId = `${index}-${shard}`;
          const shardWorldX = worldX + 135 + shard * 128;
          const shardX = shardWorldX - camera;
          const shardY = ground - 74 - (shard % 2) * 28 + Math.sin(now / 280 + shard) * 5;
          if (!collectedShards.current.has(shardId)) {
            context.save();
            context.translate(Math.round(shardX), Math.round(shardY));
            context.rotate(Math.PI / 4);
            context.fillStyle = momentStage.accent;
            context.shadowColor = momentStage.accent;
            context.shadowBlur = 14;
            context.fillRect(-7, -7, 14, 14);
            context.restore();
            if (Math.abs(state.x - shardWorldX) < 34 && Math.abs(state.y - shardY) < 105) {
              collectedShards.current.add(shardId);
              lastCollectAt.current = now;
              setShardsCollected(collectedShards.current.size);
            }
          }
        }

        context.fillStyle = `${moment.accent}b8`;
        context.fillRect(Math.round(x - 3), ground - 148, 6, 148);
        context.fillRect(Math.round(x - 26), ground - 148, 52, 7);
        context.fillStyle = "#f8dfa2";
        context.fillRect(Math.round(x - 11), ground - 184, 22, 29);
        context.fillStyle = moment.accent;
        context.fillRect(Math.round(x - 7), ground - 178, 14, 18);

        for (let echo = 0; echo < moment.echoStrength; echo += 1) {
          drawEchoSprite(context, x + 72 + echo * 48, ground, "#b7b2d9", 0.26 + echo * 0.12, now + echo * 90);
        }
      });

      const companionMoment = journey.moments
        .map((moment, index) => ({ moment, distance: state.x - (140 + index * MEMORY_STEP) }))
        .filter(({ moment, distance }) => moment.companionNames.length > 0 && distance > 45 && distance < 760)
        .at(-1);
      if (companionMoment) {
        const count = Math.min(2, companionMoment.moment.echoStrength);
        for (let index = 0; index < count; index += 1) {
          drawEchoSprite(
            context,
            state.x - camera - 52 - index * 48,
            state.y,
            companionMoment.moment.accent,
            0.76 - index * 0.16,
            now + index * 110,
            index === 0 && companionMoment.moment.companionStrength === 3,
          );
          const companionName = companionMoment.moment.companionNames[index];
          if (companionName) {
            const shortName = companionName.length > 14 ? `${companionName.slice(0, 13)}…` : companionName;
            context.fillStyle = "rgba(247,237,207,.82)";
            context.font = "700 10px ui-monospace, monospace";
            context.textAlign = "center";
            context.fillText(shortName, Math.round(state.x - camera - 52 - index * 48), Math.round(state.y - 104));
            context.textAlign = "start";
          }
        }
      }

      const playerX = state.x - camera;
      const nearestGate = 140 + activeIndexRef.current * MEMORY_STEP;
      const isLinked = companionMoment?.moment.companionStrength === 3;
      const motion: SpriteMotion = pausedRef.current
        ? "idle"
        : state.x >= endX - 76
          ? "celebrate"
        : now - lastCollectAt.current < 430
          ? "collect"
          : state.y < ground - 2
            ? renderStage.id === "snow-globe" && state.jumpsUsed >= 2
              ? "doubleJump"
              : state.vy < 0 ? "jump" : "fall"
            : renderStage.id === "rainy-rooftop" && Math.abs(state.vx) > 72
              ? "slide"
            : Math.abs(state.vx) > 305
              ? "run"
              : isLinked
                ? "linked"
                : Math.abs(state.vx) > 16
                  ? "walk"
                  : Math.abs(state.x - nearestGate) < 82
                    ? "wave"
                    : renderStage.id === "festival-cloud"
                      ? "dance"
                    : "idle";
      drawPlayerSprite(context, playerX, state.y, motion, state.vx, now, spriteAtlasImage.current);

      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [journey, avatarUrl, platforms]);

  const backgroundStyle = activeMoment?.previewUrl
    ? { backgroundImage: `url(${activeMoment.previewUrl})` }
    : { backgroundColor: activeMoment?.accent ?? "#272343" };
  const shellStyle = {
    "--stage-sky": activeStage.sky,
    "--stage-accent": activeStage.accent,
    "--stage-ground": activeStage.ground,
  } as CSSProperties;

  return (
    <main className="game-shell" style={shellStyle}>
      <div className="game-background" style={backgroundStyle} aria-hidden="true" />
      <div className="game-tint" aria-hidden="true" />
      <header className="game-hud">
        <div className="hud-brand"><span>VR</span><b>VRCHAT RECAP</b></div>
        <div className="hud-date">
          <small>{activeStage.number} · {activeStage.title}</small>
          <strong>{formatDate(activeMoment.date)}</strong>
        </div>
        <div className="hud-actions">
          <button type="button" className="hud-button" aria-pressed={paused} onClick={togglePaused}>{paused ? "계속" : "PAUSE"}</button>
          <button type="button" className="hud-button" onClick={onRestart}>RECAP</button>
        </div>
      </header>

      <canvas ref={canvasRef} className="game-canvas" aria-label="추억 산책 게임 화면" />

      <div className="stage-banner" key={activeStage.id}>
        <span>STAGE {activeStage.number}</span>
        <b>{activeStage.title}</b>
        <small>{activeStage.subtitle}</small>
      </div>

      <aside className="memory-note" style={{ borderColor: activeMoment.accent }}>
        <span className="note-kicker">{activeStage.title} · MEMORY {String(activeIndex + 1).padStart(2, "0")}</span>
        <strong>{formatDate(activeMoment.date)}</strong>
        {activeMoment.worldName && <span className="world-label">WORLD · {activeMoment.worldName}</span>}
        <p>이 시간대에 {activeMoment.photoCount.toLocaleString("ko-KR")}장의 장면이 이어졌어요.</p>
        {activeMoment.companionNames.length > 0 && (
          <div className="companion-line"><span>WITH</span><b>{activeMoment.companionNames.join(" · ")}</b></div>
        )}
        <span className="stage-mechanic">{activeStage.mechanic}</span>
        <div className="echo-meter" aria-label={`메아리 강도 ${activeMoment.echoStrength}단계`}>
          {Array.from({ length: 3 }, (_, index) => (
            <i key={index} className={index < activeMoment.echoStrength ? "active" : ""} />
          ))}
          <span>{activeMoment.companionNames.length ? "여러 인스턴스에서 다시 만난 친구" : "스쳐간 사람은 이곳에 머물러요"}</span>
        </div>
      </aside>

      <div className="timeline-hud">
        <span>{formatDate(journey.startDate, true)}</span>
        <div className="timeline-track"><i style={{ width: `${progress}%` }} /></div>
        <span>{formatDate(journey.endDate, true)}</span>
        <b className="shard-count">◆ {shardsCollected} / {totalShards}</b>
        <b>{discovered.size} / {journey.moments.length}</b>
      </div>

      <div className="game-controls" aria-label="게임 조작">
        <button
          aria-label="왼쪽으로 걷기"
          onPointerDown={() => setDirection("left", true)}
          onPointerUp={() => setDirection("left", false)}
          onPointerLeave={() => setDirection("left", false)}
          onPointerCancel={() => setDirection("left", false)}
        >←</button>
        <button
          aria-label="오른쪽으로 걷기"
          onPointerDown={() => setDirection("right", true)}
          onPointerUp={() => setDirection("right", false)}
          onPointerLeave={() => setDirection("right", false)}
          onPointerCancel={() => setDirection("right", false)}
        >→</button>
        <button
          className="jump-button"
          aria-label="점프"
          onPointerDown={() => setDirection("jump", true)}
          onPointerUp={() => setDirection("jump", false)}
          onPointerCancel={() => setDirection("jump", false)}
        >JUMP</button>
        <button
          className="auto-button"
          aria-label="자동 걷기"
          aria-pressed={autoWalk}
          onClick={toggleAutoWalk}
        >{autoWalk ? "AUTO ON" : "AUTO"}</button>
      </div>

      <div className="keyboard-hint"><kbd>A</kbd><kbd>D</kbd> 걷기 <kbd>SHIFT</kbd> 달리기 <kbd>SPACE</kbd> 점프 <kbd>R</kbd> 자동 <kbd>P</kbd> 멈춤</div>

      {paused && (
        <div className="pause-card" role="status">
          <span>PAUSED</span>
          <b>잠시 이 밤에 머무는 중</b>
          <small>P 키나 ‘계속’을 누르면 다시 걸어요.</small>
        </div>
      )}

      {finished && (
        <section className="ending-card" role="dialog" aria-modal="true" aria-labelledby="ending-title">
          <span className="eyebrow">THE WALK CONTINUES</span>
          <h2 id="ending-title">여기까지 함께 걸어왔어요.</h2>
          <p>
            {formatDate(journey.startDate)}부터 {formatDate(journey.endDate)}까지,<br />
            {journey.totalPhotos.toLocaleString("ko-KR")}장의 순간이 {journey.moments.length}개의 길이 되었습니다.
            <br />기억 조각 {shardsCollected}개와 아홉 시대를 통과했어요.
          </p>
          <div className="ending-actions">
            <button type="button" className="primary-button" onClick={() => {
              player.current = { x: 64, y: 0, vy: 0, vx: 0, jumpsUsed: 0, initialized: false };
              activeIndexRef.current = 0;
              collectedShards.current.clear();
              setActiveIndex(0);
              setShardsCollected(0);
              setFinished(false);
            }}>처음부터 다시 걷기</button>
            <button type="button" className="secondary-button" onClick={() => exportJourney(journey)}>내 타임캡슐(.json) 저장</button>
          </div>
        </section>
      )}
    </main>
  );
}

export default function MemoryWalk() {
  const [phase, setPhase] = useState<AppPhase>("intro");
  const [progress, setProgress] = useState<AnalysisProgress>(emptyProgress);
  const [journey, setJourney] = useState<MemoryJourney | null>(null);
  const [avatarSpriteUrl, setAvatarSpriteUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const journeyRef = useRef<MemoryJourney | null>(null);

  useEffect(() => { journeyRef.current = journey; }, [journey]);
  useEffect(() => () => {
    releaseJourney(journeyRef.current);
  }, []);

  const startAnalysis = useCallback(async (files: Iterable<File>) => {
    setError(null);
    setPhase("analyzing");
    setProgress(emptyProgress);
    try {
      const nextJourney = await analyzeFiles(files, setProgress);
      releaseJourney(journey);
      setJourney(nextJourney);
      setPhase("recap");
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "폴더를 읽지 못했습니다.");
      setPhase("intro");
    }
  }, [journey]);

  const chooseFolder = useCallback(async () => {
    const picker = (window as FolderPickerWindow).showDirectoryPicker;
    if (!picker) {
      folderInput.current?.click();
      return;
    }
    try {
      const handle = await picker();
      setPhase("analyzing");
      setProgress({ current: 0, total: 1, label: "폴더 안의 사진을 찾는 중" });
      const files = await readDirectory(handle);
      await startAnalysis(files);
    } catch (pickerError) {
      if (pickerError instanceof DOMException && pickerError.name === "AbortError") return;
      setError("이 브라우저에서는 폴더를 직접 열 수 없어요.");
      setPhase("intro");
    }
  }, [startAnalysis]);

  const selectAvatar = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      setError(null);
      setAvatarSpriteUrl(await createAvatarPixelSprite(file));
    } catch (avatarError) {
      setError(avatarError instanceof Error ? avatarError.message : "아바타 픽셀 캐릭터를 만들지 못했습니다.");
    }
  }, []);

  const demo = useMemo(() => createPublicSampleJourney(), []);
  const openGame = useCallback((selectedJourney: MemoryJourney) => {
    const session = createGameSession(selectedJourney, avatarSpriteUrl);
    sessionStorage.setItem(GAME_SESSION_KEY, JSON.stringify(session));
    window.location.assign("/game");
  }, [avatarSpriteUrl]);

  if (phase === "analyzing") return <Analyzing progress={progress} />;
  if (phase === "recap" && journey) {
    return <RecapDeck journey={journey} onPlay={() => openGame(journey)} onRestart={() => setPhase("intro")} />;
  }

  return (
    <>
      <Intro
        onPickFolder={chooseFolder}
        onOpenFallback={() => folderInput.current?.click()}
        onDemo={() => openGame(demo)}
        avatarSpriteUrl={avatarSpriteUrl}
        onAvatar={selectAvatar}
        error={error}
      />
      <input
        ref={folderInput}
        className="visually-hidden"
        type="file"
        accept="image/*"
        multiple
        {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
        onChange={(event) => {
          if (event.target.files?.length) void startAnalysis(event.target.files);
          event.target.value = "";
        }}
      />
    </>
  );
}
