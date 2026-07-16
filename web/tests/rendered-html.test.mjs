import assert from "node:assert/strict";
import { access, readFile, stat } from "node:fs/promises";
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

test("renders the photo-first recap in Korean by default", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="ko">/i);
  assert.match(html, /사진 속에 남은/);
  assert.match(html, /우리의 시간/);
  assert.match(html, /사진 폴더 고르기/);
  assert.match(html, /한국어/);
  assert.match(html, /English/);
  assert.match(html, /日本語/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("removes the game route, game code, and game assets", async () => {
  const response = await render("/game");
  assert.equal(response.status, 404);
  await assert.rejects(access(new URL("../app/MemoryGame.tsx", import.meta.url)));
  await assert.rejects(access(new URL("../app/game/page.tsx", import.meta.url)));
  await assert.rejects(access(new URL("../app/lib/gameSession.ts", import.meta.url)));
  await assert.rejects(access(new URL("../public/game", import.meta.url)));

  const app = await readFile(new URL("../app/MemoryWalk.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /MemoryGame|GAME_SESSION|window\.location\.assign\("\/game"\)|platformer|game controls/i);
});

test("keeps technical model language out of every user-facing recap string", async () => {
  const app = await readFile(new URL("../app/MemoryWalk.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(app, /MediaPipe|EfficientDet|BlazeFace|ObjectDetector|FaceDetector|LOCAL MODEL|AI PASS|로컬 모델|로컬 AI|양자화|익명화|추론 엔진/i);
  assert.match(app, /YOUR PHOTOS · YOUR PEOPLE · YOUR WORLDS/);
  assert.match(app, /둘만 남긴 순간을 발견했어요/);
  assert.match(app, /A memory of just the two of you/);
  assert.match(app, /ふたりだけで残した一枚/);
});

test("supports Korean, English, and Japanese without translating metadata values", async () => {
  const app = await readFile(new URL("../app/MemoryWalk.tsx", import.meta.url), "utf8");
  assert.match(app, /type Language = "ko" \| "en" \| "ja"/);
  assert.match(app, /LANGUAGE_STORAGE_KEY/);
  assert.match(app, /navigator\.language/);
  assert.match(app, /document\.documentElement\.lang = next/);
  assert.match(app, /photo\.worldName/);
  assert.match(app, /photo\.nicknames\.join\(" · "\)/);
  assert.match(app, /new Intl\.DateTimeFormat\(localeFor\(language\)/);
});

test("shows real photos, names, worlds, and discoveries while processing", async () => {
  const [app, analyzer] = await Promise.all([
    readFile(new URL("../app/MemoryWalk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/memory.ts", import.meta.url), "utf8"),
  ]);
  assert.match(analyzer, /photo: \{/);
  assert.match(analyzer, /file,/);
  assert.match(analyzer, /nicknames: participants\.map/);
  assert.match(analyzer, /worldName: record\.worldName/);
  assert.match(analyzer, /discoveries\.photosWithTwoPeople/);
  assert.match(app, /URL\.createObjectURL\(photo\.file\)/);
  assert.match(app, /loading-filmstrip/);
  assert.match(app, /current\.nicknames\.join\(" · "\)/);
  assert.match(app, /progress\.discoveries\.topNames/);
});

test("infers self and the standout two-person relationship from metadata", async () => {
  const [analyzer, inference, metadata] = await Promise.all([
    readFile(new URL("../app/lib/memory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/recapInference.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/pngMetadata.ts", import.meta.url), "utf8"),
  ]);
  assert.match(metadata, /value\.world\?\.displayName \?\? value\.world\?\.name/);
  assert.match(metadata, /players/);
  assert.match(analyzer, /add\(metadata\.authorId, metadata\.authorName\)/);
  assert.match(analyzer, /metadata\.players\.forEach/);
  assert.match(analyzer, /inferMetadataPeople\(records\)/);
  assert.match(inference, /sort\(\(a, b\) => b\.photoCount - a\.photoCount/);
  assert.match(inference, /photo\.participants\.length !== 2/);
  assert.match(inference, /pairPhotoIds\.push\(photo\.id\)/);
  assert.match(inference, /const special = results/);
  assert.match(analyzer, /displayName: specialMetadataPerson\.name/);
});

test("falls back to metadata when face processing is unavailable and uses recurring faces when metadata is absent", async () => {
  const [analyzer, inference, localVision, packageJson, model, wasm] = await Promise.all([
    readFile(new URL("../app/lib/memory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/recapInference.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/localVision.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    stat(new URL("../public/models/blaze_face_short_range.tflite", import.meta.url)),
    stat(new URL("../public/mediapipe/wasm/vision_wasm_internal.wasm", import.meta.url)),
  ]);

  assert.match(packageJson, /@mediapipe\/tasks-vision/);
  assert.match(localVision, /FaceDetector\.createFromOptions/);
  assert.match(localVision, /modelAssetPath: "\/models\/blaze_face_short_range\.tflite"/);
  assert.match(localVision, /FilesetResolver\.forVisionTasks\("\/mediapipe\/wasm"\)/);
  assert.match(localVision, /descriptor/);
  assert.match(localVision, /mirroredDescriptor/);
  assert.doesNotMatch(localVision, /https?:\/\//);
  assert.ok(model.size > 200_000);
  assert.ok(wasm.size > 9_000_000);

  assert.match(analyzer, /try \{\s*faceDetector = await createLocalFaceDetector\(\);\s*\} catch \{\s*faceDetector = null;/s);
  assert.match(analyzer, /faceDetector && participants\.length === 0/);
  assert.match(analyzer, /assignFaceClusters/);
  assert.match(analyzer, /inferRecurringFaces\(faceClusters, records, Boolean\(self\)\)/);
  assert.match(inference, /recurringClusters/);
  assert.match(inference, /const selfFaceId = recurringClusters\[0\]\.id/);
  assert.match(inference, /const pairPhotos = new Map/);
  assert.match(analyzer, /inference: "faces"/);
});

test("uses original selected photos while keeping memory bounded", async () => {
  const [app, analyzer, css] = await Promise.all([
    readFile(new URL("../app/MemoryWalk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/memory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(analyzer, /MAX_TIMELINE_PHOTOS = 18/);
  assert.match(analyzer, /MAX_SPECIAL_PHOTOS = 6/);
  assert.match(analyzer, /selectedRecords = new Map/);
  assert.match(analyzer, /URL\.createObjectURL\(photo\.file\)/);
  assert.match(analyzer, /URL\.revokeObjectURL/);
  assert.match(app, /previewsRef\.current\.slice\(7\)/);
  assert.match(css, /object-fit: contain/);
});

test("supports recursive folder selection and the browser folder-input fallback", async () => {
  const app = await readFile(new URL("../app/MemoryWalk.tsx", import.meta.url), "utf8");
  assert.match(app, /showDirectoryPicker/);
  assert.match(app, /async function readDirectory\(handle: LocalDirectoryHandle\)/);
  assert.match(app, /files\.push\(\.\.\.await readDirectory\(directory\)\)/);
  assert.match(app, /webkitdirectory/);
  assert.match(app, /multiple/);
});

test("turns the final chapter into a Twitter-ready comprehensive result card", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../app/MemoryWalk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(app, /className="recap-share-chapter"/);
  assert.match(app, /className="share-summary-card"/);
  assert.match(app, /journey\.totalPhotos/);
  assert.match(app, /journey\.stats\.activeDays/);
  assert.match(app, /journey\.stats\.topMonth/);
  assert.match(app, /journey\.stats\.topWorlds\[0\]/);
  assert.match(app, /specialName/);
  assert.match(app, /journey\.stats\.people\.slice\(0, 4\)/);
  assert.match(app, /createShareCardBlob/);
  assert.match(app, /canvas\.width = 1600/);
  assert.match(app, /canvas\.height = 900/);
  assert.match(app, /canvas\.toBlob/);
  assert.match(app, /navigator\.canShare/);
  assert.match(app, /navigator\.share/);
  assert.match(app, /twitter\.com\/intent\/tweet/);
  assert.match(app, /downloadBlob/);
  assert.match(app, /이미지로 공유하기/);
  assert.match(app, /Share as an image/);
  assert.match(app, /画像として共有/);
  assert.doesNotMatch(app, /className="recap-ending"/);
  assert.match(css, /\.share-summary-card \{/);
  assert.match(css, /aspect-ratio: 16 \/ 9/);
  assert.match(css, /\.share-summary-photos img \{[\s\S]*object-fit: contain/);
});
