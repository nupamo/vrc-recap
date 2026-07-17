export type InferenceParticipant = {
  key: string;
  name: string;
};

export type MetadataInferencePhoto = {
  date: Date;
  id: string;
  participants: InferenceParticipant[];
};

export type InferredPerson = {
  activeDays: number;
  firstDate: Date;
  key: string;
  lastDate: Date;
  name: string;
  pairDayPhotoIds: string[];
  photoCount: number;
};

export type MetadataPeopleInference = {
  people: InferredPerson[];
  self?: InferredPerson;
  special?: InferredPerson;
};

export type FaceClusterInput = {
  days: Set<string>;
  id: string;
  photoIds: Set<string>;
};

export type FaceInferencePhoto = {
  date: Date;
  faceClusterIds: string[];
  id: string;
};

export type RecurringFaceInference = {
  recurringFaceCount: number;
  selfFaceId?: string;
  specialFaceId?: string;
  specialPhotoIds: string[];
  visualPeople: InferredVisualPerson[];
};

export type InferredVisualPerson = {
  activeDays: number;
  firstDate: Date;
  id: string;
  lastDate: Date;
  pairDayPhotoIds: string[];
  photoIds: string[];
};

export type InferredVisualScene = {
  activeDays: number;
  id: string;
  photoIds: string[];
};

export type TemporalScenePhoto = {
  date: Date;
  id: string;
};

export type InferredTemporalScene = {
  activeDays: number;
  id: string;
  month: number;
  photoIds: string[];
  year: number;
};

export type RecapPeriodSummary = {
  spanDays: number;
  topDayKey: string;
  topHour: number;
  topMonthKey: string;
  topPeriod: "day" | "month";
};

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function calendarDayIndex(date: Date): number {
  return Math.floor(Date.UTC(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  ) / 86_400_000);
}

export function summarizeRecapPeriods(
  photos: Array<{ date: Date }>,
): RecapPeriodSummary {
  if (!photos.length) {
    throw new Error("At least one photo is required to summarize recap periods.");
  }

  const sorted = [...photos].sort((left, right) => left.date.getTime() - right.date.getTime());
  const dayCounts = new Map<string, number>();
  const monthCounts = new Map<string, number>();
  const hourCounts = Array.from({ length: 24 }, () => 0);

  for (const photo of sorted) {
    const day = localDayKey(photo.date);
    const month = day.slice(0, 7);
    dayCounts.set(day, (dayCounts.get(day) ?? 0) + 1);
    monthCounts.set(month, (monthCounts.get(month) ?? 0) + 1);
    hourCounts[photo.date.getHours()] += 1;
  }

  const topDayKey = Array.from(dayCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0][0];
  const topMonthKey = Array.from(monthCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0][0];
  const topHour = hourCounts.indexOf(Math.max(...hourCounts));
  const spanDays = calendarDayIndex(sorted.at(-1)!.date) - calendarDayIndex(sorted[0].date);

  return {
    spanDays,
    topDayKey,
    topHour,
    topMonthKey,
    topPeriod: spanDays < 180 ? "day" : "month",
  };
}

export function inferMetadataPeople(
  photos: MetadataInferencePhoto[],
): MetadataPeopleInference {
  const people = new Map<string, {
    days: Set<string>;
    firstDate: Date;
    key: string;
    lastDate: Date;
    name: string;
    pairPhotoByDay: Map<string, string>;
    photoCount: number;
  }>();

  for (const photo of photos) {
    for (const participant of photo.participants) {
      const existing = people.get(participant.key) ?? {
        days: new Set<string>(),
        firstDate: photo.date,
        key: participant.key,
        lastDate: photo.date,
        name: participant.name,
        pairPhotoByDay: new Map<string, string>(),
        photoCount: 0,
      };
      existing.photoCount += 1;
      existing.days.add(localDayKey(photo.date));
      if (photo.date < existing.firstDate) existing.firstDate = photo.date;
      if (photo.date > existing.lastDate) existing.lastDate = photo.date;
      people.set(participant.key, existing);
    }
  }

  const sorted = Array.from(people.values())
    .sort((a, b) => b.photoCount - a.photoCount || b.days.size - a.days.size);
  const self = sorted[0];

  if (self) {
    for (const photo of photos) {
      if (photo.participants.length !== 2) continue;
      const selfIndex = photo.participants.findIndex((person) => person.key === self.key);
      if (selfIndex < 0) continue;
      const other = photo.participants[selfIndex === 0 ? 1 : 0];
      const person = people.get(other.key);
      const day = localDayKey(photo.date);
      if (person && !person.pairPhotoByDay.has(day)) {
        person.pairPhotoByDay.set(day, photo.id);
      }
    }
  }

  const results = sorted.map((person): InferredPerson => ({
    activeDays: person.days.size,
    firstDate: person.firstDate,
    key: person.key,
    lastDate: person.lastDate,
    name: person.name,
    pairDayPhotoIds: Array.from(person.pairPhotoByDay.values()),
    photoCount: person.photoCount,
  }));
  const inferredSelf = self
    ? results.find((person) => person.key === self.key)
    : undefined;
  const special = results
    .filter((person) => person.key !== inferredSelf?.key
      && person.pairDayPhotoIds.length >= 2)
    .sort((a, b) => b.pairDayPhotoIds.length - a.pairDayPhotoIds.length
      || b.photoCount - a.photoCount)[0];

  return {
    people: results,
    self: inferredSelf,
    special,
  };
}

export function inferRecurringFaces(
  clusters: FaceClusterInput[],
  photos: FaceInferencePhoto[],
  metadataSelfExists: boolean,
): RecurringFaceInference {
  const recurringClusters = clusters
    .filter((cluster) => cluster.days.size >= 2)
    .sort((a, b) => b.days.size - a.days.size || b.photoIds.size - a.photoIds.size);

  if (metadataSelfExists || recurringClusters.length === 0) {
    return {
      recurringFaceCount: recurringClusters.length,
      specialPhotoIds: [],
      visualPeople: [],
    };
  }

  const selfFaceId = recurringClusters[0].id;
  const recurringIds = new Set(recurringClusters.map((cluster) => cluster.id));
  const pairPhotoByDay = new Map<string, Map<string, string>>();

  for (const photo of photos) {
    const ids = Array.from(new Set(photo.faceClusterIds));
    if (ids.length !== 2 || !ids.includes(selfFaceId)) continue;
    const other = ids.find((id) => id !== selfFaceId);
    if (!other || !recurringIds.has(other)) continue;
    const day = localDayKey(photo.date);
    const matches = pairPhotoByDay.get(other) ?? new Map<string, string>();
    if (!matches.has(day)) matches.set(day, photo.id);
    pairPhotoByDay.set(other, matches);
  }

  const special = Array.from(pairPhotoByDay.entries())
    .filter(([, photosByDay]) => photosByDay.size >= 2)
    .sort((a, b) => b[1].size - a[1].size)[0];
  const visualPeople = recurringClusters
    .filter((cluster) => cluster.id !== selfFaceId)
    .flatMap((cluster): InferredVisualPerson[] => {
      const datedPhotos = photos
        .filter((photo) => cluster.photoIds.has(photo.id))
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      if (!datedPhotos.length) return [];
      return [{
        activeDays: cluster.days.size,
        firstDate: datedPhotos[0].date,
        id: cluster.id,
        lastDate: datedPhotos.at(-1)!.date,
        pairDayPhotoIds: Array.from(pairPhotoByDay.get(cluster.id)?.values() ?? []),
        photoIds: Array.from(cluster.photoIds),
      }];
    })
    .sort((a, b) => b.activeDays - a.activeDays
      || b.photoIds.length - a.photoIds.length);

  return {
    recurringFaceCount: recurringClusters.length,
    selfFaceId,
    specialFaceId: special?.[0],
    specialPhotoIds: Array.from(special?.[1].values() ?? []),
    visualPeople,
  };
}

export function inferRecurringScenes(
  clusters: FaceClusterInput[],
  limit = 6,
): InferredVisualScene[] {
  return clusters
    .filter((cluster) => cluster.days.size >= 2)
    .sort((a, b) => b.days.size - a.days.size
      || b.photoIds.size - a.photoIds.size)
    .slice(0, limit)
    .map((cluster) => ({
      activeDays: cluster.days.size,
      id: cluster.id,
      photoIds: Array.from(cluster.photoIds),
    }));
}

export function inferTemporalScenes(
  photos: TemporalScenePhoto[],
  limit = 6,
): InferredTemporalScene[] {
  const periods = new Map<string, {
    days: Set<string>;
    month: number;
    photoIds: string[];
    year: number;
  }>();

  photos.forEach((photo) => {
    const year = photo.date.getFullYear();
    const month = photo.date.getMonth() + 1;
    const id = `period-${year}-${String(month).padStart(2, "0")}`;
    const period = periods.get(id) ?? {
      days: new Set<string>(),
      month,
      photoIds: [],
      year,
    };
    period.days.add(localDayKey(photo.date));
    period.photoIds.push(photo.id);
    periods.set(id, period);
  });

  return Array.from(periods.entries())
    .sort((left, right) => right[1].days.size - left[1].days.size
      || right[1].photoIds.length - left[1].photoIds.length
      || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([id, period]) => ({
      activeDays: period.days.size,
      id,
      month: period.month,
      photoIds: period.photoIds,
      year: period.year,
    }));
}

export function selectSceneResults<T>(
  metadata: T[],
  visual: T[],
  temporal: T[],
): T[] {
  if (metadata.length) return metadata;
  if (visual.length) return visual;
  return temporal;
}
