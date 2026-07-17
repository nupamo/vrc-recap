import {
  readEmbeddedPhotoMetadata,
  type EmbeddedPhotoMetadata,
} from "./pngMetadata";
import {
  createLocalVisualAnalyzer,
  type LocalVisualAnalyzer,
  type LocalVisualSubject,
} from "./localVision";
import {
  inferMetadataPeople,
  inferRecurringFaces,
  inferRecurringScenes,
  inferTemporalScenes,
  selectSceneResults,
  summarizeRecapPeriods,
} from "./recapInference";

export type AnalysisPhoto = {
  date: string;
  file: File;
  nicknames: string[];
  twoPersonMoment: boolean;
  visualSubjects: number;
  worldName?: string;
};

export type AnalysisProgress = {
  current: number;
  discoveries: {
    daysWithTwoPeople: number;
    people: number;
    topNames: string[];
    visualPeople: number;
    visualPlaces: number;
    worlds: number;
  };
  photo?: AnalysisPhoto;
  stage: "preparing" | "remembering" | "composing";
  total: number;
};

export type RecapPhoto = {
  date: string;
  fileName: string;
  id: string;
  nicknames: string[];
  url: string;
  visualSceneRank?: number;
  visualSubjects: number;
  worldName?: string;
};

export type YearRecap = {
  activeDays: number;
  photos: number;
  year: number;
};

export type MonthRecap = {
  month: number;
  photoCount: number;
  year: number;
};

export type DayRecap = {
  day: number;
  month: number;
  photoCount: number;
  year: number;
};

export type WorldRecap = {
  activeDays: number;
  displayName?: string;
  id: string;
  inference: "metadata" | "temporal" | "visual";
  month?: number;
  photoCount: number;
  photoId?: string;
  year?: number;
};

export type PersonRecap = {
  activeDays: number;
  displayName?: string;
  firstDate: string;
  id: string;
  inference: "metadata" | "visual";
  lastDate: string;
  pairDays: number;
  photoId?: string;
  photoCount: number;
};

export type SpecialPersonRecap = {
  activeDays: number;
  displayName?: string;
  firstDate: string;
  inference: "metadata" | "visual";
  lastDate: string;
  pairDays: number;
  photoIds: string[];
  topWorld?: string;
};

export type MemoryJourney = {
  analysis: {
    metadataPhotos: number;
    mode: "metadata" | "mixed" | "photos" | "visual";
    visualAnalysisAvailable: boolean;
    visualAnalyzedPhotos: number;
  };
  coverPhotoId: string;
  endDate: string;
  generatedAt: string;
  peakPeriodPhotoId?: string;
  photos: RecapPhoto[];
  schema: "vrchat-recap/v11";
  startDate: string;
  stats: {
    activeDays: number;
    activeMonths: number;
    activeYears: YearRecap[];
    people: PersonRecap[];
    recurringPeople: number;
    self?: {
      displayName?: string;
      inference: "metadata" | "visual";
      photoId?: string;
      photoCount: number;
    };
    specialPerson?: SpecialPersonRecap;
    topDay: DayRecap;
    topHour: number;
    topMonth: MonthRecap;
    topPeriod: "day" | "month";
    topWorlds: WorldRecap[];
  };
  timelinePhotoIds: string[];
  totalPhotos: number;
};

type Participant = {
  key: string;
  name: string;
};

type PhotoRecord = {
  date: Date;
  file: File;
  id: string;
  metadata: EmbeddedPhotoMetadata | null;
  participants: Participant[];
  sceneClusterId?: string;
  selfieScore: number;
  subjectClusterIds: string[];
  worldName?: string;
};

type VisualCluster = {
  centroid: number[];
  count: number;
  days: Set<string>;
  id: string;
  photoIds: Set<string>;
  source?: LocalVisualSubject["source"];
};

type WorldAccumulator = {
  days: Set<string>;
  displayName: string;
  id: string;
  instances: Set<string>;
  photos: PhotoRecord[];
};

type RankedWorldEntry = {
  activeDays: number;
  displayName?: string;
  id: string;
  inference: "metadata" | "temporal" | "visual";
  month?: number;
  photos: PhotoRecord[];
  year?: number;
};

const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i;
const SUBJECT_CLUSTER_THRESHOLD = 0.34;
const SCENE_CLUSTER_THRESHOLD = 0.32;
const MAX_SUBJECT_CLUSTERS = 512;
const MAX_SCENE_CLUSTERS = 512;
const MAX_TIMELINE_PHOTOS = 18;
const MAX_SPECIAL_PHOTOS = 6;

const waitForPaint = () => new Promise<void>((resolve) => {
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => resolve());
  } else {
    setTimeout(resolve, 0);
  }
});

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function participantKey(id: string | undefined, displayName: string): string {
  return id || `name:${displayName.trim().toLocaleLowerCase("en-US")}`;
}

function participantsFromMetadata(metadata: EmbeddedPhotoMetadata | null): Participant[] {
  if (!metadata) return [];
  const participants = new Map<string, Participant>();
  const names = new Map<string, string>();

  const add = (id: string | undefined, name: string | undefined) => {
    const cleaned = name?.trim();
    if (!cleaned) return;
    const normalizedName = cleaned.toLocaleLowerCase("en-US");
    const existingKey = names.get(normalizedName);
    const key = participantKey(id, cleaned);
    if (existingKey && existingKey !== key) {
      const existing = participants.get(existingKey);
      if (existingKey.startsWith("name:") && id && existing) {
        participants.delete(existingKey);
        participants.set(key, { key, name: cleaned });
        names.set(normalizedName, key);
      }
      return;
    }
    participants.set(key, { key, name: cleaned });
    names.set(normalizedName, key);
  };

  add(metadata.authorId, metadata.authorName);
  metadata.players.forEach((player) => add(player.id, player.displayName));
  return Array.from(participants.values());
}

function descriptorDistance(left: number[], right: number[]): number {
  if (!left.length || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }
  if (!leftMagnitude || !rightMagnitude) return Number.POSITIVE_INFINITY;
  return 1 - dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

function updateCluster(
  cluster: VisualCluster,
  descriptor: number[],
  photoId: string,
  day: string,
) {
  cluster.count += 1;
  const weight = 1 / cluster.count;
  cluster.centroid = cluster.centroid.map(
    (value, index) => value * (1 - weight) + descriptor[index] * weight,
  );
  cluster.photoIds.add(photoId);
  cluster.days.add(day);
}

function assignSubjectClusters(
  subjects: LocalVisualSubject[],
  clusters: VisualCluster[],
  photoId: string,
  date: Date,
): string[] {
  const assigned = new Set<string>();
  const day = localDayKey(date);

  for (const subject of subjects) {
    let bestCluster: VisualCluster | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const cluster of clusters) {
      if (assigned.has(cluster.id) || cluster.source !== subject.source) continue;
      const distance = descriptorDistance(subject.descriptor, cluster.centroid);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestCluster = cluster;
      }
    }

    if (!bestCluster || bestDistance > SUBJECT_CLUSTER_THRESHOLD) {
      if (clusters.length >= MAX_SUBJECT_CLUSTERS) continue;
      const cluster: VisualCluster = {
        centroid: [...subject.descriptor],
        count: 1,
        days: new Set([day]),
        id: `subject-${clusters.length + 1}`,
        photoIds: new Set([photoId]),
        source: subject.source,
      };
      clusters.push(cluster);
      assigned.add(cluster.id);
      continue;
    }

    updateCluster(bestCluster, subject.descriptor, photoId, day);
    assigned.add(bestCluster.id);
  }

  return Array.from(assigned);
}

function assignSceneCluster(
  descriptor: number[],
  clusters: VisualCluster[],
  photoId: string,
  date: Date,
): string | undefined {
  if (!descriptor.length) return undefined;
  const day = localDayKey(date);
  let bestCluster: VisualCluster | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const cluster of clusters) {
    const distance = descriptorDistance(descriptor, cluster.centroid);
    if (distance < bestDistance) {
      bestCluster = cluster;
      bestDistance = distance;
    }
  }

  if (!bestCluster || bestDistance > SCENE_CLUSTER_THRESHOLD) {
    if (clusters.length >= MAX_SCENE_CLUSTERS) return undefined;
    const cluster: VisualCluster = {
      centroid: [...descriptor],
      count: 1,
      days: new Set([day]),
      id: `scene-${clusters.length + 1}`,
      photoIds: new Set([photoId]),
    };
    clusters.push(cluster);
    return cluster.id;
  }

  updateCluster(bestCluster, descriptor, photoId, day);
  return bestCluster.id;
}

function isSelfAlone(
  photo: PhotoRecord,
  metadataSelfKey?: string,
  visualSelfId?: string,
): boolean {
  if (metadataSelfKey) {
    return photo.participants.length === 1
      && photo.participants[0].key === metadataSelfKey;
  }
  return Boolean(
    visualSelfId
    && photo.subjectClusterIds.length === 1
    && photo.subjectClusterIds[0] === visualSelfId,
  );
}

function representativePhoto(
  photos: PhotoRecord[],
  metadataSelfKey?: string,
  visualSelfId?: string,
): PhotoRecord {
  const midpoint = (photos.length - 1) / 2;
  return photos.reduce((best, photo, index) => {
    const photoIsSelfAlone = isSelfAlone(photo, metadataSelfKey, visualSelfId);
    const bestIsSelfAlone = isSelfAlone(best.photo, metadataSelfKey, visualSelfId);
    if (photoIsSelfAlone !== bestIsSelfAlone) {
      return photoIsSelfAlone ? { index, photo } : best;
    }
    const scoreDifference = photo.selfieScore - best.photo.selfieScore;
    if (scoreDifference > 0.0001) return { index, photo };
    if (scoreDifference < -0.0001) return best;
    if (photo.subjectClusterIds.length > best.photo.subjectClusterIds.length) {
      return { index, photo };
    }
    return Math.abs(index - midpoint) < Math.abs(best.index - midpoint)
      ? { index, photo }
      : best;
  }, { index: 0, photo: photos[0] }).photo;
}

function sampleRepresentativePhotos(
  photos: PhotoRecord[],
  limit: number,
  metadataSelfKey?: string,
  visualSelfId?: string,
): PhotoRecord[] {
  if (photos.length <= limit) return [...photos];
  const selected: PhotoRecord[] = [];
  for (let index = 0; index < limit; index += 1) {
    const start = Math.floor((index * photos.length) / limit);
    const end = Math.max(start + 1, Math.floor(((index + 1) * photos.length) / limit));
    selected.push(representativePhoto(
      photos.slice(start, end),
      metadataSelfKey,
      visualSelfId,
    ));
  }
  return selected.sort((a, b) => a.date.getTime() - b.date.getTime());
}

function sampleEvenly<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return [...items];
  const selected: T[] = [];
  for (let index = 0; index < limit; index += 1) {
    selected.push(items[Math.round((index * (items.length - 1)) / (limit - 1))]);
  }
  return selected;
}

function topEntries(map: Map<string, number>, limit: number): string[] {
  return Array.from(map.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name]) => name);
}

function buildWorlds(photos: PhotoRecord[]): Map<string, WorldAccumulator> {
  const worlds = new Map<string, WorldAccumulator>();
  for (const photo of photos) {
    if (!photo.worldName) continue;
    const metadata = photo.metadata;
    const key = metadata?.worldId || `name:${photo.worldName.toLocaleLowerCase("en-US")}`;
    const fallbackInstance = `${key}|${localDayKey(photo.date)}|${Math.floor(photo.date.getHours() / 4)}`;
    const instance = metadata?.instanceId || fallbackInstance;
    const entry = worlds.get(key) ?? {
      days: new Set<string>(),
      displayName: photo.worldName,
      id: key,
      instances: new Set<string>(),
      photos: [],
    };
    entry.days.add(localDayKey(photo.date));
    entry.instances.add(instance);
    entry.photos.push(photo);
    worlds.set(key, entry);
  }
  return worlds;
}

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

export async function analyzeFiles(
  sourceFiles: Iterable<File>,
  onProgress: (progress: AnalysisProgress) => void,
): Promise<MemoryJourney> {
  const files = collectImageFiles(sourceFiles);
  if (!files.length) throw new Error("No image files were found.");

  const discoveries = {
    daysWithTwoPeople: 0,
    people: 0,
    topNames: [] as string[],
    visualPeople: 0,
    visualPlaces: 0,
    worlds: 0,
  };
  onProgress({
    current: 0,
    discoveries,
    stage: "preparing",
    total: files.length,
  });

  let visualAnalyzer: LocalVisualAnalyzer | null = null;
  try {
    visualAnalyzer = await createLocalVisualAnalyzer();
  } catch {
    visualAnalyzer = null;
  }

  const records: PhotoRecord[] = [];
  const subjectClusters: VisualCluster[] = [];
  const sceneClusters: VisualCluster[] = [];
  const nameCounts = new Map<string, number>();
  const twoPersonDays = new Set<string>();
  const worldNames = new Set<string>();
  let metadataPhotos = 0;
  let visualAnalyzedPhotos = 0;

  try {
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      let metadata: EmbeddedPhotoMetadata | null = null;
      try {
        metadata = await readEmbeddedPhotoMetadata(file);
      } catch {
        metadata = null;
      }
      if (metadata) metadataPhotos += 1;

      const embeddedDate = metadata?.captureDate ? new Date(metadata.captureDate) : null;
      const date = embeddedDate && !Number.isNaN(embeddedDate.getTime())
        ? embeddedDate
        : parseScreenshotDate(file.name, file.lastModified);
      const participants = participantsFromMetadata(metadata);
      const record: PhotoRecord = {
        date,
        file,
        id: `photo-${index + 1}`,
        metadata,
        participants,
        selfieScore: 0,
        subjectClusterIds: [],
        worldName: metadata?.worldName,
      };

      if (visualAnalyzer) {
        try {
          const result = await visualAnalyzer.analyze(file);
          record.selfieScore = result.selfieScore;
          record.subjectClusterIds = assignSubjectClusters(
            result.subjects,
            subjectClusters,
            record.id,
            date,
          );
          record.sceneClusterId = assignSceneCluster(
            result.sceneDescriptor,
            sceneClusters,
            record.id,
            date,
          );
          visualAnalyzedPhotos += 1;
        } catch {
          // A single unreadable photo does not stop the rest of the recap.
        }
      }

      records.push(record);
      participants.forEach((participant) => {
        nameCounts.set(participant.name, (nameCounts.get(participant.name) ?? 0) + 1);
      });
      if (record.worldName) worldNames.add(record.worldName);

      discoveries.visualPeople = subjectClusters.filter((cluster) => cluster.days.size >= 2).length;
      discoveries.visualPlaces = sceneClusters.filter((cluster) => cluster.days.size >= 2).length;
      discoveries.people = Math.max(nameCounts.size, discoveries.visualPeople);
      discoveries.worlds = Math.max(worldNames.size, discoveries.visualPlaces);
      if (participants.length === 2 || record.subjectClusterIds.length === 2) {
        twoPersonDays.add(localDayKey(date));
      }
      discoveries.daysWithTwoPeople = twoPersonDays.size;
      discoveries.topNames = topEntries(nameCounts, 4);
      onProgress({
        current: index + 1,
        discoveries: {
          ...discoveries,
          topNames: [...discoveries.topNames],
        },
        photo: {
          date: date.toISOString(),
          file,
          nicknames: participants.map((participant) => participant.name),
          twoPersonMoment: participants.length === 2 || record.subjectClusterIds.length === 2,
          visualSubjects: record.subjectClusterIds.length,
          worldName: record.worldName,
        },
        stage: "remembering",
        total: files.length,
      });
      if (index % 6 === 0) await waitForPaint();
    }
  } finally {
    visualAnalyzer?.close();
  }

  records.sort((a, b) => a.date.getTime() - b.date.getTime());
  onProgress({
    current: files.length,
    discoveries,
    stage: "composing",
    total: files.length,
  });
  await waitForPaint();

  const peopleInference = inferMetadataPeople(records);
  const self = peopleInference.self;
  const specialMetadataPerson = peopleInference.special;
  const specialMetadataPhotoIds = new Set(specialMetadataPerson?.pairDayPhotoIds ?? []);
  const specialMetadataPhotos = records.filter((photo) => specialMetadataPhotoIds.has(photo.id));

  const faceInference = inferRecurringFaces(
    subjectClusters,
    records.map((photo) => ({
      date: photo.date,
      faceClusterIds: photo.subjectClusterIds,
      id: photo.id,
    })),
    Boolean(self),
  );
  const inferredSelfFace = faceInference.selfFaceId
    ? subjectClusters.find((cluster) => cluster.id === faceInference.selfFaceId)
    : undefined;
  const specialFacePhotoIds = new Set(faceInference.specialPhotoIds);
  const specialFacePhotos = records.filter((photo) => specialFacePhotoIds.has(photo.id));

  const worlds = buildWorlds(records);
  const metadataWorldEntries: RankedWorldEntry[] = Array.from(worlds.values())
    .sort((a, b) => b.days.size - a.days.size
      || b.instances.size - a.instances.size
      || b.photos.length - a.photos.length)
    .slice(0, 6)
    .map((world) => ({
      activeDays: world.days.size,
      displayName: world.displayName,
      id: world.id,
      inference: "metadata",
      photos: world.photos,
    }));
  const recordsById = new Map(records.map((photo) => [photo.id, photo]));
  const visualWorldEntries: RankedWorldEntry[] = inferRecurringScenes(sceneClusters)
    .flatMap((scene): RankedWorldEntry[] => {
      const photos = scene.photoIds
        .map((id) => recordsById.get(id))
        .filter((photo): photo is PhotoRecord => Boolean(photo));
      return photos.length
        ? [{
          activeDays: scene.activeDays,
          id: scene.id,
          inference: "visual",
          photos,
        }]
        : [];
    });
  const temporalWorldEntries: RankedWorldEntry[] = inferTemporalScenes(records)
    .flatMap((period): RankedWorldEntry[] => {
      const photos = period.photoIds
        .map((id) => recordsById.get(id))
        .filter((photo): photo is PhotoRecord => Boolean(photo));
      return photos.length
        ? [{
          activeDays: period.activeDays,
          id: period.id,
          inference: "temporal",
          month: period.month,
          photos,
          year: period.year,
        }]
        : [];
    });
  const topWorldEntries = selectSceneResults(
    metadataWorldEntries,
    visualWorldEntries,
    temporalWorldEntries,
  );
  const visualSceneRanks = new Map(
    visualWorldEntries.map((scene, index) => [scene.id, index + 1]),
  );

  const daySet = new Set<string>();
  const yearCounts = new Map<number, { days: Set<string>; photos: number }>();
  const monthCounts = new Map<string, PhotoRecord[]>();
  const dayCounts = new Map<string, PhotoRecord[]>();
  for (const photo of records) {
    const day = localDayKey(photo.date);
    daySet.add(day);
    const year = photo.date.getFullYear();
    const yearEntry = yearCounts.get(year) ?? { days: new Set<string>(), photos: 0 };
    yearEntry.photos += 1;
    yearEntry.days.add(day);
    yearCounts.set(year, yearEntry);
    const month = monthKey(photo.date);
    const monthPhotos = monthCounts.get(month) ?? [];
    monthPhotos.push(photo);
    monthCounts.set(month, monthPhotos);
    const dayPhotos = dayCounts.get(day) ?? [];
    dayPhotos.push(photo);
    dayCounts.set(day, dayPhotos);
  }
  const periodSummary = summarizeRecapPeriods(records);
  const topMonthEntry = [
    periodSummary.topMonthKey,
    monthCounts.get(periodSummary.topMonthKey)!,
  ] as const;
  const [topMonthYear, topMonthNumber] = topMonthEntry[0].split("-").map(Number);
  const topDayEntry = [
    periodSummary.topDayKey,
    dayCounts.get(periodSummary.topDayKey)!,
  ] as const;
  const [topDayYear, topDayMonth, topDayNumber] = topDayEntry[0].split("-").map(Number);
  const { topHour, topPeriod } = periodSummary;
  const topPeriodRecords = topPeriod === "day" ? topDayEntry[1] : topMonthEntry[1];

  const visualSelfId = faceInference.selfFaceId;
  const visualSelfPhotos = inferredSelfFace
    ? Array.from(inferredSelfFace.photoIds)
      .map((id) => recordsById.get(id))
      .filter((photo): photo is PhotoRecord => Boolean(photo))
    : [];
  const visualSelfRecord = visualSelfPhotos.length
    ? representativePhoto(visualSelfPhotos, undefined, visualSelfId)
    : undefined;
  const timelineRecords = sampleRepresentativePhotos(
    records,
    MAX_TIMELINE_PHOTOS,
    self?.key,
    visualSelfId,
  );
  const peakPeriodRecord = representativePhoto(
    topPeriodRecords,
    self?.key,
    visualSelfId,
  );
  const specialRecords = sampleEvenly(
    specialMetadataPhotos.length ? specialMetadataPhotos : specialFacePhotos,
    MAX_SPECIAL_PHOTOS,
  );
  const visualPersonRepresentativeRecords = new Map(
    faceInference.visualPeople.slice(0, 10).flatMap((person) => {
      const personPhotos = person.photoIds
        .map((id) => recordsById.get(id))
        .filter((photo): photo is PhotoRecord => Boolean(photo));
      return personPhotos.length
        ? [[person.id, representativePhoto(personPhotos)] as const]
        : [];
    }),
  );
  const coverRecord = representativePhoto(records, self?.key, visualSelfId);
  const selectedRecords = new Map<string, PhotoRecord>();
  [
    ...timelineRecords,
    peakPeriodRecord,
    coverRecord,
    ...topWorldEntries.map((world) => representativePhoto(
      world.photos,
      self?.key,
      visualSelfId,
    )),
    ...specialRecords,
    ...visualPersonRepresentativeRecords.values(),
    ...(visualSelfRecord ? [visualSelfRecord] : []),
  ].forEach((photo) => selectedRecords.set(photo.id, photo));

  const recapPhotos = Array.from(selectedRecords.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((photo): RecapPhoto => ({
      date: photo.date.toISOString(),
      fileName: photo.file.name,
      id: photo.id,
      nicknames: photo.participants.map((participant) => participant.name),
      url: URL.createObjectURL(photo.file),
      visualSceneRank: photo.sceneClusterId
        ? visualSceneRanks.get(photo.sceneClusterId)
        : undefined,
      visualSubjects: photo.subjectClusterIds.length,
      worldName: photo.worldName,
    }));

  const specialSourcePhotos = specialMetadataPhotos.length
    ? specialMetadataPhotos
    : specialFacePhotos;
  const specialWorldCounts = new Map<string, number>();
  specialSourcePhotos.forEach((photo) => {
    if (photo.worldName) {
      specialWorldCounts.set(photo.worldName, (specialWorldCounts.get(photo.worldName) ?? 0) + 1);
    }
  });
  const specialTopWorld = Array.from(specialWorldCounts.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0];

  const specialPerson: SpecialPersonRecap | undefined = specialMetadataPerson
    ? {
      activeDays: specialMetadataPerson.activeDays,
      displayName: specialMetadataPerson.name,
      firstDate: specialMetadataPerson.firstDate.toISOString(),
      inference: "metadata",
      lastDate: specialMetadataPerson.lastDate.toISOString(),
      pairDays: specialMetadataPerson.pairDayPhotoIds.length,
      photoIds: specialRecords.map((photo) => photo.id),
      topWorld: specialTopWorld,
    }
    : faceInference.specialFaceId && specialSourcePhotos.length
      ? {
        activeDays: new Set(specialSourcePhotos.map((photo) => localDayKey(photo.date))).size,
        firstDate: specialSourcePhotos[0].date.toISOString(),
        inference: "visual",
        lastDate: specialSourcePhotos.at(-1)!.date.toISOString(),
        pairDays: specialSourcePhotos.length,
        photoIds: specialRecords.map((photo) => photo.id),
        topWorld: specialTopWorld,
      }
      : undefined;

  const metadataPeople = peopleInference.people
    .filter((person) => person.key !== self?.key)
    .sort((a, b) => b.photoCount - a.photoCount || b.activeDays - a.activeDays)
    .slice(0, 10)
    .map((person): PersonRecap => ({
      activeDays: person.activeDays,
      displayName: person.name,
      firstDate: person.firstDate.toISOString(),
      id: person.key,
      inference: "metadata",
      lastDate: person.lastDate.toISOString(),
      pairDays: person.pairDayPhotoIds.length,
      photoCount: person.photoCount,
    }));
  const visualPeople = faceInference.visualPeople
    .slice(0, 10)
    .map((person): PersonRecap => ({
      activeDays: person.activeDays,
      firstDate: person.firstDate.toISOString(),
      id: person.id,
      inference: "visual",
      lastDate: person.lastDate.toISOString(),
      pairDays: person.pairDayPhotoIds.length,
      photoId: visualPersonRepresentativeRecords.get(person.id)?.id,
      photoCount: person.photoIds.length,
    }));
  const recapPeople = metadataPeople.length ? metadataPeople : visualPeople;

  const mode = metadataPhotos > 0 && visualAnalyzedPhotos > 0
    ? "mixed"
    : metadataPhotos > 0
      ? "metadata"
      : visualAnalyzedPhotos > 0
        ? "visual"
        : "photos";

  return {
    analysis: {
      metadataPhotos,
      mode,
      visualAnalysisAvailable: Boolean(visualAnalyzer) || visualAnalyzedPhotos > 0,
      visualAnalyzedPhotos,
    },
    coverPhotoId: coverRecord.id,
    endDate: records.at(-1)!.date.toISOString(),
    generatedAt: new Date().toISOString(),
    peakPeriodPhotoId: peakPeriodRecord.id,
    photos: recapPhotos,
    schema: "vrchat-recap/v11",
    startDate: records[0].date.toISOString(),
    stats: {
      activeDays: daySet.size,
      activeMonths: monthCounts.size,
      activeYears: Array.from(yearCounts.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([year, value]) => ({
          activeDays: value.days.size,
          photos: value.photos,
          year,
        })),
      people: recapPeople,
      recurringPeople: faceInference.recurringFaceCount,
      self: self
        ? {
          displayName: self.name,
          inference: "metadata",
          photoCount: self.photoCount,
        }
        : inferredSelfFace
          ? {
            inference: "visual",
            photoId: visualSelfRecord?.id,
            photoCount: inferredSelfFace.days.size,
          }
          : undefined,
      specialPerson,
      topDay: {
        day: topDayNumber,
        month: topDayMonth,
        photoCount: topDayEntry[1].length,
        year: topDayYear,
      },
      topHour,
      topMonth: {
        month: topMonthNumber,
        photoCount: topMonthEntry[1].length,
        year: topMonthYear,
      },
      topPeriod,
      topWorlds: topWorldEntries.map((world) => ({
        activeDays: world.activeDays,
        displayName: world.displayName,
        id: world.id,
        inference: world.inference,
        month: world.month,
        photoCount: world.photos.length,
        photoId: representativePhoto(
          world.photos,
          self?.key,
          visualSelfId,
        ).id,
        year: world.year,
      })),
    },
    timelinePhotoIds: timelineRecords.map((photo) => photo.id),
    totalPhotos: records.length,
  };
}

export function releaseJourney(journey: MemoryJourney | null): void {
  const urls = new Set(journey?.photos.map((photo) => photo.url) ?? []);
  urls.forEach((url) => URL.revokeObjectURL(url));
}
