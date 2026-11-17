// Generates a synthetic VRChat screenshot folder for tests: file names, VRCX "Description" chunks,
// native VRChat XMP chunks, and some files with no metadata at all.
import sharp from "sharp";
import { crc32 } from "node:zlib";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const out = process.argv[2] ?? "test/shots";
rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
let s = 12345; const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

const WORLDS = [["wrld_aaa", "Japan Shrine"], ["wrld_bbb", "ポピー横丁"], ["wrld_ccc", "Bar / Lounge *VIP*"], ["wrld_ddd", "별이 내리는 언덕"], ["wrld_eee", "Midnight Rooftop"], ["wrld_fff", "[JP] Tutorial World"], ["wrld_ggg", "Rainy Cafe"]];
const FRIENDS = ["Mochi", "ねこまる", "하늘", "Rin_0x", "kobi", "Aster!", "루나"];
const ME = "nupa";

function chunk(type, data) {
  const head = Buffer.alloc(8); head.writeUInt32BE(data.length, 0); head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "latin1"), data])) >>> 0, 0);
  return Buffer.concat([head, data, crc]);
}
const itxt = (keyword, text) => chunk("iTXt", Buffer.concat([Buffer.from(keyword, "latin1"), Buffer.from([0, 0, 0, 0, 0]), Buffer.from(text, "utf8")]));
const withChunk = (png, extra, atEnd) => atEnd ? Buffer.concat([png.subarray(0, png.length - 12), extra, png.subarray(png.length - 12)]) : Buffer.concat([png.subarray(0, 33), extra, png.subarray(33)]);

const pad = (n, l = 2) => String(n).padStart(l, "0");
let count = 0;
async function shot(date, world, kind, players) {
  const hue = (WORLDS.indexOf(world) * 51 + 20) % 360, hue2 = (hue + 40 + rnd() * 80) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue},70%,${35 + rnd() * 25}%)"/><stop offset="1" stop-color="hsl(${hue2},65%,${18 + rnd() * 20}%)"/></linearGradient></defs>
  <rect width="1280" height="720" fill="url(#g)"/><circle cx="${200 + rnd() * 880}" cy="${150 + rnd() * 400}" r="${80 + rnd() * 160}" fill="hsl(${hue2},80%,70%)" opacity=".55"/>
  <rect x="${rnd() * 900}" y="${420 + rnd() * 150}" width="${200 + rnd() * 300}" height="${90 + rnd() * 120}" fill="#fff" opacity=".18"/></svg>`;
  let png = await sharp(Buffer.from(svg)).png({ compressionLevel: 6 }).toBuffer();
  if (kind === "vrcx" || kind === "vrcx-end") {
    const json = JSON.stringify({ application: "VRCX", version: 1, author: { id: "usr_me", displayName: ME }, world: { id: world[0], name: world[1], instanceId: "12345~private" }, players: [ME, ...players].map((n, i) => ({ id: "usr_" + i, displayName: n })) });
    png = withChunk(png, itxt("Description", json), kind === "vrcx-end");
  } else if (kind === "xmp") {
    const xml = `<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><rdf:Description xmlns:xmp="http://ns.adobe.com/xap/1.0/"><xmp:CreatorTool>VRChat</xmp:CreatorTool><xmp:Author>usr_me</xmp:Author></rdf:Description><rdf:Description xmlns:vrc="http://ns.vrchat.com/vrc/1.0/"><vrc:World>${world[0]}</vrc:World><vrc:WorldDisplayName>${world[1].replace(/&/g, "&amp;").replace(/</g, "&lt;")}</vrc:WorldDisplayName><vrc:AuthorDisplayName>${ME}</vrc:AuthorDisplayName></rdf:Description></rdf:RDF></x:xmpmeta>`;
    png = withChunk(png, itxt("XML:com.adobe.xmp", xml), false);
  }
  const name = `VRChat_${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}_${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}.${pad(Math.floor(rnd() * 999), 3)}_1280x720.png`;
  const dir = join(out, `${date.getFullYear()}-${pad(date.getMonth() + 1)}`); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), png); count++;
}

const mode = process.argv[3] ?? "mixed";   // mixed | novrcx
// sessions: evenings and late nights from Dec 2025 to Nov 2026
for (let i = 0; i < 46; i++) {
  const day = new Date(2025, 11, 20 + Math.floor(i * 7.2 + rnd() * 3), 0, 0, 0);
  const hour = pick([21, 22, 23, 23, 0, 1, 1, 2]);
  const start = new Date(day.getTime() + (hour < 12 ? 24 + hour : hour) * 3600e3 + rnd() * 3000e3);
  const world = i % 5 === 0 ? WORLDS[0] : pick(WORLDS);
  const friends = [FRIENDS[0], ...FRIENDS.filter(() => rnd() < 0.3)].slice(0, 1 + Math.floor(rnd() * 4));
  const n = i === 30 ? 14 : 2 + Math.floor(rnd() * 4);
  const r = rnd();
  const kind = mode === "novrcx" ? (r < 0.7 ? "xmp" : "none") : r < 0.55 ? "vrcx" : r < 0.62 ? "vrcx-end" : r < 0.85 ? "xmp" : "none";
  for (let k = 0; k < n; k++) await shot(new Date(start.getTime() + k * (40 + rnd() * 200) * 1000), world, kind, friends);
}
writeFileSync(join(out, "notes.txt"), "not an image");
console.log(`${count} screenshots → ${out}`);
