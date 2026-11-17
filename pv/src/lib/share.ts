// A shared recap is a manifest.json plus the downscaled photos, sitting on any static host.
// The viewer loads the manifest (?m=<url>) and requests the photos through wsrv.nl.
import type { Aspect, Look } from "./jizura";
import type { Lang } from "./i18n";
import type { Photo } from "./images";
import type { Storyboard } from "./storyboard";

export type Manifest = {
  schema: "vrc-recap-pv/1";
  story: Storyboard;
  photos: Array<{ id: string; file: string; w: number; h: number }>;
  seed: number; look: Look; aspect: Aspect; lang: Lang;
};

export type Settings = { seed: number; look: Look; aspect: Aspect; lang: Lang };

export function makeManifest(story: Storyboard, photos: Record<string, Photo>, s: Settings): Manifest {
  return {
    schema: "vrc-recap-pv/1", story,
    photos: story.photoIds.filter((id) => photos[id]).map((id, i) => ({ id, file: `${String(i + 1).padStart(3, "0")}.jpg`, w: photos[id].w, h: photos[id].h })),
    ...s,
  };
}

type DirHandle = { getFileHandle: (name: string, o: { create: boolean }) => Promise<{ createWritable: () => Promise<{ write: (b: Blob | string) => Promise<void>; close: () => Promise<void> }> }> };
export const canSaveFolder = () => typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === "function";

/** Writes manifest.json and the photos into a folder the user picks. Returns the number of files written. */
export async function saveShareFolder(manifest: Manifest, photos: Record<string, Photo>): Promise<number> {
  const dir = await (window as unknown as { showDirectoryPicker: (o: { mode: string }) => Promise<DirHandle> }).showDirectoryPicker({ mode: "readwrite" });
  const put = async (name: string, data: Blob | string) => { const w = await (await dir.getFileHandle(name, { create: true })).createWritable(); await w.write(data); await w.close(); };
  let n = 0;
  for (const p of manifest.photos) { const blob = photos[p.id]?.blob; if (blob) { await put(p.file, blob); n++; } }
  await put("manifest.json", JSON.stringify(manifest));
  return n + 1;
}

export async function loadManifest(url: string): Promise<{ manifest: Manifest; photos: Record<string, Photo> }> {
  const abs = new URL(url, location.href);
  const res = await fetch(abs.href);
  if (!res.ok) throw new Error(`manifest ${res.status}`);
  const manifest = (await res.json()) as Manifest;
  if (manifest.schema !== "vrc-recap-pv/1" || !Array.isArray(manifest.story?.beats)) throw new Error("unknown manifest");
  const photos: Record<string, Photo> = {};
  for (const p of manifest.photos) { const remote = new URL(p.file, abs).href; photos[p.id] = { id: p.id, url: remote, w: p.w, h: p.h, remote }; }
  return { manifest, photos };
}

export const shareLink = (base: string) => {
  const u = new URL(location.href); u.search = ""; u.hash = "";
  u.searchParams.set("m", new URL("manifest.json", base.endsWith("/") ? base : base + "/").href);
  return u.href;
};
