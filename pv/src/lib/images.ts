// Photos shown in the video. Locally they are downscaled copies kept as blob URLs; in a shared
// recap they are remote files requested through wsrv.nl, which resizes, converts and caches them
// on its CDN so the origin serves each file roughly once.

export type Photo = { id: string; url: string; w: number; h: number; blob?: Blob; remote?: string };

export const LOCAL_MAX_WIDTH = 1600;

export async function downscale(file: Blob, maxWidth = LOCAL_MAX_WIDTH): Promise<{ blob: Blob; w: number; h: number }> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, maxWidth / bmp.width);
  const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
  let blob: Blob;
  if (typeof OffscreenCanvas !== "undefined") {
    const c = new OffscreenCanvas(w, h);
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    blob = await c.convertToBlob({ type: "image/jpeg", quality: 0.86 });
  } else {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    blob = await new Promise<Blob>((ok, err) => c.toBlob((b) => (b ? ok(b) : err(new Error("toBlob failed"))), "image/jpeg", 0.86));
  }
  bmp.close();
  return { blob, w, h };
}

export async function prepareLocal(items: Array<{ id: string; file: File }>, onProgress?: (done: number, total: number) => void): Promise<Record<string, Photo>> {
  const out: Record<string, Photo> = {};
  let next = 0, done = 0;
  const run = async () => {
    while (next < items.length) {
      const it = items[next++];
      try {
        const { blob, w, h } = await downscale(it.file);
        out[it.id] = { id: it.id, url: URL.createObjectURL(blob), w, h, blob };
      } catch { /* unreadable image: the beat simply shows one photo fewer */ }
      onProgress?.(++done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(3, items.length) }, run));
  return out;
}

export function releasePhotos(photos: Record<string, Photo>) {
  for (const p of Object.values(photos)) if (p.blob) URL.revokeObjectURL(p.url);
}

const isPrivateHost = (u: URL) => /^(localhost|127\.|10\.|192\.168\.|\[?::1)/.test(u.hostname) || u.hostname.endsWith(".local");

/** wsrv.nl URL for a publicly reachable image. Hosts wsrv cannot reach (localhost) are used directly. */
export function wsrv(remote: string, width: number): string {
  let u: URL;
  try { u = new URL(remote, typeof location !== "undefined" ? location.href : undefined); } catch { return remote; }
  if (isPrivateHost(u) || u.protocol === "file:" || u.protocol === "blob:") return u.href;
  const w = Math.min(1920, Math.max(320, Math.ceil(width / 160) * 160)); // few distinct widths → better CDN hit rate
  return `https://wsrv.nl/?url=${encodeURIComponent(u.href)}&w=${w}&output=webp&q=78&we`;
}

export const photoSrc = (p: Photo, width: number) => (p.remote ? wsrv(p.remote, width) : p.url);
