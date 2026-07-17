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

test("renders the photo-first recap in English by default", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<html lang="en">/i);
  assert.match(html, /Still alive in our photos/);
  assert.match(html, /the time we shared/);
  assert.match(html, /Choose photo folder/);
  assert.match(html, /한국어/);
  assert.match(html, /English/);
  assert.match(html, /日本語/);
  assert.match(html, /Your photos are never sent to a server/);
  assert.match(html, /vrc-recap-mark\.png/);
  assert.match(html, /<footer class="recap-footer intro-footer">[\s\S]*©[\s\S]*href="https:\/\/x\.com\/nupamo"/);
  assert.match(html, /googletagmanager\.com\/gtag\/js\?id=G-SYEWNRRSVM/);
  assert.match(html, /gtag\('config', 'G-SYEWNRRSVM'\)/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("builds a repository-aware static export for GitHub Pages", async () => {
  const [nextConfig, viteConfig, layout, localVision, workflow, exportedIndex, ogImage, brandMark] = await Promise.all([
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/localVision.ts", import.meta.url), "utf8"),
    readFile(new URL("../../.github/workflows/deploy.yml", import.meta.url), "utf8"),
    stat(new URL("../dist/client/index.html", import.meta.url)),
    stat(new URL("../public/og.png", import.meta.url)),
    stat(new URL("../public/vrc-recap-mark.png", import.meta.url)),
  ]);

  assert.match(nextConfig, /output: "export"/);
  assert.match(nextConfig, /trailingSlash: true/);
  assert.match(nextConfig, /GITHUB_PAGES/);
  assert.match(nextConfig, /NEXT_PUBLIC_BASE_PATH/);
  assert.match(viteConfig, /base: publicBasePath/);
  assert.doesNotMatch(layout, /headers\(\)|next\/headers|generateMetadata/);
  assert.match(layout, /export const metadata: Metadata/);
  assert.match(layout, /\/og\.png/);
  assert.match(layout, /vrc-recap-mark\.png/);
  assert.match(layout, /width: 2108/);
  assert.match(layout, /height: 1204/);
  assert.match(layout, /Your VRChat Memories, Revisited/);
  assert.match(layout, /canonical: siteUrl/);
  assert.match(layout, /locale: "en_US"/);
  assert.match(layout, /robots: \{/);
  assert.match(layout, /const googleAnalyticsId = "G-SYEWNRRSVM"/);
  assert.match(layout, /window\.dataLayer = window\.dataLayer \|\| \[\]/);
  assert.match(layout, /gtag\('config', '\$\{googleAnalyticsId\}'\)/);
  assert.match(localVision, /publicAssetPath/);
  assert.match(workflow, /actions\/upload-pages-artifact@v4/);
  assert.match(workflow, /path: "\.\/web\/dist\/client"/);
  assert.ok(exportedIndex.size > 0);
  assert.ok(ogImage.size > 0);
  assert.ok(brandMark.size > 0);
});

test("removes the game route, game code, and game assets", async () => {
  const response = await render("/game");
  assert.equal(response.status, 308);
  assert.equal(response.headers.get("location"), "/game/");
  const canonicalResponse = await render("/game/");
  assert.equal(canonicalResponse.status, 404);
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
  assert.match(app, /서로 다른 날에 둘만 남긴 순간/);
  assert.match(app, /across different days/);
  assert.match(app, /別の日にも続く/);
});

test("supports Korean, English, and Japanese without translating metadata values", async () => {
  const app = await readFile(new URL("../app/MemoryWalk.tsx", import.meta.url), "utf8");
  assert.match(app, /type Language = 'ko' \| 'en' \| 'ja'/);
  assert.match(app, /LANGUAGE_STORAGE_KEY/);
  assert.match(app, /useState<Language>\('en'\)/);
  assert.match(app, /const next: Language =[\s\S]*stored === 'en'[\s\S]*: 'en'/);
  assert.match(app, /document\.documentElement\.lang = next/);
  assert.match(app, /photo\.worldName/);
  assert.match(app, /photo\.nicknames\.join\(' · '\)/);
  assert.match(app, /new Intl\.DateTimeFormat\(localeFor\(language\)/);
});

test("uses smaller CJK display type and phrase-aware wrapping", async () => {
  const [app, css] = await Promise.all([
    readFile(new URL("../app/MemoryWalk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(css, /html:lang\(ko\) body,[\s\S]*html:lang\(ja\) body \{[\s\S]*line-break: strict;[\s\S]*word-break: keep-all;/);
  assert.match(css, /@supports \(word-break: auto-phrase\)[\s\S]*word-break: auto-phrase;/);
  assert.match(css, /html:lang\(ko\) \.memory-hero h1 \{[\s\S]*font-size: clamp\(54px, 6vw, 90px\)/);
  assert.match(css, /html:lang\(ja\) \.memory-hero h1 \{[\s\S]*font-size: clamp\(50px, 5vw, 80px\)/);
  assert.match(css, /html:lang\(ko\) \.share-summary-copy h3 \{[\s\S]*white-space: normal;/);
  assert.match(css, /html:lang\(ja\) \.share-summary-copy h3 \{[\s\S]*white-space: normal;/);
  assert.match(app, /const shareTitleFontSize =[\s\S]*language === 'en' \? 67 : language === 'ko' \? 59 : 54/);
  assert.match(app, /const shareValueFontSize =[\s\S]*language === 'en' \? 27 : language === 'ko' \? 24 : 22/);
});

test("shows real photos, names, worlds, and discoveries while processing", async () => {
  const [app, analyzer, css] = await Promise.all([
    readFile(new URL("../app/MemoryWalk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/memory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(analyzer, /photo: \{/);
  assert.match(analyzer, /file,/);
  assert.match(analyzer, /nicknames: participants\.map/);
  assert.match(analyzer, /worldName: record\.worldName/);
  assert.match(analyzer, /discoveries\.daysWithTwoPeople/);
  assert.match(app, /URL\.createObjectURL\(photo\.file\)/);
  assert.match(app, /loading-filmstrip/);
  assert.match(app, /current\.nicknames\.join\(' · '\)/);
  assert.match(app, /progress\.discoveries\.topNames/);
  assert.match(analyzer, /stage: "preparing",[\s\S]*await waitForPaint\(\)/);
  assert.match(app, /memory-progress \$\{isPreparing \? 'is-indeterminate'/);
  assert.match(app, /loading-film-placeholder/);
  assert.match(css, /@keyframes loading-progress/);
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
  assert.match(inference, /pairPhotoByDay\.set\(day, photo\.id\)/);
  assert.match(inference, /pairDayPhotoIds\.length >= 2/);
  assert.match(inference, /const special = results/);
  assert.match(analyzer, /displayName: specialMetadataPerson\.name/);
});

test("builds meaningful people and place results from local visual analysis when metadata is absent", async () => {
  const [
    app,
    analyzer,
    inference,
    localVision,
    packageJson,
    faceModel,
    objectModel,
    embeddingModel,
    wasm,
  ] = await Promise.all([
    readFile(new URL("../app/MemoryWalk.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/memory.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/recapInference.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/localVision.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    stat(new URL("../public/models/blaze_face_short_range.tflite", import.meta.url)),
    stat(new URL("../public/models/efficientdet_lite0_uint8.tflite", import.meta.url)),
    stat(new URL("../public/models/mobilenet_v3_small.tflite", import.meta.url)),
    stat(new URL("../public/mediapipe/wasm/vision_wasm_internal.wasm", import.meta.url)),
  ]);

  assert.match(packageJson, /@mediapipe\/tasks-vision/);
  assert.match(localVision, /FaceDetector\.createFromOptions/);
  assert.match(localVision, /ObjectDetector\.createFromOptions/);
  assert.match(localVision, /ImageEmbedder\.createFromOptions/);
  assert.match(localVision, /modelAssetPath: publicAssetPath\("\/models\/blaze_face_short_range\.tflite"\)/);
  assert.match(localVision, /modelAssetPath: publicAssetPath\("\/models\/efficientdet_lite0_uint8\.tflite"\)/);
  assert.match(localVision, /modelAssetPath: publicAssetPath\("\/models\/mobilenet_v3_small\.tflite"\)/);
  assert.match(localVision, /categoryAllowlist: \["person"\]/);
  assert.match(localVision, /minDetectionConfidence: 0\.18/);
  assert.match(localVision, /scoreThreshold: 0\.08/);
  assert.match(localVision, /mergeCandidates\(faceCandidates, personCandidates\)/);
  assert.match(localVision, /source: "portrait"/);
  assert.match(localVision, /FilesetResolver\.forVisionTasks\([\s\S]*publicAssetPath\("\/mediapipe\/wasm"\)/);
  assert.match(localVision, /sceneDescriptor/);
  assert.match(localVision, /candidateFramingScore/);
  assert.match(localVision, /selfieScore/);
  assert.match(localVision, /regionOfInterest/);
  assert.doesNotMatch(localVision, /https?:\/\//);
  assert.ok(faceModel.size > 200_000);
  assert.ok(objectModel.size > 4_000_000);
  assert.ok(embeddingModel.size > 4_000_000);
  assert.ok(wasm.size > 9_000_000);

  assert.match(analyzer, /visualAnalyzer = await createLocalVisualAnalyzer\(\)/);
  assert.match(analyzer, /record\.selfieScore = result\.selfieScore/);
  assert.match(analyzer, /representativePhoto\(records,/);
  assert.match(analyzer, /function isSelfAlone/);
  assert.match(analyzer, /photo\.participants\.length === 1/);
  assert.match(analyzer, /photo\.subjectClusterIds\.length === 1/);
  assert.match(analyzer, /photo\.selfieScore - best\.photo\.selfieScore/);
  assert.match(analyzer, /assignSubjectClusters/);
  assert.match(analyzer, /assignSceneCluster/);
  assert.match(analyzer, /inferRecurringScenes\(sceneClusters\)/);
  assert.match(analyzer, /b\.days\.size - a\.days\.size/);
  assert.match(analyzer, /const visualPeople = faceInference\.visualPeople/);
  assert.match(analyzer, /const recapPeople = metadataPeople\.length \? metadataPeople : visualPeople/);
  assert.match(analyzer, /inferTemporalScenes\(records\)/);
  assert.match(analyzer, /selectSceneResults\([\s\S]*metadataWorldEntries,[\s\S]*visualWorldEntries,[\s\S]*temporalWorldEntries/);
  assert.match(analyzer, /visualPersonRepresentativeRecords/);
  assert.match(analyzer, /photoId: visualPersonRepresentativeRecords\.get\(person\.id\)\?\.id/);
  assert.match(analyzer, /photoId: visualSelfRecord\?\.id/);
  assert.match(analyzer, /activeMonths: monthCounts\.size/);
  assert.match(analyzer, /schema: "vrchat-recap\/v11"/);
  assert.match(analyzer, /summarizeRecapPeriods\(records\)/);
  assert.match(inference, /recurringClusters/);
  assert.match(inference, /cluster\.days\.size >= 2/);
  assert.match(inference, /const selfFaceId = recurringClusters\[0\]\.id/);
  assert.match(inference, /const pairPhotoByDay = new Map/);
  assert.match(inference, /Array\.from\(new Set\(photo\.faceClusterIds\)\)/);
  assert.match(inference, /ids\.length !== 2/);
  assert.match(inference, /export function inferRecurringScenes/);
  assert.match(app, /familiarPerson: \(rank: number\)/);
  assert.match(app, /familiarScene: \(rank: number\)/);
  assert.match(app, /visualPeopleTitle/);
  assert.match(app, /visualWorldsTitle/);
  assert.match(app, /temporalWorldsTitle/);
  assert.match(app, /selfPhoto/);
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
  assert.match(app, /MAX_LOADING_PREVIEWS = 14/);
  assert.match(app, /slice\(MAX_LOADING_PREVIEWS - 1\)/);
  assert.match(css, /object-fit: cover/);
  assert.doesNotMatch(css, /object-fit:\s*contain/);
});

test("supports recursive folder selection and the browser folder-input fallback", async () => {
  const app = await readFile(new URL("../app/MemoryWalk.tsx", import.meta.url), "utf8");
  assert.match(app, /showDirectoryPicker/);
  assert.match(app, /async function readDirectory\(handle: LocalDirectoryHandle\)/);
  assert.match(app, /files\.push\(\.\.\.\(await readDirectory\(directory\)\)\)/);
  assert.match(app, /webkitdirectory/);
  assert.match(app, /multiple/);
});

test("turns the final chapter into a desktop-first comprehensive share card", async () => {
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
  assert.match(app, /shareSpecialValue: \(days: number\)/);
  assert.doesNotMatch(app, /둘만의 날 \$\{days/);
  assert.match(app, /className="recap-footer"/);
  assert.match(app, /href="https:\/\/x\.com\/nupamo"/);
  assert.match(app, /peopleLabels\.slice\(0, 4\)/);
  assert.match(app, /createShareCardBlob/);
  assert.match(app, /canvas\.width = 1600/);
  assert.match(app, /canvas\.height = 900/);
  assert.match(app, /canvas\.toBlob/);
  assert.match(app, /const photoCountWidth = context\.measureText\(photoCountText\)\.width/);
  assert.match(app, /94 \+ photoCountWidth/);
  assert.doesNotMatch(app, /navigator\.canShare|navigator\.share|share-native-button/);
  assert.doesNotMatch(app, /twitter\.com\/intent\/tweet|share-x-button|X에 공유하기/);
  assert.match(app, /VRC RECAP/);
  assert.doesNotMatch(app, /VRCHAT RECAP/);
  assert.match(app, /downloadBlob/);
  assert.match(app, /photos\.slice\(0, 4\)/);
  assert.match(app, /summaryPhotos\.map/);
  assert.match(app, /journey\.stats\.topHour/);
  assert.match(app, /formatHour\(language, journey\.stats\.topHour\)/);
  assert.match(app, /journey\.stats\.topPeriod === 'day'/);
  assert.match(app, /formatCompactDate\(special\.firstDate\)/);
  assert.match(app, /formatVisitCount\(language, world\.activeDays\)/);
  assert.match(app, /`\$\{count\}번 방문`/);
  assert.match(app, /`\$\{count\}回訪問`/);
  assert.match(app, /story\.querySelectorAll<HTMLImageElement>\('img'\)/);
  assert.match(app, /const isVerticallyCropped = imageAspect < frameAspect - 0\.02/);
  assert.match(app, /image\.style\.setProperty\('--photo-pan-y'/);
  assert.match(app, /current \+ distance \* 0\.085/);
  assert.match(app, /window\.addEventListener\('scroll', requestMeasure/);
  assert.match(app, /data-main-photo="true"/);
  assert.match(app, /const minimum = isMainPhoto \? 12 : 0/);
  assert.match(app, /prefers-reduced-motion: reduce/);
  assert.match(app, /formatMonthRange\(language, journey\.startDate, journey\.endDate\)/);
  assert.match(app, /person\.photoId && photos\.get\(person\.photoId\)/);
  assert.match(app, /t\.peopleCount/);
  assert.doesNotMatch(app, /이미지로 공유하기|Share as an image|画像として共有/);
  assert.doesNotMatch(app, /className="recap-ending"/);
  assert.match(css, /\.share-summary-card \{/);
  assert.match(css, /aspect-ratio: 16 \/ 9/);
  assert.match(css, /\.share-summary-card \{[\s\S]*min-height: 0/);
  assert.match(css, /@media \(max-width: 1100px\)[\s\S]*\.share-people \{[\s\S]*display: none/);
  assert.match(css, /\.share-result-grid \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.doesNotMatch(css, /\.share-result-grid article:nth-child\(n \+ 5\)/);
  assert.match(css, /\.share-summary-photos \{[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)[\s\S]*min-height: 0;[\s\S]*overflow: hidden/);
  assert.match(css, /\.share-summary-photos figure \{[\s\S]*min-height: 0;[\s\S]*overflow: hidden/);
  assert.match(css, /\.share-summary-photos img \{[\s\S]*object-fit: cover/);
  assert.match(css, /\.recap-story img\[data-photo-pan='true'\] \{[\s\S]*object-position/);
  assert.match(css, /\.share-result-grid \{[\s\S]*margin-top: auto/);
  assert.doesNotMatch(app, /share-memory-span/);
});
