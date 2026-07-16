import sampleData from "../data/personal-sample.json";
import type { MemoryJourney, MemoryMoment, YearRecap } from "./memory";

type PublicSampleMoment = {
  date: string;
  photoCount: number;
  accent: string;
  memoryPixels: number[];
};

type PublicSampleData = {
  schema: "vrchat-public-memory-sample/v1";
  totalFiles: number;
  decodedPhotos: number;
  skippedPhotos: number;
  startDate: string;
  endDate: string;
  moments: PublicSampleMoment[];
};

const sample = sampleData as PublicSampleData;

function seasonForMonth(month: number): string {
  if (month >= 3 && month <= 5) return "봄";
  if (month >= 6 && month <= 8) return "여름";
  if (month >= 9 && month <= 11) return "가을";
  return "겨울";
}

export function createPublicSampleJourney(): MemoryJourney {
  const moments: MemoryMoment[] = sample.moments.map((moment, index) => {
    const date = new Date(moment.date);
    return {
      id: `public-memory-${index}`,
      date: moment.date,
      photoCount: moment.photoCount,
      accent: moment.accent,
      motif: index % 6,
      echoStrength: 1 + (index % 3),
      fingerprint: moment.memoryPixels.slice(0, 40).map((value) => value / 15),
      worldName: `${date.getFullYear()}년 ${seasonForMonth(date.getMonth() + 1)}의 기억`,
      companionNames: [],
      companionStrength: 0,
      memoryPixels: moment.memoryPixels,
    };
  });

  const years = new Map<number, number>();
  moments.forEach((moment) => {
    const year = new Date(moment.date).getFullYear();
    years.set(year, (years.get(year) ?? 0) + moment.photoCount);
  });
  const activeYears: YearRecap[] = Array.from(years, ([year, photos]) => ({
    year,
    photos,
    activeDays: 0,
  })).sort((left, right) => left.year - right.year);
  const busiestEra = moments.reduce((best, moment) => (
    moment.photoCount > best.photoCount ? moment : best
  ), moments[0]);

  return {
    schema: "vrchat-recap/v5",
    generatedAt: new Date().toISOString(),
    totalPhotos: sample.decodedPhotos,
    startDate: sample.startDate,
    endDate: sample.endDate,
    analysisMs: 0,
    moments,
    stats: {
      activeDays: 0,
      totalSessions: moments.length,
      activeYears,
      busiestDay: busiestEra.date,
      busiestDayPhotos: busiestEra.photoCount,
      favoriteHour: 23,
      lateNightPercent: 0,
      weekendPercent: 0,
      favoriteSeason: "기억",
      longestStreakDays: 0,
      longestSessionPhotos: busiestEra.photoCount,
      recapPersona: "기억을 다시 걷는 사람",
      awards: [{
        id: "public-memory",
        title: "MEMORY ARCHIVE",
        value: `${sample.decodedPhotos.toLocaleString("ko-KR")}장`,
        description: "원본을 공개하지 않고 기억 색상만 남겼어요.",
      }],
      topMotifs: moments.slice(0, 6).map((moment, index) => ({
        motif: index,
        appearances: 1,
        accent: moment.accent,
      })),
      topWorlds: [],
      companions: [],
      metadataCoverage: 0,
      visuallyAnalyzed: sample.decodedPhotos,
      localModel: "공개 샘플에는 미포함",
      localModelStatus: "unavailable",
      modelAnalyzed: 0,
      avatarScenes: 0,
      avatarDetections: 0,
    },
  };
}
