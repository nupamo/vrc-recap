import type { PhotoMeta } from "./pngMeta";
import { dayKey, monthKey, DAY_SHIFT_MS, type Shot } from "./scan";

export type Entry = Shot & { meta: PhotoMeta | null };

export type WorldStat = { key: string; id?: string; name: string; days: number; photos: number; shots: Entry[] };
export type PersonStat = { name: string; days: number; photos: number; shots: Entry[] };
export type MonthStat = { key: string; year: number; month: number; photos: number; topWorld?: string; shots: Entry[] };

export type Stats = {
  from: number; to: number;
  photos: number; days: number;
  worlds: WorldStat[];
  months: MonthStat[];
  topHour?: { hour: number; photos: number; shots: Entry[] };
  topDay?: { key: string; photos: number; shots: Entry[] };
  people: PersonStat[];
  self?: string;
  /** VRCX player lists were found, so "who" can be told */
  hasVrcx: boolean;
  /** share of photos that carried a world */
  worldCoverage: number;
};

const top = <K,>(m: Map<K, number>): K | undefined => { let best: K | undefined, n = -1; for (const [k, v] of m) if (v > n) { n = v; best = k; } return best; };
const bump = <K,>(m: Map<K, number>, k: K, by = 1) => m.set(k, (m.get(k) ?? 0) + by);

export function computeStats(entries: Entry[]): Stats {
  const days = new Set<string>();
  const worlds = new Map<string, { id?: string; names: Map<string, number>; days: Set<string>; shots: Entry[] }>();
  const months = new Map<string, { shots: Entry[]; worlds: Map<string, number> }>();
  const hours = new Map<number, Entry[]>();
  const byDay = new Map<string, Entry[]>();
  const authors = new Map<string, number>();
  const seenIn = new Map<string, number>();
  let withWorld = 0, vrcxPhotos = 0;

  for (const e of entries) {
    const d = dayKey(e.ts);
    days.add(d);
    (byDay.get(d) ?? byDay.set(d, []).get(d)!).push(e);
    const h = new Date(e.ts).getHours();
    (hours.get(h) ?? hours.set(h, []).get(h)!).push(e);
    const mk = monthKey(e.ts);
    const mo = months.get(mk) ?? months.set(mk, { shots: [], worlds: new Map() }).get(mk)!;
    mo.shots.push(e);
    const m = e.meta;
    if (!m) continue;
    const wk = m.worldId ?? m.worldName;
    if (wk) {
      withWorld++;
      const w = worlds.get(wk) ?? worlds.set(wk, { id: m.worldId, names: new Map(), days: new Set(), shots: [] }).get(wk)!;
      if (m.worldName) { bump(w.names, m.worldName); bump(mo.worlds, m.worldName); }
      w.days.add(d); w.shots.push(e);
    }
    if (m.authorName) bump(authors, m.authorName);
    if (m.vrcx) { vrcxPhotos++; for (const p of new Set(m.players)) bump(seenIn, p); }
  }

  // The photographer: the embedded author, else whoever is in the most VRCX player lists.
  const self = top(authors) ?? (vrcxPhotos ? top(seenIn) : undefined);

  const people = new Map<string, { days: Set<string>; shots: Entry[] }>();
  for (const e of entries) {
    if (!e.meta?.vrcx) continue;
    const d = dayKey(e.ts);
    for (const p of new Set(e.meta.players)) {
      if (p === self) continue;
      const s = people.get(p) ?? people.set(p, { days: new Set(), shots: [] }).get(p)!;
      s.days.add(d); s.shots.push(e);
    }
  }

  const worldList: WorldStat[] = [...worlds.entries()]
    .map(([key, w]) => ({ key, id: w.id, name: top(w.names) ?? "", days: w.days.size, photos: w.shots.length, shots: w.shots }))
    .filter((w) => w.name)
    .sort((a, b) => b.days - a.days || b.photos - a.photos);

  const personList: PersonStat[] = [...people.entries()]
    .map(([name, p]) => ({ name, days: p.days.size, photos: p.shots.length, shots: p.shots }))
    .filter((p) => p.photos >= 2)
    .sort((a, b) => b.days - a.days || b.photos - a.photos);

  const monthList: MonthStat[] = [...months.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([key, m]) => ({ key, year: +key.slice(0, 4), month: +key.slice(5, 7), photos: m.shots.length, topWorld: top(m.worlds), shots: m.shots }));

  let topHour: Stats["topHour"]; for (const [hour, shots] of hours) if (!topHour || shots.length > topHour.photos) topHour = { hour, photos: shots.length, shots };
  let topDay: Stats["topDay"]; for (const [key, shots] of byDay) if (!topDay || shots.length > topDay.photos) topDay = { key, photos: shots.length, shots };

  return {
    from: entries.length ? entries[0].ts : 0, to: entries.length ? entries[entries.length - 1].ts : 0,
    photos: entries.length, days: days.size, worlds: worldList, months: monthList, topHour, topDay,
    people: personList, self, hasVrcx: vrcxPhotos > 0 && personList.length > 0,
    worldCoverage: entries.length ? withWorld / entries.length : 0,
  };
}

/** Local midnight of the shifted "day" a timestamp falls on — used for date inputs. */
export const dayStart = (ts: number) => { const d = new Date(ts - DAY_SHIFT_MS); d.setHours(0, 0, 0, 0); return d.getTime(); };
