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
  pairPhotoIds: string[];
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
};

function localDayKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    pairPhotoIds: string[];
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
        pairPhotoIds: [],
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
      people.get(other.key)?.pairPhotoIds.push(photo.id);
    }
  }

  const results = sorted.map((person): InferredPerson => ({
    activeDays: person.days.size,
    firstDate: person.firstDate,
    key: person.key,
    lastDate: person.lastDate,
    name: person.name,
    pairPhotoIds: [...person.pairPhotoIds],
    photoCount: person.photoCount,
  }));
  const inferredSelf = self
    ? results.find((person) => person.key === self.key)
    : undefined;
  const special = results
    .filter((person) => person.key !== inferredSelf?.key && person.pairPhotoIds.length > 0)
    .sort((a, b) => b.pairPhotoIds.length - a.pairPhotoIds.length
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
    .filter((cluster) => cluster.photoIds.size >= 2)
    .sort((a, b) => b.photoIds.size - a.photoIds.size || b.days.size - a.days.size);

  if (metadataSelfExists || recurringClusters.length === 0) {
    return {
      recurringFaceCount: recurringClusters.length,
      specialPhotoIds: [],
    };
  }

  const selfFaceId = recurringClusters[0].id;
  const recurringIds = new Set(recurringClusters.map((cluster) => cluster.id));
  const pairPhotos = new Map<string, string[]>();

  for (const photo of photos) {
    const ids = Array.from(new Set(
      photo.faceClusterIds.filter((id) => recurringIds.has(id)),
    ));
    if (ids.length !== 2 || !ids.includes(selfFaceId)) continue;
    const other = ids.find((id) => id !== selfFaceId);
    if (!other) continue;
    const matches = pairPhotos.get(other) ?? [];
    matches.push(photo.id);
    pairPhotos.set(other, matches);
  }

  const special = Array.from(pairPhotos.entries())
    .sort((a, b) => b[1].length - a[1].length)[0];

  return {
    recurringFaceCount: recurringClusters.length,
    selfFaceId,
    specialFaceId: special?.[0],
    specialPhotoIds: special?.[1] ?? [],
  };
}
