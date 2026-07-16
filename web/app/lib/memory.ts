import {
  readEmbeddedPhotoMetadata,
  type EmbeddedPhotoMetadata,
} from "./pngMetadata";
import {
  createLocalFaceDetector,
  type LocalFaceDetector,
  type LocalFaceSample,
} from "./localVision";

export type AnalysisPhoto = {
  date: string;
  file: File;
  nicknames: string[];
  twoPersonMoment: boolean;
  worldName?: string;
};

export type AnalysisProgress = {
  current: number;
  discoveries: {
    people: number;
    photosWithTwoPeople: number;
    topNames: string[];
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

export type WorldRecap = {
  displayName: string;
  photoCount: number;
  photoId?: string;
  visitCount: number;
};

export type PersonRecap = {
  activeDays: number;
  displayName: string;
  firstDate: string;
  lastDate: string;
  pairPhotos: number;
  photoCount: number;
};

export type SpecialPersonRecap = {
  activeDays: number;
  displayName?: string;
  firstDate: string;
  inference: "metadata" | "faces";
  lastDate: string;
  pairPhotos: number;
  photoIds: string[];
  topWorld?: string;
};

export type MemoryJourney = {
  analysis: {
    faceAnalysisAvailable: boolean;
    faceAnalyzedPhotos: number;
    metadataPhotos: number;
    mode: "metadata" | "mixed" | "faces" | "photos";
  };
  coverPhotoId: string;
  endDate: string;
  generatedAt: string;
  peakMonthPhotoId?: string;
  photos: RecapPhoto[];
  schema: "vrchat-recap/v6";
  startDate: string;
  stats: {
    activeDays: number;
    activeYears: YearRecap[];
    people: PersonRecap[];
    recurringFaces: number;
    self?: {
      displayName?: string;
      inference: "metadata" | "faces";
      photoCount: number;
    };
    specialPerson?: SpecialPersonRecap;
    topMonth: MonthRecap;
    topSeason: number;
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
  faceClusterIds: string[];
  file: File;
  id: string;
  metadata: EmbeddedPhotoMetadata | null;
  participants: Participant[];
  worldName?: string;
};

type FaceCluster = {
  centroid: number[];
  count: number;
  days: Set<string>;
  id: string;
  photoIds: Set<string>;
};

type PersonAccumulator = {
  days: Set<string>;
  firstDate: Date;
  key: string;
  lastDate: Date;
  name: string;
  pairPhotos: number;
  photoCount: number;
};

type WorldAccumulator = {
  displayName: string;
  instances: Set<string>;
  photos: PhotoRecord[];
};

const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i;
const FACE_CLUSTER_THRESHOLD = 0.235;
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
  let sum = 0;
  for (let index = 0; index < left.length; index += 1) {
    const delta = left[index] - right[index];
    sum += delta * delta;
  }
  return Math.sqrt(sum / left.length);
}

function assignFaceClusters(
  faces: LocalFaceSample[],
  clusters: FaceCluster[],
  photoId: string,
  date: Date,
): string[] {
  const assigned = new Set<string>();
  const day = localDayKey(date);

  for (const face of faces) {
    let bestCluster: FaceCluster | undefined;
    let bestDescriptor = face.descriptor;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const cluster of clusters) {
      if (assigned.has(cluster.id)) continue;
      const normalDistance = descriptorDistance(face.descriptor, cluster.centroid);
      const mirroredDistance = descriptorDistance(face.mirroredDescriptor, cluster.centroid);
      const distance = Math.min(normalDistance, mirroredDistance);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestCluster = cluster;
        bestDescriptor = mirroredDistance < normalDistance
          ? face.mirroredDescriptor
          : face.descriptor;
      }
    }

    if (!bestCluster || bestDistance > FACE_CLUSTER_THRESHOLD) {
      const cluster: FaceCluster = {
        centroid: [...face.descriptor],
        count: 1,
        days: new Set([day]),
        id: `face-${clusters.length + 1}`,
        photoIds: new Set([photoId]),
      };
      clusters.push(cluster);
      assigned.add(cluster.id);
      continue;
    }

    bestCluster.count += 1;
    const weight = 1 / bestCluster.count;
    bestCluster.centroid = bestCluster.centroid.map(
      (value, index) => value * (1 - weight) + bestDescriptor[index] * weight,
    );
    bestCluster.photoIds.add(photoId);
    bestCluster.days.add(day);
    assigned.add(bestCluster.id);
  }

  return Array.from(assigned);
}

function sampleEvenly<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return [...items];
  const selected: T[] = [];
  for (let index = 0; index < limit; index += 1) {
    selected.push(items[Math.round((index * (items.length - 1)) / (limit - 1))]);
  }
  return selected;
}

function representativePhoto(photos: PhotoRecord[]): PhotoRecord {
  return photos[Math.floor((photos.length - 1) / 2)];
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
      displayName: photo.worldName,
      instances: new Set<string>(),
      photos: [],
    };
    entry.instances.add(instance);
    entry.photos.push(photo);
    worlds.set(key, entry);
  }
  return worlds;
}

function buildPeople(photos: PhotoRecord[]): Map<string, PersonAccumulator> {
  const people = new Map<string, PersonAccumulator>();
  for (const photo of photos) {
    for (const participant of photo.participants) {
      const existing = people.get(participant.key) ?? {
        days: new Set<string>(),
        firstDate: photo.date,
        key: participant.key,
        lastDate: photo.date,
        name: participant.name,
        pairPhotos: 0,
        photoCount: 0,
      };
      existing.photoCount += 1;
      existing.days.add(localDayKey(photo.date));
      if (photo.date < existing.firstDate) existing.firstDate = photo.date;
      if (photo.date > existing.lastDate) existing.lastDate = photo.date;
      people.set(participant.key, existing);
    }
  }
  return people;
}

function seasonIndex(date: Date): number {
  const month = date.getMonth() + 1;
  if (month >= 3 && month <= 5) return 0;
  if (month >= 6 && month <= 8) return 1;
  if (month >= 9 && month <= 11) return 2;
  return 3;
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
    people: 0,
    photosWithTwoPeople: 0,
    topNames: [] as string[],
    worlds: 0,
  };
  onProgress({
    current: 0,
    discoveries,
    stage: "preparing",
    total: files.length,
  });

  let faceDetector: LocalFaceDetector | null = null;
  try {
    faceDetector = await createLocalFaceDetector();
  } catch {
    faceDetector = null;
  }

  const records: PhotoRecord[] = [];
  const faceClusters: FaceCluster[] = [];
  const nameCounts = new Map<string, number>();
  const worldNames = new Set<string>();
  let metadataPhotos = 0;
  let faceAnalyzedPhotos = 0;

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
        faceClusterIds: [],
        file,
        id: `photo-${index + 1}`,
        metadata,
        participants,
        worldName: metadata?.worldName,
      };

      if (faceDetector && participants.length === 0) {
        try {
          const result = await faceDetector.analyze(file);
          record.faceClusterIds = assignFaceClusters(
            result.faces,
            faceClusters,
            record.id,
            date,
          );
          faceAnalyzedPhotos += 1;
        } catch {
          // A single unreadable photo does not stop the rest of the recap.
        }
      }

      records.push(record);
      participants.forEach((participant) => {
        nameCounts.set(participant.name, (nameCounts.get(participant.name) ?? 0) + 1);
      });
      if (record.worldName) worldNames.add(record.worldName);

      discoveries.people = nameCounts.size;
      discoveries.worlds = worldNames.size;
      discoveries.photosWithTwoPeople += participants.length === 2 || record.faceClusterIds.length === 2
        ? 1
        : 0;
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
          twoPersonMoment: participants.length === 2 || record.faceClusterIds.length === 2,
          worldName: record.worldName,
        },
        stage: "remembering",
        total: files.length,
      });
      if (index % 6 === 0) await waitForPaint();
    }
  } finally {
    faceDetector?.close();
  }

  records.sort((a, b) => a.date.getTime() - b.date.getTime());
  onProgress({
    current: files.length,
    discoveries,
    stage: "composing",
    total: files.length,
  });
  await waitForPaint();

  const people = buildPeople(records);
  const self = Array.from(people.values())
    .sort((a, b) => b.photoCount - a.photoCount || b.days.size - a.days.size)[0];
  const pairPhotosByPerson = new Map<string, PhotoRecord[]>();
  if (self) {
    for (const photo of records) {
      if (photo.participants.length !== 2) continue;
      const selfIndex = photo.participants.findIndex((person) => person.key === self.key);
      if (selfIndex < 0) continue;
      const other = photo.participants[selfIndex === 0 ? 1 : 0];
      const pairPhotos = pairPhotosByPerson.get(other.key) ?? [];
      pairPhotos.push(photo);
      pairPhotosByPerson.set(other.key, pairPhotos);
      const person = people.get(other.key);
      if (person) person.pairPhotos += 1;
    }
  }

  const specialMetadataEntry = Array.from(pairPhotosByPerson.entries())
    .sort((a, b) => b[1].length - a[1].length)[0];

  const validFaceClusters = faceClusters
    .filter((cluster) => cluster.photoIds.size >= 2)
    .sort((a, b) => b.photoIds.size - a.photoIds.size || b.days.size - a.days.size);
  const inferredSelfFace = self ? undefined : validFaceClusters[0];
  const facePairPhotos = new Map<string, PhotoRecord[]>();
  if (inferredSelfFace) {
    const validIds = new Set(validFaceClusters.map((cluster) => cluster.id));
    for (const photo of records) {
      const ids = Array.from(new Set(photo.faceClusterIds.filter((id) => validIds.has(id))));
      if (ids.length !== 2 || !ids.includes(inferredSelfFace.id)) continue;
      const other = ids.find((id) => id !== inferredSelfFace.id);
      if (!other) continue;
      const pairPhotos = facePairPhotos.get(other) ?? [];
      pairPhotos.push(photo);
      facePairPhotos.set(other, pairPhotos);
    }
  }
  const specialFaceEntry = self
    ? undefined
    : Array.from(facePairPhotos.entries()).sort((a, b) => b[1].length - a[1].length)[0];

  const worlds = buildWorlds(records);
  const topWorldEntries = Array.from(worlds.values())
    .sort((a, b) => b.instances.size - a.instances.size || b.photos.length - a.photos.length)
    .slice(0, 6);

  const daySet = new Set<string>();
  const yearCounts = new Map<number, { days: Set<string>; photos: number }>();
  const monthCounts = new Map<string, PhotoRecord[]>();
  const seasonCounts = [0, 0, 0, 0];
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
    seasonCounts[seasonIndex(photo.date)] += 1;
  }
  const topMonthEntry = Array.from(monthCounts.entries())
    .sort((a, b) => b[1].length - a[1].length)[0];
  const [topMonthYear, topMonthNumber] = topMonthEntry[0].split("-").map(Number);
  const topSeason = seasonCounts.indexOf(Math.max(...seasonCounts));

  const timelineRecords = sampleEvenly(records, MAX_TIMELINE_PHOTOS);
  const peakMonthRecord = representativePhoto(topMonthEntry[1]);
  const specialMetadataPhotos = specialMetadataEntry?.[1] ?? [];
  const specialFacePhotos = specialFaceEntry?.[1] ?? [];
  const specialRecords = sampleEvenly(
    specialMetadataPhotos.length ? specialMetadataPhotos : specialFacePhotos,
    MAX_SPECIAL_PHOTOS,
  );
  const coverRecord = records[Math.min(records.length - 1, Math.round(records.length * 0.68))];
  const selectedRecords = new Map<string, PhotoRecord>();
  [
    ...timelineRecords,
    peakMonthRecord,
    coverRecord,
    ...topWorldEntries.map((world) => representativePhoto(world.photos)),
    ...specialRecords,
  ].forEach((photo) => selectedRecords.set(photo.id, photo));

  const recapPhotos = Array.from(selectedRecords.values())
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((photo): RecapPhoto => ({
      date: photo.date.toISOString(),
      fileName: photo.file.name,
      id: photo.id,
      nicknames: photo.participants.map((participant) => participant.name),
      url: URL.createObjectURL(photo.file),
      worldName: photo.worldName,
    }));

  const specialMetadataPerson = specialMetadataEntry
    ? people.get(specialMetadataEntry[0])
    : undefined;
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
      activeDays: specialMetadataPerson.days.size,
      displayName: specialMetadataPerson.name,
      firstDate: specialMetadataPerson.firstDate.toISOString(),
      inference: "metadata",
      lastDate: specialMetadataPerson.lastDate.toISOString(),
      pairPhotos: specialMetadataPhotos.length,
      photoIds: specialRecords.map((photo) => photo.id),
      topWorld: specialTopWorld,
    }
    : specialFaceEntry && specialSourcePhotos.length
      ? {
        activeDays: new Set(specialSourcePhotos.map((photo) => localDayKey(photo.date))).size,
        firstDate: specialSourcePhotos[0].date.toISOString(),
        inference: "faces",
        lastDate: specialSourcePhotos.at(-1)!.date.toISOString(),
        pairPhotos: specialSourcePhotos.length,
        photoIds: specialRecords.map((photo) => photo.id),
        topWorld: specialTopWorld,
      }
      : undefined;

  const metadataPeople = Array.from(people.values())
    .filter((person) => person.key !== self?.key)
    .sort((a, b) => b.photoCount - a.photoCount || b.days.size - a.days.size)
    .slice(0, 10)
    .map((person): PersonRecap => ({
      activeDays: person.days.size,
      displayName: person.name,
      firstDate: person.firstDate.toISOString(),
      lastDate: person.lastDate.toISOString(),
      pairPhotos: person.pairPhotos,
      photoCount: person.photoCount,
    }));

  const mode = metadataPhotos > 0 && faceAnalyzedPhotos > 0
    ? "mixed"
    : metadataPhotos > 0
      ? "metadata"
      : faceAnalyzedPhotos > 0
        ? "faces"
        : "photos";

  return {
    analysis: {
      faceAnalysisAvailable: Boolean(faceDetector) || faceAnalyzedPhotos > 0,
      faceAnalyzedPhotos,
      metadataPhotos,
      mode,
    },
    coverPhotoId: coverRecord.id,
    endDate: records.at(-1)!.date.toISOString(),
    generatedAt: new Date().toISOString(),
    peakMonthPhotoId: peakMonthRecord.id,
    photos: recapPhotos,
    schema: "vrchat-recap/v6",
    startDate: records[0].date.toISOString(),
    stats: {
      activeDays: daySet.size,
      activeYears: Array.from(yearCounts.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([year, value]) => ({
          activeDays: value.days.size,
          photos: value.photos,
          year,
        })),
      people: metadataPeople,
      recurringFaces: validFaceClusters.length,
      self: self
        ? {
          displayName: self.name,
          inference: "metadata",
          photoCount: self.photoCount,
        }
        : inferredSelfFace
          ? {
            inference: "faces",
            photoCount: inferredSelfFace.photoIds.size,
          }
          : undefined,
      specialPerson,
      topMonth: {
        month: topMonthNumber,
        photoCount: topMonthEntry[1].length,
        year: topMonthYear,
      },
      topSeason,
      topWorlds: topWorldEntries.map((world) => ({
        displayName: world.displayName,
        photoCount: world.photos.length,
        photoId: representativePhoto(world.photos).id,
        visitCount: world.instances.size,
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
