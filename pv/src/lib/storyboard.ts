// Turns the stats of a period into a timed list of beats. Each beat is one "lyric line" for JIZURA
// plus the photos that play underneath it.
import { V, type Lang } from "./i18n";
import type { Entry, Stats } from "./stats";

export type Beat = {
  id: string;
  chapter: string;
  /** JIZURA lyric line (already escaped) */
  line: string;
  start: number;
  dur: number;
  photos: string[];
  world?: { id?: string; name: string };
  person?: string;
};

export type PhotoInfo = { id: string; ts: number; world?: string; worldId?: string; players: string[] };

export type Storyboard = {
  beats: Beat[];
  /** seconds; the JIZURA plan adds its own short tail */
  duration: number;
  photoIds: string[];
  info: Record<string, PhotoInfo>;
  chapters: Array<{ key: string; label: string; start: number }>;
  year: string;
};

export type StoryOptions = { lang: Lang; seed: number; hideNames: boolean; chapterLabels: { intro: string; worlds: string; people: string; finale: string } };

export function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Characters that are syntax in a JIZURA lyric line are swapped for full-width look-alikes. */
export function safeText(s: string, max = 26): string {
  let t = s.replace(/\s+/g, " ").trim()
    .replace(/\//g, "／").replace(/\*/g, "＊").replace(/\|/g, "｜").replace(/\[/g, "［").replace(/\]/g, "］").replace(/!$/, "！");
  if (t.startsWith("#")) t = "＃" + t.slice(1);
  const chars = [...t];
  return chars.length > max ? chars.slice(0, max - 1).join("") + "…" : t;
}

export function maskName(name: string): string {
  const chars = [...name];
  return (chars[0] ?? "") + "＊".repeat(Math.min(4, Math.max(2, chars.length - 1)));
}

export function buildStoryboard(stats: Stats, opt: StoryOptions): Storyboard {
  const L = V[opt.lang];
  const rand = rng(opt.seed);
  const used = new Set<string>();
  const info: Record<string, PhotoInfo> = {};

  /** n photos spread through the candidates in time order, unused ones first. */
  const pick = (cands: Entry[], n: number): string[] => {
    if (!cands.length || n <= 0) return [];
    const fresh = cands.filter((e) => !used.has(e.id));
    const pool = fresh.length >= n ? fresh : cands;
    const out: Entry[] = [];
    const step = pool.length / n;
    for (let i = 0; i < n && out.length < pool.length; i++) {
      let idx = Math.min(pool.length - 1, Math.floor(i * step + rand() * step));
      while (out.includes(pool[idx])) idx = (idx + 1) % pool.length;
      out.push(pool[idx]);
    }
    out.sort((a, b) => a.ts - b.ts);
    for (const e of out) {
      used.add(e.id);
      info[e.id] = { id: e.id, ts: e.ts, world: e.meta?.worldName, worldId: e.meta?.worldId, players: e.meta?.vrcx ? e.meta.players.filter((n) => n !== stats.self) : [] };
    }
    return out.map((e) => e.id);
  };

  const all = stats.months.flatMap((m) => m.shots);
  const beats: Beat[] = [];
  const chapters: Storyboard["chapters"] = [];
  let t = 0.4;
  let chapter = "intro";
  const openChapter = (key: string, label: string) => { chapter = key; chapters.push({ key, label, start: t }); };
  const add = (line: string, dur: number, photos: string[], extra: Partial<Beat> = {}) => {
    beats.push({ id: `b${beats.length}`, chapter, line, start: +t.toFixed(2), dur, photos, ...extra });
    t += dur;
  };

  const y0 = new Date(stats.from).getFullYear(), y1 = new Date(stats.to).getFullYear();
  const year = y0 === y1 ? String(y1) : `${y0}–${y1}`;

  // ---- intro
  openChapter("intro", opt.chapterLabels.intro);
  add(y0 === y1 ? `*${y1}*` : `${y0}/*${y1}*`, 2.2, pick(all, 3));
  add("VRChat/Recap!", 2.0, pick(all, 2));
  add(L.photos(stats.photos), 2.2, pick(all, 4));
  add(L.days(stats.days), 2.0, pick(all, 2));
  if (stats.worlds.length >= 3) add(L.worlds(stats.worlds.length), 2.0, pick(all, 2));

  // ---- months (a single month is not a chapter list; the best day covers it)
  const months = stats.months.filter((m) => m.photos >= 2);
  if (months.length >= 2) {
    const per = months.length > 8 ? 2.0 : 2.6;
    const shown = months.length > 12 ? months.slice(-12) : months;
    for (const m of shown) {
      openChapter(m.key, L.month(m.month));
      const inTop = m.topWorld ? m.shots.filter((e) => e.meta?.worldName === m.topWorld) : [];
      const n = per > 2.2 ? 3 : 2;
      const photos = inTop.length >= n ? pick(inTop, n) : pick(m.shots, n);
      const line = m.topWorld ? `${L.month(m.month)}/*${safeText(m.topWorld)}*` : `*${L.month(m.month)}*`;
      add(line, per, photos, m.topWorld ? { world: { id: inTop[0]?.meta?.worldId, name: m.topWorld } } : {});
    }
  }

  // ---- worlds
  const topWorlds = stats.worlds.slice(0, 3);
  if (topWorlds.length) {
    openChapter("worlds", opt.chapterLabels.worlds);
    add(L.topWorlds, 1.8, pick(topWorlds[0].shots, 2));
    for (const w of topWorlds) add(`*${safeText(w.name)}*|${L.daysNote(w.days)}`, 2.6, pick(w.shots, 3), { world: { id: w.id, name: w.name } });
  }

  // ---- people (VRCX only)
  if (stats.hasVrcx) {
    const top = stats.people.slice(0, 4);
    openChapter("people", opt.chapterLabels.people);
    add(L.people, 1.8, pick(top[0].shots, 2));
    for (const p of top) {
      // photos with few people in them are the ones that are really "with" someone
      const close = [...p.shots].sort((a, b) => (a.meta?.players.length ?? 99) - (b.meta?.players.length ?? 99)).slice(0, Math.max(4, Math.ceil(p.shots.length / 3)));
      const name = opt.hideNames ? maskName(p.name) : p.name;
      add(`*${safeText(name, 20)}*|${L.daysNote(p.days)}`, 2.4, pick(close, 2), { person: name });
    }
  }

  // ---- finale
  openChapter("finale", opt.chapterLabels.finale);
  if (stats.topHour) add(`${L.hourHead}/*${L.hour(stats.topHour.hour)}*`, 2.8, pick(stats.topHour.shots, 3));
  if (stats.topDay && stats.topDay.photos >= 5) {
    const [, mm, dd] = stats.topDay.key.split("-").map(Number);
    add(`${L.bestDay}/*${L.date(mm, dd)}*|${L.photosNote(stats.topDay.photos)}`, 3.2, pick(stats.topDay.shots, 5));
  }
  add(L.outro, 2.2, pick(all.slice(-Math.max(6, Math.ceil(all.length / 10))), 2));
  add(`＃VRCRecap${y1}`, 2.6, pick(all, 2));

  return { beats, duration: +t.toFixed(2), photoIds: [...used], info, chapters, year };
}
