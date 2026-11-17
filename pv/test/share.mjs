// Share round trip: export with a fake folder picker, serve the result, open it as a viewer.
import { chromium } from "playwright";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";
const out = "dist-demo/share-test"; rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
const srv = spawn("python3", ["-m", "http.server", "8765", "--directory", "dist-demo"], { stdio: "ignore" });
await new Promise((r) => setTimeout(r, 800));
const b = await chromium.launch(); const pg = await (await b.newContext({ viewport: { width: 1200, height: 900 }, locale: "ko-KR" })).newPage();
const errors = []; pg.on("pageerror", (e) => errors.push(e.message));
const requests = []; pg.on("request", (r) => requests.push(r.url()));
await pg.addInitScript(() => {
  window.__saved = {};
  window.showDirectoryPicker = async () => ({ getFileHandle: async (name) => ({ createWritable: async () => ({ write: async (d) => { window.__saved[name] = typeof d === "string" ? d : Array.from(new Uint8Array(await d.arrayBuffer())); }, close: async () => {} }) }) });
});
await pg.goto("http://localhost:8765/index.html");
await pg.locator("input[type=file]").first().setInputFiles("test/shots");
await pg.getByRole("button", { name: "영상 만들기" }).click();
await pg.locator(".stage canvas").waitFor({ timeout: 90000 });
await pg.locator(".check input").check(); await pg.locator(".veil").waitFor({ state: "detached" });
await pg.getByRole("button", { name: "공유용으로 내보내기" }).click();
await pg.locator("input[type=url]").fill("http://localhost:8765/share-test/");
await pg.getByRole("button", { name: "폴더에 저장" }).click();
await pg.getByText("저장 완료").waitFor();
const link = await pg.locator(".sheet a").getAttribute("href");
const saved = await pg.evaluate(() => window.__saved);
let bytes = 0;
for (const [name, data] of Object.entries(saved)) { const buf = typeof data === "string" ? Buffer.from(data) : Buffer.from(data); bytes += buf.length; writeFileSync(`${out}/${name}`, buf); }
const manifest = JSON.parse(saved["manifest.json"]);
console.log("exported", Object.keys(saved).length, "files,", (bytes / 1024).toFixed(0), "KB | link:", link);
console.log("names leaked into manifest:", /Mochi|ねこまる|하늘/.test(saved["manifest.json"]) ? "YES" : "no");
// viewer
requests.length = 0;
await pg.goto(link);
await pg.locator(".stage canvas").waitFor({ timeout: 60000 });
await pg.waitForTimeout(1500);
const imgs = requests.filter((u) => /\.jpg/.test(u));
console.log("viewer: time", await pg.locator(".time").innerText(), "| tools:", (await pg.locator(".tools button, .tools label").allInnerTexts()).join(" · "));
console.log("viewer image requests:", imgs.length, "e.g.", imgs[0]);
console.log("loaded images ok:", await pg.locator(".frame img").evaluateAll((els) => els.filter((e) => e.complete && e.naturalWidth > 0).length), "of", await pg.locator(".frame img").count());
console.log("photos in manifest:", manifest.photos.length, "| errors:", errors.length ? errors.join("; ") : "none");
// what a public host would be asked for
const probe = await pg.evaluate(() => { const a = document.createElement("a"); return a; }).catch(() => null);
await b.close(); srv.kill();
