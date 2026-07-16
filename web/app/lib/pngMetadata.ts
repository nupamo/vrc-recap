export type EmbeddedPlayer = {
  id?: string;
  displayName: string;
};

export type EmbeddedPhotoMetadata = {
  authorId?: string;
  authorName?: string;
  captureDate?: string;
  instanceId?: string;
  players: EmbeddedPlayer[];
  worldId?: string;
  worldName?: string;
};

const PNG_METADATA_PREFIX_BYTES = 64 * 1024;
const decoder = new TextDecoder("utf-8", { fatal: false });
const latinDecoder = new TextDecoder("iso-8859-1", { fatal: false });

function cleanText(value: unknown, limit = 120): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = value.replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  return cleaned ? cleaned.slice(0, limit) : undefined;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset] * 0x1000000
    + bytes[offset + 1] * 0x10000
    + bytes[offset + 2] * 0x100
    + bytes[offset + 3]
  );
}

function findNull(bytes: Uint8Array, start: number): number {
  for (let index = start; index < bytes.length; index += 1) {
    if (bytes[index] === 0) return index;
  }
  return -1;
}

function decodeXml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function readXmlField(xml: string, qualifiedName: string): string | undefined {
  const escaped = qualifiedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const attribute = xml.match(new RegExp(`${escaped}=["']([^"']+)["']`, "i"));
  if (attribute) return cleanText(decodeXml(attribute[1]));
  const element = xml.match(new RegExp(`<${escaped}[^>]*>([^<]+)</${escaped}>`, "i"));
  return element ? cleanText(decodeXml(element[1])) : undefined;
}

function parseDescription(text: string): EmbeddedPhotoMetadata | null {
  try {
    const value = JSON.parse(text) as {
      author?: { id?: unknown; displayName?: unknown };
      players?: Array<{ id?: unknown; displayName?: unknown }>;
      world?: { id?: unknown; displayName?: unknown; instanceId?: unknown; name?: unknown };
    };
    const players = Array.isArray(value.players)
      ? value.players
        .flatMap((player): EmbeddedPlayer[] => {
          const displayName = cleanText(player?.displayName, 80);
          return displayName ? [{ id: cleanText(player?.id, 96), displayName }] : [];
        })
      : [];
    return {
      authorId: cleanText(value.author?.id, 96),
      authorName: cleanText(value.author?.displayName, 80),
      instanceId: cleanText(value.world?.instanceId, 160),
      players,
      worldId: cleanText(value.world?.id, 120),
      worldName: cleanText(value.world?.displayName ?? value.world?.name, 120),
    };
  } catch {
    return null;
  }
}

function parseXmp(text: string): Partial<EmbeddedPhotoMetadata> {
  return {
    authorId: readXmlField(text, "vrc:AuthorID"),
    authorName: readXmlField(text, "xmp:Author"),
    captureDate: readXmlField(text, "xmp:CreateDate") ?? readXmlField(text, "tiff:DateTime"),
    worldId: readXmlField(text, "vrc:WorldID"),
    worldName: readXmlField(text, "vrc:WorldDisplayName"),
  };
}

function decodeInternationalText(data: Uint8Array): { keyword: string; text: string } | null {
  const keywordEnd = findNull(data, 0);
  if (keywordEnd <= 0 || keywordEnd + 4 >= data.length) return null;
  const keyword = latinDecoder.decode(data.subarray(0, keywordEnd));
  const compressionFlag = data[keywordEnd + 1];
  if (compressionFlag !== 0) return null;
  const languageEnd = findNull(data, keywordEnd + 3);
  if (languageEnd < 0) return null;
  const translatedEnd = findNull(data, languageEnd + 1);
  if (translatedEnd < 0 || translatedEnd + 1 > data.length) return null;
  return { keyword, text: decoder.decode(data.subarray(translatedEnd + 1)) };
}

export async function readEmbeddedPhotoMetadata(file: File): Promise<EmbeddedPhotoMetadata | null> {
  if (!/\.png$/i.test(file.name) && file.type !== "image/png") return null;
  const bytes = new Uint8Array(
    await file.slice(0, Math.min(file.size, PNG_METADATA_PREFIX_BYTES)).arrayBuffer(),
  );
  if (bytes.length < 20 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) {
    return null;
  }

  let offset = 8;
  let description: EmbeddedPhotoMetadata | null = null;
  let xmp: Partial<EmbeddedPhotoMetadata> = {};
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset);
    const type = decoder.decode(bytes.subarray(offset + 4, offset + 8));
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (type === "IDAT" || dataEnd + 4 > bytes.length) break;
    if (type === "iTXt") {
      const decoded = decodeInternationalText(bytes.subarray(dataStart, dataEnd));
      if (decoded?.keyword === "Description") description = parseDescription(decoded.text);
      if (decoded?.keyword === "XML:com.adobe.xmp") xmp = parseXmp(decoded.text);
    }
    offset = dataEnd + 4;
  }

  const merged: EmbeddedPhotoMetadata = {
    authorId: description?.authorId ?? xmp.authorId,
    authorName: description?.authorName ?? xmp.authorName,
    captureDate: xmp.captureDate,
    instanceId: description?.instanceId,
    players: description?.players ?? [],
    worldId: description?.worldId ?? xmp.worldId,
    worldName: description?.worldName ?? xmp.worldName,
  };
  return merged.authorId || merged.authorName || merged.captureDate || merged.instanceId || merged.players.length || merged.worldId || merged.worldName
    ? merged
    : null;
}

export { PNG_METADATA_PREFIX_BYTES };
