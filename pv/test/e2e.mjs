// End-to-end run of the demo bundle in headless Chromium: folder in → period → video → interactions.
// usage: node scripts/demo-build.mjs && node test/make-shots.mjs && node test/e2e.mjs [folder]
import { chromium } from "playwright";
const dir = process.argv[2] ?? "test/shots";
const tag = dir.replace(/\W+/g, "_");
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1200, height: 900 }, locale: "ko-KR" });
const pg = await ctx.newPage();
const errors = [];
pg.on("pageerror", (e) => errors.push("pageerror: " + e.message));
pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) errors.push("console: " + m.text().slice(0, 300)); });
await pg.goto("file://" + process.cwd() + "/dist-demo/index.html");
await pg.locator('input[type=file]').first().setInputFiles(dir);
await pg.getByText(/장을 찾았어요/).waitFor();
console.log("found:", await pg.locator(".lead").innerText(), "|", await pg.locator(".card .dim").first().innerText());
console.log("range:", await pg.locator('input[type=date]').evaluateAll((els) => els.map((e) => e.value).join(" → ")));
const t0 = Date.now();
await pg.getByRole("button", { name: "영상 만들기" }).click();
await pg.locator(".stage canvas").waitFor({ timeout: 90000 });
console.log("built in", Date.now() - t0, "ms |", await pg.locator(".time").innerText(), "|", await pg.locator(".note").innerText());
console.log("chapters:", (await pg.locator(".chapters button").allInnerTexts()).join(" · "));
const seek = async (frac) => { await pg.locator(".scrub input").evaluate((el, f) => { const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set; set.call(el, String(Math.round(+el.max * f))); el.dispatchEvent(new Event("input", { bubbles: true })); }, frac); await pg.waitForTimeout(250); };
await pg.getByRole("button", { name: "일시정지" }).click();
let i = 0;
for (const f of [0.03, 0.3, 0.62, 0.8]) { await seek(f); await pg.locator(".frame").screenshot({ path: `test/e2e_${tag}_${++i}.png` }); }
// playback advances on its own
const before = await pg.locator(".scrub input").inputValue();
await pg.getByRole("button", { name: "재생" }).click(); await pg.waitForTimeout(1200);
const after = await pg.locator(".scrub input").inputValue();
console.log("playback:", before, "→", after, +after > +before ? "ok" : "STUCK");
// chapter chip jumps
await pg.locator(".chapters button").nth(3).click(); await pg.waitForTimeout(200);
console.log("chapter jump → frame", await pg.locator(".scrub input").inputValue(), "| active:", await pg.locator(".chapters button.on").innerText());
// clicking the photo pauses and opens the lightbox
await pg.locator('.frame button[aria-label="photo"]').click({ position: { x: 300, y: 200 } });
await pg.locator(".lightbox img").waitFor();
console.log("lightbox:", (await pg.locator(".lightbox .meta > div").first().innerText()).replace(/\n/g, " | "), "| button now:", await pg.locator(".play").innerText());
await pg.locator(".frame").screenshot({ path: `test/e2e_${tag}_lightbox.png` });
await pg.getByRole("button", { name: "닫기" }).click();
// look, aspect, reroll
await pg.getByRole("button", { name: "반전" }).click(); await pg.locator(".veil").waitFor({ state: "detached" });
await pg.getByRole("button", { name: "일시정지" }).click(); await seek(0.3); await pg.locator(".frame").screenshot({ path: `test/e2e_${tag}_invert.png` });
await pg.getByRole("button", { name: "9:16" }).click(); await pg.locator(".veil").waitFor({ state: "detached" });
await seek(0.62); await pg.locator(".frame").screenshot({ path: `test/e2e_${tag}_tall.png` });
const c1 = await pg.locator(".stage canvas").evaluate((c) => [c.width, c.height].join("x"));
await pg.getByRole("button", { name: "다시 섞기" }).click(); await pg.locator(".veil").waitFor({ state: "detached" });
console.log("tall canvas:", c1, "| after reroll time:", await pg.locator(".time").innerText());
if (await pg.locator(".check input").count()) { await pg.locator(".check input").check(); await pg.locator(".veil").waitFor({ state: "detached" }); console.log("hide names: ok"); }
console.log(errors.length ? "ERRORS:\n" + errors.join("\n") : "no page errors");
await b.close();
