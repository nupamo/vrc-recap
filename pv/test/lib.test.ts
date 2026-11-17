// Pipeline tests on a generated folder: `node test/make-shots.mjs` first (needs sharp), then `pnpm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { captureTime, dayKey, listShots } from "../src/lib/scan";
import { readAllMeta } from "../src/lib/pngMeta";
import { computeStats, type Entry } from "../src/lib/stats";
import { buildStoryboard, maskName, safeText } from "../src/lib/storyboard";
import { wsrv } from "../src/lib/images";

const labels = { intro: "Intro", worlds: "Worlds", people: "People", finale: "Finale" };
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
const load = (dir: string) => walk(dir).map((p) => new File([readFileSync(p)], p.split("/").pop()!));
async function entriesOf(dir: string, from: number, to: number): Promise<Entry[]> {
  const shots = listShots(load(dir)).filter((s) => s.ts >= from && s.ts <= to);
  const metas = await readAllMeta(shots);
  return shots.map((s, i) => ({ ...s, meta: metas[i] }));
}
const Y = (y: number, m = 0, d = 1) => new Date(y, m, d).getTime();
const have = existsSync("test/shots") && existsSync("test/shots-novrcx");

test("file names give the capture time; nights stay on the day they started", () => {
  assert.equal(captureTime("VRChat_2026-11-17_14-20-00.123_1920x1080.png", 0), new Date(2026, 10, 17, 14, 20, 0, 123).getTime());
  assert.equal(captureTime("VRChat_1920x1080_2021-05-01_12-00-00.123.png", 0), new Date(2021, 4, 1, 12, 0, 0, 123).getTime());
  assert.equal(captureTime("holiday.png", 42), 42);
  assert.equal(dayKey(new Date(2026, 2, 15, 2, 30).getTime()), "2026-03-14");
});

test("lyric syntax characters in names are neutralised", () => {
  assert.equal(safeText("Bar / Lounge *VIP*"), "Bar ／ Lounge ＊VIP＊");
  assert.equal(safeText("[JP] Tutorial World"), "［JP］ Tutorial World");
  assert.equal(safeText("Aster!"), "Aster！");
  assert.equal([...safeText("x".repeat(60))].length, 26);
  assert.equal(maskName("Mochi"), "M＊＊＊＊");
});

test("VRCX folder: period filter, worlds, people, storyboard", { skip: !have }, async () => {
  const all = listShots(load("test/shots"));
  assert.equal(all.length, 184, "non-image files are ignored");
  const entries = await entriesOf("test/shots", Y(2026), Y(2027) - 1);
  assert.ok(entries.length > 100 && entries.length < 184, "2025 photos are outside the period");
  assert.ok(entries.every((e) => new Date(e.ts).getFullYear() === 2026));
  const withTail = entries.filter((e) => e.meta?.vrcx).length;
  assert.ok(withTail > 60, "VRCX chunks are read, including ones written after the pixels");
  const st = computeStats(entries);
  assert.equal(st.self, "nupa");
  assert.ok(st.hasVrcx);
  assert.equal(st.people[0].name, "Mochi");
  assert.ok(!st.people.some((p) => p.name === "nupa"), "the photographer is not their own companion");
  assert.equal(st.worlds[0].name, "Japan Shrine");
  assert.ok(st.worldCoverage > 0.7);
  const a = buildStoryboard(st, { lang: "ko", seed: 1, hideNames: false, chapterLabels: labels });
  const b = buildStoryboard(st, { lang: "ko", seed: 1, hideNames: false, chapterLabels: labels });
  assert.deepEqual(a.beats, b.beats, "same seed, same video");
  assert.notDeepEqual(buildStoryboard(st, { lang: "ko", seed: 2, hideNames: false, chapterLabels: labels }).photoIds, a.photoIds);
  assert.ok(a.duration > 40 && a.duration < 90, `duration ${a.duration}`);
  assert.ok(a.chapters.some((c) => c.key === "people"));
  for (let i = 1; i < a.beats.length; i++) assert.ok(Math.abs(a.beats[i].start - (a.beats[i - 1].start + a.beats[i - 1].dur)) < 0.02, "beats are contiguous");
  assert.ok(a.beats.every((x) => x.photos.length > 0 && x.photos.every((id) => a.info[id])));
  assert.ok(a.beats.some((x) => x.line.includes("Mochi")));
  const hidden = buildStoryboard(st, { lang: "ko", seed: 1, hideNames: true, chapterLabels: labels });
  assert.ok(!JSON.stringify(hidden.beats).includes("Mochi"), "hidden names do not reach the video text or its data");
});

test("folder without VRCX: worlds from native XMP, no people chapter", { skip: !have }, async () => {
  const entries = await entriesOf("test/shots-novrcx", Y(2026), Y(2027) - 1);
  const st = computeStats(entries);
  assert.equal(st.hasVrcx, false);
  assert.equal(st.people.length, 0);
  assert.ok(st.worlds.length >= 5 && st.worlds[0].id?.startsWith("wrld_"));
  assert.equal(st.self, "nupa");
  const sb = buildStoryboard(st, { lang: "ja", seed: 3, hideNames: false, chapterLabels: labels });
  assert.ok(!sb.chapters.some((c) => c.key === "people"));
  assert.ok(sb.chapters.some((c) => c.key === "worlds"));
});

test("a short period still makes a video", { skip: !have }, async () => {
  const entries = await entriesOf("test/shots", Y(2026, 7), Y(2026, 8) - 1);
  assert.ok(entries.length >= 8);
  const sb = buildStoryboard(computeStats(entries), { lang: "en", seed: 5, hideNames: false, chapterLabels: labels });
  assert.ok(sb.beats.length >= 6 && sb.duration > 12);
});

test("shared photos go through wsrv.nl; hosts it cannot reach are used directly", () => {
  const u = new URL(wsrv("https://example.com/recap/001.jpg", 1900));
  assert.equal(u.origin, "https://wsrv.nl");
  assert.equal(u.searchParams.get("url"), "https://example.com/recap/001.jpg");
  assert.equal(u.searchParams.get("w"), "1920");
  assert.equal(u.searchParams.get("output"), "webp");
  assert.equal(new URL(wsrv("https://example.com/a.jpg", 1080)).searchParams.get("w"), "1120");
  assert.equal(wsrv("http://localhost:8765/share/001.jpg", 1920), "http://localhost:8765/share/001.jpg");
});
