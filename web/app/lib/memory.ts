import {
  readEmbeddedPhotoMetadata,
  type EmbeddedPhotoMetadata,
  type EmbeddedPlayer,
} from "./pngMetadata";
import {
  createLocalAvatarDetector,
  LOCAL_VISION_MODEL,
  type LocalAvatarDetector,
} from "./localVision";

export type AnalysisProgress = {
  current: number;
  total: number;
  label: string;
};

export type MemoryMoment = {
  id: string;
  date: string;
  photoCount: number;
  accent: string;
  motif: number;
  echoStrength: number;
  fingerprint: number[];
  worldName?: string;
  companionNames: string[];
  companionStrength: number;
  memoryPixels: number[];
  previewUrl?: string;
};

export type YearRecap = {
  year: number;
  photos: number;
  activeDays: number;
};

export type MotifRecap = {
  motif: number;
  appearances: number;
  accent: string;
};

export type RecapAward = {
  id: string;
  title: string;
  value: string;
  description: string;
};

export type WorldRecap = {
  displayName: string;
  photoCount: number;
  visitCount: number;
};

export type CompanionRecap = {
  activeDays: number;
  closeness: number;
  displayName: string;
  instanceCount: number;
  photoCount: number;
  visualEvidencePhotos: number;
};

export type RecapStats = {
  activeDays: number;
  totalSessions: number;
  activeYears: YearRecap[];
  busiestDay: string;
  busiestDayPhotos: number;
  favoriteHour: number;
  lateNightPercent: number;
  weekendPercent: number;
  favoriteSeason: string;
  longestStreakDays: number;
  longestSessionPhotos: number;
  recapPersona: string;
  awards: RecapAward[];
  topMotifs: MotifRecap[];
  topWorlds: WorldRecap[];
  companions: CompanionRecap[];
  metadataCoverage: number;
  visuallyAnalyzed: number;
  localModel: string;
  localModelStatus: "ready" | "unavailable";
  modelAnalyzed: number;
  avatarScenes: number;
  avatarDetections: number;
};

export type MemoryJourney = {
  schema: "vrchat-recap/v5";
  generatedAt: string;
  totalPhotos: number;
  startDate: string;
  endDate: string;
  analysisMs: number;
  moments: MemoryMoment[];
  stats: RecapStats;
};

type PhotoMeta = {
  file: File;
  date: Date;
  metadata: EmbeddedPhotoMetadata | null;
  visual: {
    accent: string;
    avatarCount: number;
    fingerprint: number[];
    highestAvatarScore: number;
    pixels: number[];
  };
};

type Session = {
  start: Date;
  end: Date;
  photos: PhotoMeta[];
};

const MAX_MOMENTS = 64;
const MIN_STAGE_CHAPTERS = 9;
const SESSION_GAP_MS = 4 * 60 * 60 * 1000;
const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i;

const waitForPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

export function parseScreenshotDate(name: string, lastModified: number): Date {
  const match = name.match(
    /(20\d{2})[-_.](\d{2})[-_.](\d{2})[ T_-](\d{2})[-_.:](\d{2})[-_.:](\d{2})/,
  );

  if (match) {
    const [, year, month, day, hour, minute, second] = match;
    const parsed = new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    );
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }

  const fallback = new Date(lastModified || Date.now());
  return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
}

export function collectImageFiles(files: Iterable<File>): File[] {
  return Array.from(files).filter(
    (file) => file.type.startsWith("image/") || IMAGE_EXTENSION.test(file.name),
  );
}

function groupIntoSessions(photos: PhotoMeta[]): Session[] {
  const sessions: Session[] = [];

  for (const photo of photos) {
    const previous = sessions.at(-1);
    const previousDay = previous?.end.toDateString();
    const sameDay = previousDay === photo.date.toDateString();
    const closeEnough =
      previous && photo.date.getTime() - previous.end.getTime() <= SESSION_GAP_MS;

    if (!previous || !sameDay || !closeEnough) {
      sessions.push({ start: photo.date, end: photo.date, photos: [photo] });
    } else {
      previous.photos.push(photo);
      previous.end = photo.date;
    }
  }

  return sessions;
}

function ensureStageSessions(photos: PhotoMeta[], sessions: Session[]): Session[] {
  if (sessions.length >= MIN_STAGE_CHAPTERS || photos.length < MIN_STAGE_CHAPTERS) return sessions;
  const chapters: Session[] = [];
  for (let index = 0; index < MIN_STAGE_CHAPTERS; index += 1) {
    const start = Math.floor((index * photos.length) / MIN_STAGE_CHAPTERS);
    const end = Math.max(start + 1, Math.floor(((index + 1) * photos.length) / MIN_STAGE_CHAPTERS));
    const chapterPhotos = photos.slice(start, end);
    chapters.push({
      start: chapterPhotos[0].date,
      end: chapterPhotos.at(-1)!.date,
      photos: chapterPhotos,
    });
  }
  return chapters;
}

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildRecapStats(
  photos: PhotoMeta[],
  sessions: Session[],
): Omit<
  RecapStats,
  | "topMotifs"
  | "topWorlds"
  | "companions"
  | "metadataCoverage"
  | "visuallyAnalyzed"
  | "localModel"
  | "localModelStatus"
  | "modelAnalyzed"
  | "avatarScenes"
  | "avatarDetections"
> {
  const dayCounts = new Map<string, number>();
  const yearCounts = new Map<number, { photos: number; days: Set<string> }>();
  const hourCounts = Array.from({ length: 24 }, () => 0);
  const seasonCounts = [0, 0, 0, 0];
  let lateNightPhotos = 0;
  let weekendPhotos = 0;

  photos.forEach(({ date }) => {
    const day = localDayKey(date);
    const year = date.getFullYear();
    const yearEntry = yearCounts.get(year) ?? { photos: 0, days: new Set<string>() };
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    yearEntry.photos += 1;
    yearEntry.days.add(day);
    yearCounts.set(year, yearEntry);
    hourCounts[date.getHours()] += 1;
    seasonCounts[Math.floor(((date.getMonth() + 1) % 12) / 3)] += 1;
    if (date.getHours() < 5) lateNightPhotos += 1;
    if (date.getDay() === 0 || date.getDay() === 6) weekendPhotos += 1;
  });

  const [busiestDay, busiestDayPhotos] = Array.from(dayCounts.entries()).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0] ?? [localDayKey(new Date()), 0];
  const favoriteHour = hourCounts.reduce(
    (best, count, hour) => (count > hourCounts[best] ? hour : best),
    0,
  );

  const orderedDays = Array.from(dayCounts.keys())
    .map((day) => {
      const [year, month, date] = day.split("-").map(Number);
      return Date.UTC(year, month - 1, date);
    })
    .sort((a, b) => a - b);
  let longestStreakDays = orderedDays.length ? 1 : 0;
  let currentStreak = longestStreakDays;
  for (let index = 1; index < orderedDays.length; index += 1) {
    if (orderedDays[index] - orderedDays[index - 1] === 86_400_000) {
      currentStreak += 1;
      longestStreakDays = Math.max(longestStreakDays, currentStreak);
    } else {
      currentStreak = 1;
    }
  }

  const recapPersona = favoriteHour < 5
    ? "새벽의 포털 수호자"
    : favoriteHour < 11
      ? "아침 월드 개척자"
      : favoriteHour < 18
        ? "낮의 기억 수집가"
        : favoriteHour < 23
          ? "밤의 로비 여행자"
          : "자정의 마지막 손님";
  const lateNightPercent = Math.round((lateNightPhotos / Math.max(1, photos.length)) * 100);
  const weekendPercent = Math.round((weekendPhotos / Math.max(1, photos.length)) * 100);
  const favoriteSeasonIndex = seasonCounts.reduce(
    (best, count, index) => (count > seasonCounts[best] ? index : best),
    0,
  );
  const favoriteSeason = ["봄", "여름", "가을", "겨울"][favoriteSeasonIndex];
  const longestSessionPhotos = sessions.reduce(
    (longest, session) => Math.max(longest, session.photos.length),
    0,
  );
  const archiveTitle = photos.length >= 10_000
    ? "COSMIC ARCHIVE"
    : photos.length >= 3_000
      ? "MEMORY GALAXY"
      : "MEMORY KEEPER";
  const awards: RecapAward[] = [
    {
      id: "archive",
      title: archiveTitle,
      value: `${photos.length.toLocaleString("ko-KR")}장`,
      description: "작은 장면들을 하나의 별자리로 남겼어요.",
    },
    {
      id: "return",
      title: "PORTAL REGULAR",
      value: `${dayCounts.size.toLocaleString("ko-KR")}일`,
      description: "다시 접속해 새로운 기억을 이어간 날이에요.",
    },
    {
      id: "time",
      title: lateNightPercent >= 35 ? "NIGHT OWL" : "TIME TRAVELER",
      value: `${lateNightPercent}%`,
      description: lateNightPercent >= 35 ? "새벽의 월드를 오래 지켰어요." : "여러 시간대의 월드를 여행했어요.",
    },
    {
      id: "streak",
      title: "CONNECTED DAYS",
      value: `${longestStreakDays}일`,
      description: "가장 오래 이어진 접속의 리듬이에요.",
    },
    {
      id: "season",
      title: "SEASON CALLING",
      value: favoriteSeason,
      description: `${favoriteSeason}에 가장 많은 장면을 남겼어요.`,
    },
  ];

  return {
    activeDays: dayCounts.size,
    totalSessions: sessions.length,
    activeYears: Array.from(yearCounts.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([year, value]) => ({ year, photos: value.photos, activeDays: value.days.size })),
    busiestDay: new Date(`${busiestDay}T12:00:00`).toISOString(),
    busiestDayPhotos,
    favoriteHour,
    lateNightPercent,
    weekendPercent,
    favoriteSeason,
    longestStreakDays,
    longestSessionPhotos,
    recapPersona,
    awards,
  };
}

function collapseSessions(sessions: Session[], limit: number): Session[] {
  if (sessions.length <= limit) return sessions;
  const chapters: Session[] = [];
  for (let index = 0; index < limit; index += 1) {
    const start = Math.floor((index * sessions.length) / limit);
    const end = Math.max(start + 1, Math.floor(((index + 1) * sessions.length) / limit));
    const group = sessions.slice(start, end);
    chapters.push({
      start: group[0].start,
      end: group.at(-1)!.end,
      photos: group.flatMap((session) => session.photos),
    });
  }
  return chapters;
}

type CompanionCandidate = CompanionRecap & { key: string };

function personKey(id: string | undefined, displayName: string): string {
  return id || `name:${displayName.toLocaleLowerCase("en-US")}`;
}

function buildMetadataSummary(photos: PhotoMeta[]): {
  candidateMap: Map<string, CompanionCandidate>;
  companions: CompanionRecap[];
  metadataCoverage: number;
  topWorlds: WorldRecap[];
} {
  const people = new Map<string, {
    days: Set<string>;
    displayName: string;
    instances: Set<string>;
    photos: number;
    visualEvidencePhotos: number;
  }>();
  const worlds = new Map<string, {
    displayName: string;
    instances: Set<string>;
    photos: number;
  }>();
  let metadataPhotos = 0;

  for (const photo of photos) {
    const metadata = photo.metadata;
    if (!metadata) continue;
    metadataPhotos += 1;
    const fallbackInstance = `${metadata.worldId ?? metadata.worldName ?? "unknown"}|${localDayKey(photo.date)}|${Math.floor(photo.date.getHours() / 4)}`;
    const instanceKey = metadata.instanceId || fallbackInstance;
    if (metadata.worldName) {
      const worldKey = metadata.worldId || `name:${metadata.worldName.toLocaleLowerCase("en-US")}`;
      const entry = worlds.get(worldKey) ?? {
        displayName: metadata.worldName,
        instances: new Set<string>(),
        photos: 0,
      };
      entry.photos += 1;
      entry.instances.add(instanceKey);
      worlds.set(worldKey, entry);
    }

    const participants = new Map<string, EmbeddedPlayer>();
    for (const player of metadata.players) {
      const isAuthor = (metadata.authorId && player.id === metadata.authorId)
        || (!player.id && metadata.authorName === player.displayName);
      if (isAuthor) continue;
      const key = personKey(player.id, player.displayName);
      participants.set(key, player);
    }
    const hasStrongVisualEvidence = photo.visual.avatarCount > 0
      && (participants.size === 1 || photo.visual.avatarCount >= participants.size);
    for (const [key, player] of participants) {
      const entry = people.get(key) ?? {
        days: new Set<string>(),
        displayName: player.displayName,
        instances: new Set<string>(),
        photos: 0,
        visualEvidencePhotos: 0,
      };
      entry.days.add(localDayKey(photo.date));
      entry.instances.add(instanceKey);
      entry.photos += 1;
      if (hasStrongVisualEvidence) entry.visualEvidencePhotos += 1;
      people.set(key, entry);
    }
  }

  const candidates = Array.from(people.entries())
    .filter(([, value]) => value.instances.size >= 3 && value.days.size >= 2)
    .map(([key, value]): CompanionCandidate => ({
      key,
      activeDays: value.days.size,
      closeness: value.instances.size >= 12 ? 3 : value.instances.size >= 6 ? 2 : 1,
      displayName: value.displayName,
      instanceCount: value.instances.size,
      photoCount: value.photos,
      visualEvidencePhotos: value.visualEvidencePhotos,
    }))
    .sort((a, b) => b.visualEvidencePhotos - a.visualEvidencePhotos
      || b.instanceCount - a.instanceCount
      || b.activeDays - a.activeDays
      || b.photoCount - a.photoCount);
  const candidateMap = new Map(candidates.map((candidate) => [candidate.key, candidate]));

  return {
    candidateMap,
    companions: candidates.slice(0, 8).map((candidate) => ({
      activeDays: candidate.activeDays,
      closeness: candidate.closeness,
      displayName: candidate.displayName,
      instanceCount: candidate.instanceCount,
      photoCount: candidate.photoCount,
      visualEvidencePhotos: candidate.visualEvidencePhotos,
    })),
    metadataCoverage: Math.round((metadataPhotos / Math.max(1, photos.length)) * 100),
    topWorlds: Array.from(worlds.values())
      .map((world) => ({
        displayName: world.displayName,
        photoCount: world.photos,
        visitCount: world.instances.size,
      }))
      .sort((a, b) => b.visitCount - a.visitCount || b.photoCount - a.photoCount)
      .slice(0, 6),
  };
}

function colorDistance(a: number[], b: number[]): number {
  if (!a.length || !b.length) return 1;
  let distance = 0;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const delta = a[index] - b[index];
    distance += delta * delta;
  }
  return Math.sqrt(distance / Math.min(a.length, b.length));
}

function rgbToHex(red: number, green: number, blue: number): string {
  const channel = (value: number) =>
    Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0");
  return `#${channel(red)}${channel(green)}${channel(blue)}`;
}

async function readFingerprint(file: File): Promise<{
  accent: string;
  fingerprint: number[];
  pixels: number[];
}> {
  const bitmap = await createImageBitmap(file, {
    resizeWidth: 48,
    resizeHeight: 27,
    resizeQuality: "low",
  });
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 9;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("브라우저에서 이미지 캔버스를 만들 수 없습니다.");
  }

  try {
    context.imageSmoothingEnabled = true;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }

  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  const quantizedPixels: number[] = [];
  for (let offset = 0; offset < pixels.length; offset += 4) {
    quantizedPixels.push(
      Math.round(pixels[offset] / 17),
      Math.round(pixels[offset + 1] / 17),
      Math.round(pixels[offset + 2] / 17),
    );
  }
  const fingerprint: number[] = [];
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;
  let horizontalEdges = 0;
  let verticalEdges = 0;
  let horizontalEdgeCount = 0;
  let verticalEdgeCount = 0;
  const quantize = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * 15) / 15;

  for (let blockY = 0; blockY < 3; blockY += 1) {
    for (let blockX = 0; blockX < 4; blockX += 1) {
      let blockRed = 0;
      let blockGreen = 0;
      let blockBlue = 0;
      let blockCount = 0;
      for (let y = blockY * 3; y < blockY * 3 + 3; y += 1) {
        for (let x = blockX * 4; x < blockX * 4 + 4; x += 1) {
          const offset = (y * canvas.width + x) * 4;
          const alpha = pixels[offset + 3] / 255;
          blockRed += pixels[offset] * alpha;
          blockGreen += pixels[offset + 1] * alpha;
          blockBlue += pixels[offset + 2] * alpha;
          blockCount += alpha;
        }
      }
      const divisor = Math.max(1, blockCount * 255);
      fingerprint.push(
        quantize(blockRed / divisor),
        quantize(blockGreen / divisor),
        quantize(blockBlue / divisor),
      );
      red += blockRed;
      green += blockGreen;
      blue += blockBlue;
      count += blockCount;
    }
  }

  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const offset = (y * canvas.width + x) * 4;
      if (x + 1 < canvas.width) {
        const next = offset + 4;
        horizontalEdges += Math.abs(pixels[offset] - pixels[next])
          + Math.abs(pixels[offset + 1] - pixels[next + 1])
          + Math.abs(pixels[offset + 2] - pixels[next + 2]);
        horizontalEdgeCount += 3;
      }
      if (y + 1 < canvas.height) {
        const next = offset + canvas.width * 4;
        verticalEdges += Math.abs(pixels[offset] - pixels[next])
          + Math.abs(pixels[offset + 1] - pixels[next + 1])
          + Math.abs(pixels[offset + 2] - pixels[next + 2]);
        verticalEdgeCount += 3;
      }
    }
  }

  const divisor = Math.max(1, count);
  const averageRed = red / divisor;
  const averageGreen = green / divisor;
  const averageBlue = blue / divisor;
  const highest = Math.max(averageRed, averageGreen, averageBlue);
  const lowest = Math.min(averageRed, averageGreen, averageBlue);
  const luminance = (averageRed * 0.2126 + averageGreen * 0.7152 + averageBlue * 0.0722) / 255;
  const saturation = highest ? (highest - lowest) / highest : 0;
  fingerprint.push(
    quantize(luminance),
    quantize(saturation),
    quantize(horizontalEdges / Math.max(1, horizontalEdgeCount * 255)),
    quantize(verticalEdges / Math.max(1, verticalEdgeCount * 255)),
  );
  const lift = 1.25;

  return {
    accent: rgbToHex(
      averageRed * lift + 20,
      averageGreen * lift + 16,
      averageBlue * lift + 24,
    ),
    fingerprint,
    pixels: quantizedPixels,
  };
}

function assignMotifs(
  samples: Array<{ accent: string; fingerprint: number[] }>,
): number[] {
  const centroids: number[][] = [];
  const counts: number[] = [];

  return samples.map(({ fingerprint }) => {
    let bestIndex = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    centroids.forEach((centroid, index) => {
      const distance = colorDistance(fingerprint, centroid);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });

    if (bestIndex < 0 || bestDistance > 0.19) {
      centroids.push([...fingerprint]);
      counts.push(1);
      return centroids.length - 1;
    }

    counts[bestIndex] += 1;
    const weight = 1 / counts[bestIndex];
    centroids[bestIndex] = centroids[bestIndex].map(
      (value, index) => value * (1 - weight) + fingerprint[index] * weight,
    );
    return bestIndex;
  });
}

function aggregateFingerprint(photos: PhotoMeta[]): number[] {
  const dimensions = photos.reduce((largest, photo) => Math.max(largest, photo.visual.fingerprint.length), 0);
  if (!dimensions) return Array.from({ length: 40 }, () => 0.4);
  const totals = Array.from({ length: dimensions }, () => 0);
  for (const photo of photos) {
    for (let index = 0; index < dimensions; index += 1) {
      totals[index] += photo.visual.fingerprint[index] ?? 0;
    }
  }
  return totals.map((total) => Number((total / Math.max(1, photos.length)).toFixed(3)));
}

function aggregateMemoryPixels(photos: PhotoMeta[]): number[] {
  const dimensions = 16 * 9 * 3;
  const totals = Array.from({ length: dimensions }, () => 0);
  for (const photo of photos) {
    for (let index = 0; index < dimensions; index += 1) {
      totals[index] += photo.visual.pixels[index] ?? 6;
    }
  }
  return totals.map((total) => Math.max(0, Math.min(15, Math.round(total / Math.max(1, photos.length)))));
}

function aggregateAccent(photos: PhotoMeta[]): string {
  let red = 0;
  let green = 0;
  let blue = 0;
  for (const photo of photos) {
    const accent = photo.visual.accent.replace("#", "").padEnd(6, "0");
    red += Number.parseInt(accent.slice(0, 2), 16) || 0;
    green += Number.parseInt(accent.slice(2, 4), 16) || 0;
    blue += Number.parseInt(accent.slice(4, 6), 16) || 0;
  }
  const divisor = Math.max(1, photos.length);
  return rgbToHex(red / divisor, green / divisor, blue / divisor);
}

function dominantWorldName(photos: PhotoMeta[]): string | undefined {
  const counts = new Map<string, number>();
  for (const photo of photos) {
    const name = photo.metadata?.worldName;
    if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0]?.[0];
}

function chapterCompanions(
  photos: PhotoMeta[],
  candidateMap: Map<string, CompanionCandidate>,
): { names: string[]; strength: number } {
  const appearances = new Map<string, number>();
  for (const photo of photos) {
    const seen = new Set<string>();
    for (const player of photo.metadata?.players ?? []) {
      const key = personKey(player.id, player.displayName);
      if (!candidateMap.has(key) || seen.has(key)) continue;
      seen.add(key);
      appearances.set(key, (appearances.get(key) ?? 0) + 1);
    }
  }
  const candidates = Array.from(appearances.entries())
    .map(([key, count]) => ({ candidate: candidateMap.get(key)!, count }))
    .sort((a, b) => b.count - a.count || b.candidate.closeness - a.candidate.closeness);
  return {
    names: candidates.slice(0, 2).map(({ candidate }) => candidate.displayName),
    strength: candidates.reduce((strongest, { candidate }) => Math.max(strongest, candidate.closeness), 0),
  };
}

export async function analyzeFiles(
  sourceFiles: Iterable<File>,
  onProgress: (progress: AnalysisProgress) => void,
): Promise<MemoryJourney> {
  const startedAt = performance.now();
  const files = collectImageFiles(sourceFiles);
  if (!files.length) throw new Error("이미지 파일을 찾지 못했습니다.");

  const photos: PhotoMeta[] = [];
  let visuallyAnalyzed = 0;
  let localDetector: LocalAvatarDetector | null = null;
  let localModelStatus: RecapStats["localModelStatus"] = "unavailable";
  let modelAnalyzed = 0;
  let avatarScenes = 0;
  let avatarDetections = 0;
  onProgress({ current: 0, total: files.length, label: "기기 안의 인물 모델을 불러오는 중" });
  try {
    localDetector = await createLocalAvatarDetector();
    localModelStatus = "ready";
  } catch {
    localDetector = null;
  }

  onProgress({ current: 0, total: files.length, label: "모든 장면을 로컬에서 준비하는 중" });
  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      let metadata: EmbeddedPhotoMetadata | null = null;
      try {
        metadata = await readEmbeddedPhotoMetadata(file);
      } catch {
        metadata = null;
      }
      const embeddedDate = metadata?.captureDate ? new Date(metadata.captureDate) : null;
      const date = embeddedDate && !Number.isNaN(embeddedDate.getTime())
        ? embeddedDate
        : parseScreenshotDate(file.name, file.lastModified);
      let visual: PhotoMeta["visual"];
      try {
        const fingerprint = await readFingerprint(file);
        visual = {
          ...fingerprint,
          avatarCount: 0,
          highestAvatarScore: 0,
        };
        visuallyAnalyzed += 1;
      } catch {
        visual = {
          accent: "#8174b9",
          avatarCount: 0,
          fingerprint: Array.from({ length: 40 }, () => 0.4),
          highestAvatarScore: 0,
          pixels: Array.from({ length: 16 * 9 * 3 }, () => 6),
        };
      }
      if (localDetector) {
        try {
          const modelResult = await localDetector.analyze(file);
          visual.avatarCount = modelResult.avatarCount;
          visual.highestAvatarScore = modelResult.highestScore;
          modelAnalyzed += 1;
          avatarDetections += modelResult.avatarCount;
          if (modelResult.avatarCount > 0) avatarScenes += 1;
        } catch {
          // Keep the visual fingerprint and metadata result for an undecodable image.
        }
      }
      photos.push({ file, date, metadata, visual });
      onProgress({
        current: index + 1,
        total: files.length,
        label: localModelStatus === "ready"
          ? `전체 장면 ${index + 1} / ${files.length} · 로컬 AI + 메타데이터`
          : `전체 장면 ${index + 1} / ${files.length} · 메타데이터 + 12-bit 양자화`,
      });
      await waitForPaint();
    }
  } finally {
    localDetector?.close();
  }
  photos.sort((a, b) => a.date.getTime() - b.date.getTime());

  const sessions = groupIntoSessions(photos);
  const recapStats = buildRecapStats(photos, sessions);
  const metadataSummary = buildMetadataSummary(photos);
  const journeySessions = ensureStageSessions(photos, sessions);
  const chapters = collapseSessions(journeySessions, MAX_MOMENTS);
  const samples: Array<{
    session: Session;
    representative: PhotoMeta;
    accent: string;
    fingerprint: number[];
    memoryPixels: number[];
    worldName?: string;
    companionNames: string[];
    companionStrength: number;
  }> = [];

  for (const session of chapters) {
    const fingerprint = aggregateFingerprint(session.photos);
    const representative = session.photos.reduce((closest, photo) => (
      colorDistance(photo.visual.fingerprint, fingerprint) < colorDistance(closest.visual.fingerprint, fingerprint)
        ? photo
        : closest
    ), session.photos[0]);
    const companions = chapterCompanions(session.photos, metadataSummary.candidateMap);
    samples.push({
      session,
      representative,
      accent: aggregateAccent(session.photos),
      fingerprint,
      memoryPixels: aggregateMemoryPixels(session.photos),
      worldName: dominantWorldName(session.photos),
      companionNames: companions.names,
      companionStrength: companions.strength,
    });
  }

  const motifs = assignMotifs(samples);
  const motifCounts = new Map<number, number>();
  motifs.forEach((motif) => motifCounts.set(motif, (motifCounts.get(motif) ?? 0) + 1));
  const counts = samples.map(({ session }) => session.photos.length).sort((a, b) => a - b);
  const medianCount = counts[Math.floor(counts.length / 2)] || 1;

  const moments = samples.map((sample, index): MemoryMoment => {
    const recurrence = motifCounts.get(motifs[index]) ?? 1;
    const density = sample.session.photos.length / medianCount;
    const anonymousStrength = Math.max(
      1,
      Math.min(3, Math.round((Math.min(recurrence, 4) + Math.min(density, 3)) / 2)),
    );
    const echoStrength = sample.companionStrength || anonymousStrength;
    return {
      id: `moment-${index + 1}`,
      date: sample.session.start.toISOString(),
      photoCount: sample.session.photos.length,
      accent: sample.accent,
      motif: motifs[index],
      echoStrength,
      fingerprint: sample.fingerprint,
      memoryPixels: sample.memoryPixels,
      worldName: sample.worldName,
      companionNames: sample.companionNames,
      companionStrength: sample.companionStrength,
      previewUrl: URL.createObjectURL(sample.representative.file),
    };
  });
  const topMotifs = Array.from(motifCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([motif, appearances]) => ({
      motif,
      appearances,
      accent: samples[motifs.indexOf(motif)]?.accent ?? "#8174b9",
    }));

  onProgress({ current: files.length, total: files.length, label: "모든 장면이 산책길에 반영됐어요" });

  return {
    schema: "vrchat-recap/v5",
    generatedAt: new Date().toISOString(),
    totalPhotos: files.length,
    startDate: photos[0].date.toISOString(),
    endDate: photos.at(-1)!.date.toISOString(),
    analysisMs: Math.round(performance.now() - startedAt),
    moments,
    stats: {
      ...recapStats,
      topMotifs,
      topWorlds: metadataSummary.topWorlds,
      companions: metadataSummary.companions,
      metadataCoverage: metadataSummary.metadataCoverage,
      visuallyAnalyzed,
      localModel: LOCAL_VISION_MODEL,
      localModelStatus,
      modelAnalyzed,
      avatarScenes,
      avatarDetections,
    },
  };
}

export function releaseJourney(journey: MemoryJourney | null): void {
  journey?.moments.forEach((moment) => {
    if (moment.previewUrl) URL.revokeObjectURL(moment.previewUrl);
  });
}

export function exportJourney(journey: MemoryJourney): void {
  const privateIndex = {
    ...journey,
    moments: journey.moments.map((moment) => ({
      id: moment.id,
      date: moment.date,
      photoCount: moment.photoCount,
      accent: moment.accent,
      motif: moment.motif,
      echoStrength: moment.echoStrength,
      worldName: moment.worldName,
      companionNames: moment.companionNames,
      companionStrength: moment.companionStrength,
      fingerprint: moment.fingerprint.map((value) => Math.round(value * 255)),
      memoryPixels: moment.memoryPixels,
    })),
  };
  const blob = new Blob([JSON.stringify(privateIndex)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "vrchat-recap-index.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function exportRecapCard(journey: MemoryJourney): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = 1200;
  canvas.height = 630;
  const context = canvas.getContext("2d");
  if (!context) return;

  context.fillStyle = "#17142e";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(247,237,207,.045)";
  for (let x = 0; x < canvas.width; x += 32) context.fillRect(x, 0, 1, canvas.height);
  for (let y = 0; y < canvas.height; y += 32) context.fillRect(0, y, canvas.width, 1);

  const accents = ["#8bc8d5", "#d28cc5", "#80d5ae", "#e3ad72", "#b2a2ed", "#f2a9c2", "#74b9d2", "#d5e9f4", "#f4c17e"];
  accents.forEach((accent, index) => {
    context.fillStyle = accent;
    context.globalAlpha = 0.22 + index * 0.035;
    context.fillRect(686 + index * 49, 180 - (index % 2) * 32, 30, 300 + (index % 3) * 38);
    context.fillRect(677 + index * 49, 180 - (index % 2) * 32, 48, 10);
  });
  context.globalAlpha = 1;
  context.fillStyle = "#f7edcf";
  context.beginPath();
  context.arc(1020, 102, 54, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#17142e";
  context.beginPath();
  context.arc(1040, 86, 54, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = "#7fc9b7";
  context.font = "800 20px ui-monospace, monospace";
  context.fillText("YOUR SCREENSHOTS · YOUR YEARS · YOUR RECAP", 72, 78);
  context.fillStyle = "#f7edcf";
  context.font = "900 64px ui-monospace, monospace";
  context.fillText("VRCHAT RECAP", 68, 154);
  context.fillStyle = "#efb56f";
  context.font = "900 106px ui-monospace, monospace";
  context.fillText(journey.totalPhotos.toLocaleString("ko-KR"), 62, 290);
  context.fillStyle = "#f7edcf";
  context.font = "700 33px system-ui, sans-serif";
  context.fillText("장의 밤이 다시 길이 되었습니다.", 72, 342);

  const range = `${new Date(journey.startDate).getFullYear()} — ${new Date(journey.endDate).getFullYear()}`;
  context.fillStyle = "#aaa2d7";
  context.font = "800 24px ui-monospace, monospace";
  context.fillText(range, 72, 412);
  context.fillStyle = "#f7edcf";
  context.font = "700 25px system-ui, sans-serif";
  context.fillText(journey.stats.recapPersona, 72, 456);
  context.fillStyle = "#8f88a3";
  context.font = "600 19px system-ui, sans-serif";
  context.fillText(`${journey.stats.activeDays.toLocaleString("ko-KR")}일 · ${journey.stats.totalSessions.toLocaleString("ko-KR")}번의 세션 · 새벽 ${journey.stats.lateNightPercent}%`, 72, 496);
  context.fillStyle = "#7fc9b7";
  context.font = "800 16px ui-monospace, monospace";
  context.fillText(`${journey.stats.awards[0]?.title ?? "MEMORY KEEPER"} · ${journey.stats.favoriteSeason}의 기억 · 주말 ${journey.stats.weekendPercent}%`, 72, 532);

  context.fillStyle = "#282342";
  context.fillRect(0, 570, canvas.width, 60);
  context.fillStyle = "#7fc9b7";
  context.fillRect(72, 592, 18, 18);
  context.fillStyle = "#c8c2d7";
  context.font = "700 17px ui-monospace, monospace";
  context.fillText("ANALYZED LOCALLY · NO PHOTO UPLOAD", 104, 608);

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "vrchat-recap-card.png";
  anchor.click();
  URL.revokeObjectURL(url);
}

export function createDemoJourney(): MemoryJourney {
  const dates = [
    "2021-02-13T21:22:00.000Z",
    "2021-07-24T23:41:00.000Z",
    "2022-01-01T00:08:00.000Z",
    "2022-09-18T20:17:00.000Z",
    "2023-05-06T22:32:00.000Z",
    "2024-02-10T01:16:00.000Z",
    "2024-11-02T23:54:00.000Z",
    "2025-08-17T21:08:00.000Z",
    "2025-12-31T23:58:00.000Z",
  ];
  const accents = ["#426b8c", "#7c4b8d", "#b06b58", "#347b76", "#5b649d", "#a34f71", "#536f8c", "#8ca9c8", "#c58b6b"];
  const demoMemoryPixels = (accent: string, scene: number) => {
    const hex = accent.replace("#", "");
    const base = [0, 2, 4].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16) / 17);
    return Array.from({ length: 16 * 9 }, (_, pixel) => {
      const x = pixel % 16;
      const y = Math.floor(pixel / 16);
      const horizon = y < 5 ? -2 + y * 0.45 : 2 - (y - 5) * 0.2;
      const light = Math.sin((x + scene * 2) * 0.72) * 1.8 + horizon;
      return base.map((channel, channelIndex) => (
        Math.max(0, Math.min(15, Math.round(channel + light + channelIndex * 0.35)))
      ));
    }).flat();
  };
  return {
    schema: "vrchat-recap/v5",
    generatedAt: new Date().toISOString(),
    totalPhotos: 4278,
    startDate: dates[0],
    endDate: dates.at(-1)!,
    analysisMs: 1840,
    stats: {
      activeDays: 512,
      totalSessions: 684,
      activeYears: [
        { year: 2021, photos: 412, activeDays: 76 },
        { year: 2022, photos: 816, activeDays: 102 },
        { year: 2023, photos: 1084, activeDays: 131 },
        { year: 2024, photos: 1242, activeDays: 142 },
        { year: 2025, photos: 724, activeDays: 61 },
      ],
      busiestDay: "2024-02-10T12:00:00.000Z",
      busiestDayPhotos: 187,
      favoriteHour: 23,
      lateNightPercent: 41,
      weekendPercent: 63,
      favoriteSeason: "겨울",
      longestStreakDays: 18,
      longestSessionPhotos: 212,
      recapPersona: "자정의 마지막 손님",
      awards: [
        { id: "archive", title: "MEMORY GALAXY", value: "4,278장", description: "작은 장면들을 하나의 별자리로 남겼어요." },
        { id: "return", title: "PORTAL REGULAR", value: "512일", description: "다시 접속해 새로운 기억을 이어간 날이에요." },
        { id: "time", title: "NIGHT OWL", value: "41%", description: "새벽의 월드를 오래 지켰어요." },
        { id: "streak", title: "CONNECTED DAYS", value: "18일", description: "가장 오래 이어진 접속의 리듬이에요." },
        { id: "season", title: "SEASON CALLING", value: "겨울", description: "겨울에 가장 많은 장면을 남겼어요." },
      ],
      topMotifs: [
        { motif: 1, appearances: 6, accent: "#7c4b8d" },
        { motif: 0, appearances: 5, accent: "#426b8c" },
        { motif: 3, appearances: 4, accent: "#347b76" },
        { motif: 2, appearances: 3, accent: "#b06b58" },
      ],
      topWorlds: [
        { displayName: "Midnight Rooftop", photoCount: 486, visitCount: 28 },
        { displayName: "Portal Garden", photoCount: 352, visitCount: 19 },
        { displayName: "Star Archive", photoCount: 241, visitCount: 14 },
      ],
      companions: [
        { displayName: "Luna", photoCount: 192, instanceCount: 21, activeDays: 18, closeness: 3, visualEvidencePhotos: 74 },
        { displayName: "Mochi", photoCount: 88, instanceCount: 9, activeDays: 7, closeness: 2, visualEvidencePhotos: 31 },
        { displayName: "Nova", photoCount: 34, instanceCount: 4, activeDays: 3, closeness: 1, visualEvidencePhotos: 12 },
      ],
      metadataCoverage: 96,
      visuallyAnalyzed: 4278,
      localModel: LOCAL_VISION_MODEL,
      localModelStatus: "ready",
      modelAnalyzed: 4278,
      avatarScenes: 1832,
      avatarDetections: 3241,
    },
    moments: dates.map((date, index) => ({
      id: `demo-${index}`,
      date,
      photoCount: [18, 64, 103, 37, 129, 46, 78, 52, 91][index],
      accent: accents[index],
      motif: index % 4,
      echoStrength: [1, 2, 3, 1, 3, 2, 2, 1, 3][index],
      worldName: ["First Skyport", "Midnight Rooftop", "Star Archive", "Portal Garden", "Midnight Rooftop", "Snow Globe", "Festival Cloud", "Rainy Rooftop", "Sunrise Lobby"][index],
      companionNames: index === 2 || index === 4 ? ["Luna", "Mochi"] : index === 8 ? ["Luna"] : [],
      companionStrength: index === 2 || index === 4 || index === 8 ? 3 : 0,
      memoryPixels: demoMemoryPixels(accents[index], index),
      fingerprint: Array.from({ length: 40 }, (_, valueIndex) =>
        Number((((index + valueIndex) % 9) / 10).toFixed(2)),
      ),
    })),
  };
}

export function formatDate(date: string, includeYear = true): string {
  return new Intl.DateTimeFormat("ko-KR", {
    year: includeYear ? "numeric" : undefined,
    month: "long",
    day: "numeric",
  }).format(new Date(date));
}
