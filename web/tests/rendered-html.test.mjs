import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the private recap on its own page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="ko">/i);
  assert.match(html, /VRChat Recap/i);
  assert.match(html, /스크린샷 폴더 고르기/);
  assert.match(html, /내 사진 기억 샘플 보기/);
  assert.match(html, /업로드하지 않아요/);
  assert.match(html, /학습에 쓰지 않아요/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("serves the memory walk from a separate game route", async () => {
  const response = await render("/game");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /MEMORY WALK/);

  const [page, recap, session] = await Promise.all([
    readFile(new URL("../app/game/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/MemoryWalk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/gameSession.ts", import.meta.url), "utf8"),
  ]);
  assert.match(page, /<MemoryGame/);
  assert.match(page, /sessionStorage\.getItem\(GAME_SESSION_KEY\)/);
  assert.match(page, /createPublicSampleJourney\(\)/);
  assert.match(recap, /window\.location\.assign\("\/game"\)/);
  assert.match(session, /vrchat-recap\/memory-walk\/v5/);
  assert.match(session, /previewUrl: undefined/);
});

test("ships a redacted public sample made from every local photo", async () => {
  const [rawSample, adapter] = await Promise.all([
    readFile(new URL("../app/data/personal-sample.json", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/personalSample.ts", import.meta.url), "utf8"),
  ]);
  const sample = JSON.parse(rawSample);

  assert.equal(sample.schema, "vrchat-public-memory-sample/v1");
  assert.equal(sample.totalFiles, 4986);
  assert.equal(sample.decodedPhotos, 4986);
  assert.equal(sample.skippedPhotos, 0);
  assert.equal(sample.moments.length, 9);
  assert.equal(sample.moments.reduce((sum, moment) => sum + moment.photoCount, 0), 4986);
  assert.deepEqual(
    [...new Set(sample.moments.map((moment) => new Date(moment.date).getFullYear()))],
    [2018, 2019, 2026],
  );
  for (const moment of sample.moments) {
    assert.equal(moment.memoryPixels.length, 432);
    assert.ok(moment.memoryPixels.every((value) => Number.isInteger(value) && value >= 0 && value <= 15));
  }
  assert.equal(sample.privacy.originalPixelsIncluded, false);
  assert.equal(sample.privacy.filenamesIncluded, false);
  assert.equal(sample.privacy.worldNamesIncluded, false);
  assert.equal(sample.privacy.playerNamesIncluded, false);
  assert.doesNotMatch(rawSample, /VRChat_|wrld_|usr_|instanceId/i);
  assert.match(adapter, /원본을 공개하지 않고 기억 색상만 남겼어요/);
  assert.match(adapter, /companionNames: \[\]/);
});

test("analyzes every image locally with bounded working memory", async () => {
  const [app, analyzer, pngMetadata, packageJson] = await Promise.all([
    readFile(new URL("../app/MemoryWalk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/memory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/pngMetadata.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(app, /showDirectoryPicker/);
  assert.match(app, /webkitdirectory/);
  assert.match(app, /async function readDirectory\(handle: LocalDirectoryHandle\)/);
  assert.match(app, /const nestedFiles = await readDirectory\(directory\)/);
  assert.match(analyzer, /const MAX_MOMENTS = 64/);
  assert.match(analyzer, /for \(let index = 0; index < files\.length; index \+= 1\)/);
  assert.match(analyzer, /createImageBitmap/);
  assert.match(analyzer, /resizeWidth: 48/);
  assert.match(analyzer, /resizeHeight: 27/);
  assert.match(analyzer, /bitmap\.close\(\)/);
  assert.match(analyzer, /const quantizedPixels: number\[\] = \[\]/);
  assert.match(analyzer, /function aggregateMemoryPixels\(photos: PhotoMeta\[\]\)/);
  assert.match(analyzer, /memoryPixels: aggregateMemoryPixels\(session\.photos\)/);
  assert.match(analyzer, /schema: "vrchat-recap\/v5"/);
  assert.match(analyzer, /readEmbeddedPhotoMetadata/);
  assert.match(pngMetadata, /PNG_METADATA_PREFIX_BYTES = 64 \* 1024/);
  assert.match(pngMetadata, /if \(type === "IDAT" \|\| dataEnd \+ 4 > bytes\.length\) break/);
  assert.doesNotMatch(`${app}\n${analyzer}\n${pngMetadata}`, /\bfetch\s*\(/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
});

test("ships a same-origin local model and joins avatar changes by VRChat user id", async () => {
  const [app, analyzer, localVision, packageJson, model, wasm] = await Promise.all([
    readFile(new URL("../app/MemoryWalk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/memory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/localVision.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    stat(new URL("../public/models/efficientdet_lite0_uint8.tflite", import.meta.url)),
    stat(new URL("../public/mediapipe/wasm/vision_wasm_internal.wasm", import.meta.url)),
  ]);

  assert.match(packageJson, /@mediapipe\/tasks-vision/);
  assert.match(localVision, /FilesetResolver\.forVisionTasks\("\/mediapipe\/wasm"\)/);
  assert.match(localVision, /modelAssetPath: "\/models\/efficientdet_lite0_uint8\.tflite"/);
  assert.match(localVision, /ObjectDetector\.createFromOptions/);
  assert.match(localVision, /resizeWidth: 640/);
  assert.match(localVision, /detector\.detect\(bitmap\)/);
  assert.match(localVision, /bitmap\.close\(\)/);
  assert.doesNotMatch(localVision, /https?:\/\//);
  assert.ok(model.size > 4_000_000);
  assert.ok(wasm.size > 9_000_000);

  assert.match(analyzer, /createLocalAvatarDetector\(\)/);
  assert.match(analyzer, /const key = personKey\(player\.id, player\.displayName\)/);
  assert.match(analyzer, /return id \|\| `name:/);
  assert.match(analyzer, /hasStrongVisualEvidence/);
  assert.match(analyzer, /visualEvidencePhotos/);
  assert.match(app, /아바타를 바꿔도 같은 사람으로 이어집니다/);
  assert.match(app, /AI 근거/);
});

test("builds a new local pixel sprite from the supplied avatar", async () => {
  const app = await readFile(new URL("../app/MemoryWalk.tsx", import.meta.url), "utf8");
  assert.match(app, /async function createAvatarPixelSprite\(file: File\)/);
  assert.match(app, /sheet\.width = AVATAR_CELL_WIDTH \* 4/);
  assert.match(app, /sheet\.height = AVATAR_CELL_HEIGHT \* 3/);
  assert.match(app, /const enqueue = \(pixel: number\)/);
  assert.match(app, /const averageRegion =/);
  assert.match(app, /const featureHash|let featureHash/);
  assert.match(app, /The photo contributes only a compact palette and feature hash/);
  assert.match(app, /baseContext\.fillRect/);
  assert.doesNotMatch(app, /baseContext\.drawImage\(source/);
  assert.match(app, /return sheet\.toDataURL\("image\/png"\)/);
  assert.doesNotMatch(app, /drawImage\(avatar[^\n]*existing|face insertion/i);
});

test("turns memory colors into a hands-free walk without platformer rules", async () => {
  const game = await readFile(new URL("../app/MemoryGame.tsx", import.meta.url), "utf8");
  for (const era of ["FIRST LOGIN", "MIDNIGHT PLAZA", "PORTAL GARDEN", "MEMORY LINE", "STAR ARCHIVE", "FESTIVAL CLOUD", "RAINY ROOFTOP", "SNOW GLOBE", "SUNRISE LOBBY"]) {
    assert.match(game, new RegExp(era));
  }
  assert.match(game, /world-atlas-v2\.png/);
  assert.match(game, /function drawMemoryComposite/);
  assert.match(game, /function drawPixelPostcard/);
  assert.match(game, /elapsedRef\.current \+= delta \* speedRef\.current/);
  assert.match(game, /const holdAtSunrise = 4/);
  assert.match(game, /pausedRef/);
  assert.match(game, /자동으로 기억 속을 걷고 있어요/);
  assert.doesNotMatch(game, /jumpVelocity|maxJumps|buildMemoryPlatforms|landingPlatform|game over|clear state/iu);
  const atlas = await stat(new URL("../public/game/world-atlas-v2.png", import.meta.url));
  assert.ok(atlas.size > 100_000);
});

test("uses explicit VRChat metadata and a conservative recurring-friend rule", async () => {
  const [game, analyzer, pngMetadata] = await Promise.all([
    readFile(new URL("../app/MemoryGame.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/memory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/pngMetadata.ts", import.meta.url), "utf8"),
  ]);
  assert.match(pngMetadata, /vrc:WorldDisplayName/);
  assert.match(pngMetadata, /value\.world\?\.displayName \?\? value\.world\?\.name/);
  assert.match(pngMetadata, /players/);
  assert.match(analyzer, /value\.instances\.size >= 3 && value\.days\.size >= 2/);
  assert.match(analyzer, /metadata\.authorId/);
  assert.match(game, /moment\.companionNames\.slice\(0, 2\)/);
  assert.match(game, /moment\.companionNames\.length === 0/);
});
