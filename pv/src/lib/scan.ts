// Folder intake: list image files and read the capture time from the VRChat file name.
// Nothing is decoded here, so tens of thousands of files list in well under a second.

export type Shot = {
  id: string;
  file: File;
  name: string;
  /** Capture time, local, in ms. */
  ts: number;
};

const IMAGE = /\.(png|jpe?g|webp)$/i;
// VRChat_2026-11-17_14-20-00.123_1920x1080.png and the older VRChat_1920x1080_2021-05-01_12-00-00.123.png
const STAMP = /(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})(?:\.(\d{1,3}))?/;

export function captureTime(name: string, fallback: number): number {
  const m = name.match(STAMP);
  if (!m) return fallback;
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6], +(m[7] ?? 0)).getTime();
  return Number.isFinite(t) ? t : fallback;
}

export function listShots(files: Iterable<File>): Shot[] {
  const shots: Shot[] = [];
  let n = 0;
  for (const file of files) {
    if (!IMAGE.test(file.name)) continue;
    shots.push({ id: `p${n++}`, file, name: file.name, ts: captureTime(file.name, file.lastModified) });
  }
  return shots.sort((a, b) => a.ts - b.ts);
}

/** Walk a dropped folder (DataTransferItem.webkitGetAsEntry) and collect its files. */
export async function filesFromDrop(items: DataTransferItemList): Promise<File[]> {
  type Entry = { isFile: boolean; isDirectory: boolean; file?: (ok: (f: File) => void, err: (e: unknown) => void) => void; createReader?: () => { readEntries: (ok: (e: Entry[]) => void, err: (e: unknown) => void) => void } };
  const roots: Entry[] = [];
  for (const item of Array.from(items)) {
    const entry = (item as DataTransferItem & { webkitGetAsEntry?: () => Entry | null }).webkitGetAsEntry?.();
    if (entry) roots.push(entry);
  }
  const out: File[] = [];
  const walk = async (entry: Entry): Promise<void> => {
    if (entry.isFile && entry.file) {
      const f = await new Promise<File | null>((ok) => entry.file!(ok, () => ok(null)));
      if (f) out.push(f);
    } else if (entry.isDirectory && entry.createReader) {
      const reader = entry.createReader();
      for (;;) {
        // readEntries returns the directory in batches; an empty batch means done
        const batch = await new Promise<Entry[]>((ok) => reader.readEntries(ok, () => ok([])));
        if (!batch.length) break;
        for (const child of batch) await walk(child);
      }
    }
  };
  for (const root of roots) await walk(root);
  return out;
}

/** Days are cut at 05:00 so a night that runs past midnight stays one day. */
export const DAY_SHIFT_MS = 5 * 3600 * 1000;
export function dayKey(ts: number): string {
  const d = new Date(ts - DAY_SHIFT_MS);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function monthKey(ts: number): string {
  return dayKey(ts).slice(0, 7);
}
