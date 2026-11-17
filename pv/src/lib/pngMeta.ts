// Reads who/where from a VRChat PNG without decoding the image.
//  - VRCX writes an iTXt "Description" chunk with JSON: author, world, and every player in the instance.
//  - VRChat itself (2025.3.2+) writes XMP with the world and the photographer only.

export type PhotoMeta = {
  worldId?: string;
  worldName?: string;
  authorId?: string;
  authorName?: string;
  players: string[];
  /** true when the file carried VRCX's player list */
  vrcx: boolean;
};

const HEAD_BYTES = 64 * 1024;
const TAIL_BYTES = 96 * 1024;
const utf8 = new TextDecoder("utf-8", { fatal: false });

const clean = (v: unknown, max = 120): string | undefined => {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return s ? s.slice(0, max) : undefined;
};
const u32 = (b: Uint8Array, o: number) => b[o] * 0x1000000 + b[o + 1] * 0x10000 + b[o + 2] * 0x100 + b[o + 3];
const indexOfZero = (b: Uint8Array, from: number) => { for (let i = from; i < b.length; i++) if (b[i] === 0) return i; return -1; };

function readITXt(data: Uint8Array): { keyword: string; text: string } | null {
  const k = indexOfZero(data, 0);
  if (k <= 0 || k + 3 >= data.length) return null;
  if (data[k + 1] !== 0) return null; // compressed iTXt is not written by VRCX or VRChat
  const lang = indexOfZero(data, k + 3);
  if (lang < 0) return null;
  const tr = indexOfZero(data, lang + 1);
  if (tr < 0) return null;
  return { keyword: utf8.decode(data.subarray(0, k)), text: utf8.decode(data.subarray(tr + 1)) };
}

function fromVrcx(text: string): Partial<PhotoMeta> | null {
  try {
    const v = JSON.parse(text) as { author?: { id?: unknown; displayName?: unknown }; world?: { id?: unknown; name?: unknown; displayName?: unknown }; players?: Array<{ displayName?: unknown }> };
    const players = Array.isArray(v.players) ? v.players.map((p) => clean(p?.displayName, 80)).filter((x): x is string => !!x) : [];
    return {
      worldId: clean(v.world?.id), worldName: clean(v.world?.name ?? v.world?.displayName),
      authorId: clean(v.author?.id), authorName: clean(v.author?.displayName, 80),
      players, vrcx: Array.isArray(v.players),
    };
  } catch { return null; }
}

const unxml = (s: string) => s
  .replace(/&#(\d+);/g, (_, c: string) => String.fromCodePoint(+c))
  .replace(/&#x([0-9a-f]+);/gi, (_, c: string) => String.fromCodePoint(parseInt(c, 16)))
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

function xmlField(xml: string, ...names: string[]): string | undefined {
  for (const name of names) {
    const n = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const attr = xml.match(new RegExp(`${n}=["']([^"']+)["']`, "i"));
    if (attr) return clean(unxml(attr[1]));
    const el = xml.match(new RegExp(`<${n}[^>]*>([^<]+)</${n}>`, "i"));
    if (el) return clean(unxml(el[1]));
  }
  return undefined;
}

function fromXmp(xml: string): Partial<PhotoMeta> {
  const author = xmlField(xml, "xmp:Author");
  const isId = (s?: string) => !!s && /^usr_/.test(s);
  return {
    worldId: xmlField(xml, "vrc:WorldID", "vrc:World"),
    worldName: xmlField(xml, "vrc:WorldDisplayName"),
    authorId: xmlField(xml, "vrc:AuthorID") ?? (isId(author) ? author : undefined),
    authorName: xmlField(xml, "vrc:AuthorDisplayName") ?? (isId(author) ? undefined : author),
  };
}

function walkChunks(bytes: Uint8Array, start: number, visit: (type: string, data: Uint8Array) => void) {
  let o = start;
  while (o + 12 <= bytes.length) {
    const len = u32(bytes, o);
    const type = String.fromCharCode(bytes[o + 4], bytes[o + 5], bytes[o + 6], bytes[o + 7]);
    const end = o + 8 + len;
    if (type === "IDAT" || end + 4 > bytes.length) break;
    visit(type, bytes.subarray(o + 8, end));
    o = end + 4;
  }
}

/** Some writers append the text chunk after the pixels; find it by signature in the file tail. */
function findTailITXt(bytes: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 4; i + 8 < bytes.length; i++) {
    if (bytes[i] === 0x69 && bytes[i + 1] === 0x54 && bytes[i + 2] === 0x58 && bytes[i + 3] === 0x74) {
      const len = u32(bytes, i - 4);
      if (len > 0 && i + 4 + len <= bytes.length) { out.push(bytes.subarray(i + 4, i + 4 + len)); i += 4 + len; }
    }
  }
  return out;
}

export async function readPhotoMeta(file: File): Promise<PhotoMeta | null> {
  if (!/\.png$/i.test(file.name)) return null;
  const head = new Uint8Array(await file.slice(0, Math.min(file.size, HEAD_BYTES)).arrayBuffer());
  if (head.length < 20 || head[0] !== 137 || head[1] !== 80 || head[2] !== 78 || head[3] !== 71) return null;
  let vrcx: Partial<PhotoMeta> | null = null;
  let xmp: Partial<PhotoMeta> = {};
  const take = (data: Uint8Array) => {
    const t = readITXt(data);
    if (!t) return;
    if (t.keyword === "Description") vrcx = fromVrcx(t.text) ?? vrcx;
    else if (t.keyword === "XML:com.adobe.xmp") xmp = fromXmp(t.text);
  };
  walkChunks(head, 8, (type, data) => { if (type === "iTXt") take(data); });
  if (!vrcx && !xmp.worldId && !xmp.worldName && file.size > HEAD_BYTES) {
    const tail = new Uint8Array(await file.slice(Math.max(HEAD_BYTES, file.size - TAIL_BYTES)).arrayBuffer());
    for (const data of findTailITXt(tail)) take(data);
  }
  const v = (vrcx ?? {}) as Partial<PhotoMeta>;
  const meta: PhotoMeta = {
    worldId: v.worldId ?? xmp.worldId, worldName: v.worldName ?? xmp.worldName,
    authorId: v.authorId ?? xmp.authorId, authorName: v.authorName ?? xmp.authorName,
    players: v.players ?? [], vrcx: !!v.vrcx,
  };
  return meta.worldId || meta.worldName || meta.authorName || meta.authorId || meta.players.length ? meta : null;
}

/** Read metadata for many files with a small worker pool of concurrent reads. */
export async function readAllMeta<T extends { file: File }>(items: T[], onProgress?: (done: number, total: number) => void, concurrency = 12): Promise<Array<PhotoMeta | null>> {
  const out: Array<PhotoMeta | null> = new Array(items.length).fill(null);
  let next = 0, done = 0;
  const run = async () => {
    while (next < items.length) {
      const i = next++;
      try { out[i] = await readPhotoMeta(items[i].file); } catch { out[i] = null; }
      if (++done % 50 === 0 || done === items.length) onProgress?.(done, items.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return out;
}
