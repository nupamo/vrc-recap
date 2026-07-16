"use client";

/* eslint-disable @next/next/no-img-element -- Object URLs from a user-selected folder cannot use the Next image optimizer. */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  analyzeFiles,
  releaseJourney,
  type AnalysisPhoto,
  type AnalysisProgress,
  type MemoryJourney,
  type RecapPhoto,
} from "./lib/memory";

type Language = "ko" | "en" | "ja";
type AppPhase = "intro" | "analyzing" | "recap";
type ErrorKind = "analysis" | "folder" | "no-images";

type LocalFileHandle = {
  getFile: () => Promise<File>;
  kind: "file";
};

type LocalDirectoryHandle = {
  kind: "directory";
  values: () => AsyncIterable<LocalFileHandle | LocalDirectoryHandle>;
};

type FolderPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<LocalDirectoryHandle>;
};

type LoadingPreview = {
  date: string;
  fileName: string;
  nicknames: string[];
  url: string;
  worldName?: string;
};

const LANGUAGE_STORAGE_KEY = "vrchat-recap-language";

const EMPTY_PROGRESS: AnalysisProgress = {
  current: 0,
  discoveries: {
    people: 0,
    photosWithTwoPeople: 0,
    topNames: [],
    worlds: 0,
  },
  stage: "preparing",
  total: 1,
};

const COPY = {
  ko: {
    activeDays: "사진을 남긴 날",
    brandLabel: "VRChat Recap 처음으로",
    chooseFolder: "사진 폴더 고르기",
    chooseFolderAgain: "다른 폴더로 다시 만들기",
    composing: "이제 흩어진 장면들을 하나의 이야기로 잇고 있어요.",
    discoveredPeople: "함께한 사람",
    discoveredWorlds: "발견한 월드",
    emptyPeople: "이름이 남아 있는 사진을 더 찾으면 함께한 사람들의 이야기가 나타나요.",
    endingBody: "돌아보면 긴 시간은 언제나 몇 장의 사진과 몇 사람의 이름으로 다시 가까워집니다.",
    endingTitle: "그때의 우리는, 사진 속에 그대로 남아 있어요.",
    errorAnalysis: "사진을 살펴보는 중 문제가 생겼어요. 읽을 수 있는 사진으로 다시 시도해 주세요.",
    errorFolder: "이 브라우저에서는 폴더를 직접 열 수 없었어요.",
    errorNoImages: "선택한 폴더에서 사진을 찾지 못했어요.",
    firstStep: "사진 폴더를 선택하세요",
    firstStepBody: "VRChat에서 남긴 스크린샷이 있는 폴더면 충분해요.",
    foundPair: "둘만 남긴 순간을 발견했어요.",
    foundPerson: (name: string) => `${name}님과 함께한 순간을 찾았어요.`,
    foundWorld: (world: string) => `${world}의 추억이 다시 떠오르고 있어요.`,
    galleryLabel: "추억 사진",
    heroAccent: "우리의 시간",
    heroBody: "수많은 스크린샷 속에서 자주 찾았던 월드와 함께했던 이름, 오래 이어진 인연을 다시 만나보세요.",
    heroTitle: "사진 속에 남은",
    language: "언어",
    loadingCount: (current: number, total: number) => `${total.toLocaleString("ko-KR")}장의 사진 중 ${current.toLocaleString("ko-KR")}장을 살펴보고 있어요`,
    loadingFilm: "지금까지 지나온 장면",
    loadingPeople: "자주 보이는 이름",
    loadingTitle: "추억이 하나씩 모습을 드러내고 있어요",
    monthStory: (count: number) => `이 한 달에만 ${count.toLocaleString("ko-KR")}장의 장면이 남아 있어요.`,
    nextStep: "월드와 이름이 모입니다",
    nextStepBody: "사진에 남은 날짜, 월드, 닉네임이 시간순으로 이어져요.",
    noNamesYet: "아직 이름이 남은 장면을 찾는 중이에요.",
    noWorld: "이름이 남지 않은 월드",
    peopleBody: "사진마다 다시 나타난 이름들이 이 시간의 동행자가 되었습니다.",
    peopleTitle: "몇 번이고 다시 만난 이름",
    photoCount: "남겨진 사진",
    preparing: "사진 폴더의 첫 장면을 펼치고 있어요.",
    recapEyebrow: "YOUR VRCHAT MEMORIES",
    recapLead: (days: number) => `${days.toLocaleString("ko-KR")}일에 걸쳐 남긴 장면들이 다시 하나의 흐름이 되었습니다.`,
    recapTitle: (name?: string) => name ? `${name}님의 추억` : "당신의 추억",
    scroll: "아래로 내려 추억을 이어서 보세요",
    seasonNames: ["봄", "여름", "가을", "겨울"],
    shareBody: "한 장에 모은 올해의 월드, 사람, 사진을 이미지로 저장하거나 X에 바로 공유해 보세요.",
    shareCardTitle: (name?: string) => name ? `${name}님의 VRChat Recap` : "나의 VRChat Recap",
    shareFailed: "공유 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
    shareImage: "이미지로 공유하기",
    shareLabel: "한 장으로 보는 종합 결과",
    shareMonthValue: (month: string, photos: number) => `${month} · ${photos.toLocaleString("ko-KR")}장`,
    sharePost: (photos: number, world?: string, person?: string) => [
      `${photos.toLocaleString("ko-KR")}장의 VRChat 추억을 돌아봤어요.`,
      world ? `가장 많이 찾은 월드는 ${world}.` : "",
      person ? `둘만의 추억이 가장 많은 사람은 ${person}.` : "",
      "#VRChatRecap",
    ].filter(Boolean).join(" "),
    sharePreparing: "공유 이미지를 만들고 있어요…",
    shareSaved: "공유 이미지가 저장됐어요. X 글에 첨부해 보세요.",
    shareSpecialValue: (name: string, photos: number) => `${name} · 둘만의 사진 ${photos.toLocaleString("ko-KR")}장`,
    shareSuccess: "공유 화면을 열었어요.",
    shareTitle: "이 모든 추억을 한 장에",
    shareWorldValue: (world: string, visits: number) => `${world} · ${visits.toLocaleString("ko-KR")}회`,
    saveShareImage: "공유 이미지 저장",
    selfBody: (name: string, count: number) => `${name}님은 ${count.toLocaleString("ko-KR")}장의 사진에 가장 자주 남은 이름이에요.`,
    selfFaceBody: (count: number) => `${count.toLocaleString("ko-KR")}장의 사진에서 가장 익숙한 얼굴의 흐름이 이어졌어요.`,
    specialBody: (count: number) => `둘만 함께한 사진이 ${count.toLocaleString("ko-KR")}장. 많은 사람 가운데서도 유난히 자주 둘만의 순간이 남았습니다.`,
    specialGeneric: "가장 익숙한 사람",
    specialLabel: "둘만의 시간",
    specialTitle: (name?: string) => name ? `${name}님과 남긴 장면` : "둘만 남긴 장면",
    statDays: "함께한 날",
    statFirstLast: "처음부터 마지막까지",
    statPair: "둘만의 사진",
    statPlace: "함께 찾은 월드",
    storyReady: "나만의 Recap이 완성됩니다",
    storyReadyBody: "원본 사진과 실제 이름으로 이어지는 한 편의 추억 이야기를 만나보세요.",
    timelineBody: "오래전의 첫 장면부터 가장 최근의 밤까지, 시간순으로 다시 이어봅니다.",
    timelineTitle: "시간을 따라 다시 걷는 장면",
    topMonth: "가장 많은 추억이 남은 달",
    topPeople: "함께한 이름",
    topSeason: "가장 많은 장면이 남은 계절",
    topWorld: "가장 많이 찾은 월드",
    unknownDate: "날짜를 확인하는 중",
    visits: "번의 방문",
    worldBody: "문을 열고 다시 찾았던 장소들이 추억의 배경으로 남았습니다.",
    worldPhotos: "장의 사진",
    worldsTitle: "몇 번이고 돌아간 월드",
    xShare: "X에 공유하기",
  },
  en: {
    activeDays: "days remembered",
    brandLabel: "Back to VRChat Recap",
    chooseFolder: "Choose photo folder",
    chooseFolderAgain: "Start again with another folder",
    composing: "The scattered moments are becoming one story.",
    discoveredPeople: "people found",
    discoveredWorlds: "worlds found",
    emptyPeople: "When more photos carry names, the people in your story will appear here.",
    endingBody: "A long stretch of time can feel close again through a handful of photos and familiar names.",
    endingTitle: "You are still there, exactly as the photos remember.",
    errorAnalysis: "Something went wrong while looking through the photos. Please try again with readable images.",
    errorFolder: "This browser could not open the folder directly.",
    errorNoImages: "No photos were found in the selected folder.",
    firstStep: "Choose your photo folder",
    firstStepBody: "A folder containing your VRChat screenshots is all you need.",
    foundPair: "A memory of just the two of you.",
    foundPerson: (name: string) => `We found a moment shared with ${name}.`,
    foundWorld: (world: string) => `${world} is coming back into view.`,
    galleryLabel: "Memory photos",
    heroAccent: "the time we shared",
    heroBody: "Return to the worlds you visited most, the names that kept appearing, and the connections that lasted across thousands of screenshots.",
    heroTitle: "Still alive in our photos:",
    language: "Language",
    loadingCount: (current: number, total: number) => `Looking through ${current.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} memories`,
    loadingFilm: "Moments seen so far",
    loadingPeople: "Names coming into focus",
    loadingTitle: "Your memories are appearing one by one",
    monthStory: (count: number) => `${count.toLocaleString("en-US")} moments were saved in this month alone.`,
    nextStep: "Worlds and names come together",
    nextStepBody: "Dates, worlds, and nicknames fall into place along the timeline.",
    noNamesYet: "Still looking for moments where names were recorded.",
    noWorld: "A world without a recorded name",
    peopleBody: "The names that returned across the photos became the companions of this story.",
    peopleTitle: "The names you met again and again",
    photoCount: "photos kept",
    preparing: "Opening the first moments in your photo folder.",
    recapEyebrow: "YOUR VRCHAT MEMORIES",
    recapLead: (days: number) => `Moments saved across ${days.toLocaleString("en-US")} days have become one continuous story.`,
    recapTitle: (name?: string) => name ? `${name}'s memories` : "Your memories",
    scroll: "Scroll to continue through your memories",
    seasonNames: ["spring", "summer", "autumn", "winter"],
    shareBody: "Save the worlds, people, and photos that shaped your Recap as one image, or open a post on X.",
    shareCardTitle: (name?: string) => name ? `${name}'s VRChat Recap` : "My VRChat Recap",
    shareFailed: "The share image could not be created. Please try again.",
    shareImage: "Share as an image",
    shareLabel: "YOUR STORY AT A GLANCE",
    shareMonthValue: (month: string, photos: number) => `${month} · ${photos.toLocaleString("en-US")} photos`,
    sharePost: (photos: number, world?: string, person?: string) => [
      `I looked back on ${photos.toLocaleString("en-US")} VRChat memories.`,
      world ? `My most visited world was ${world}.` : "",
      person ? `I shared the most two-person memories with ${person}.` : "",
      "#VRChatRecap",
    ].filter(Boolean).join(" "),
    sharePreparing: "Preparing your share image…",
    shareSaved: "Your share image was saved. Attach it to your post on X.",
    shareSpecialValue: (name: string, photos: number) => `${name} · ${photos.toLocaleString("en-US")} two-person photos`,
    shareSuccess: "The share sheet is open.",
    shareTitle: "Your whole story, in one frame",
    shareWorldValue: (world: string, visits: number) => `${world} · ${visits.toLocaleString("en-US")} visits`,
    saveShareImage: "Save share image",
    selfBody: (name: string, count: number) => `${name} is the name that appears most often, across ${count.toLocaleString("en-US")} photos.`,
    selfFaceBody: (count: number) => `One familiar face keeps returning across ${count.toLocaleString("en-US")} photos.`,
    specialBody: (count: number) => `${count.toLocaleString("en-US")} photos hold a moment with just the two of you—a connection that stands out from all the rest.`,
    specialGeneric: "Your most familiar person",
    specialLabel: "JUST THE TWO OF YOU",
    specialTitle: (name?: string) => name ? `The moments you shared with ${name}` : "The moments shared by just two",
    statDays: "days together",
    statFirstLast: "from first to last",
    statPair: "two-person photos",
    statPlace: "a world you shared",
    storyReady: "Your personal Recap takes shape",
    storyReadyBody: "See a memory story made from your original photos and the names recorded with them.",
    timelineBody: "From the earliest frame to the most recent night, the years meet again in order.",
    timelineTitle: "Following the memories through time",
    topMonth: "The month that held the most memories",
    topPeople: "Names beside you",
    topSeason: "The season with the most moments",
    topWorld: "Most visited world",
    unknownDate: "Finding the date",
    visits: "visits",
    worldBody: "The places you opened and returned to became the backdrop of your memories.",
    worldPhotos: "photos",
    worldsTitle: "The worlds you kept returning to",
    xShare: "Share on X",
  },
  ja: {
    activeDays: "写真を残した日",
    brandLabel: "VRChat Recapの最初へ",
    chooseFolder: "写真フォルダーを選ぶ",
    chooseFolderAgain: "別のフォルダーでもう一度",
    composing: "散らばっていた場面を、ひとつの物語につないでいます。",
    discoveredPeople: "一緒にいた人",
    discoveredWorlds: "見つかったワールド",
    emptyPeople: "名前が残っている写真が増えると、一緒に過ごした人たちの物語がここに現れます。",
    endingBody: "長い時間も、数枚の写真と懐かしい名前を通して、もう一度すぐそばに戻ってきます。",
    endingTitle: "あの頃の私たちは、写真の中にそのまま残っています。",
    errorAnalysis: "写真を振り返る途中で問題が起きました。読み込める写真でもう一度お試しください。",
    errorFolder: "このブラウザーではフォルダーを直接開けませんでした。",
    errorNoImages: "選択したフォルダーに写真が見つかりませんでした。",
    firstStep: "写真フォルダーを選びます",
    firstStepBody: "VRChatのスクリーンショットが入ったフォルダーだけで始められます。",
    foundPair: "ふたりだけで残した一枚を見つけました。",
    foundPerson: (name: string) => `${name}さんと過ごした瞬間を見つけました。`,
    foundWorld: (world: string) => `${world}の記憶がよみがえってきました。`,
    galleryLabel: "思い出の写真",
    heroAccent: "一緒に過ごした時間",
    heroBody: "たくさんのスクリーンショットから、何度も訪れたワールド、一緒にいた名前、長く続いたつながりを振り返りましょう。",
    heroTitle: "写真の中に残る",
    language: "言語",
    loadingCount: (current: number, total: number) => `${total.toLocaleString("ja-JP")}枚の思い出のうち、${current.toLocaleString("ja-JP")}枚を振り返っています`,
    loadingFilm: "これまでに見つけた場面",
    loadingPeople: "よく現れる名前",
    loadingTitle: "思い出がひとつずつ姿を見せています",
    monthStory: (count: number) => `この1か月だけで${count.toLocaleString("ja-JP")}枚の場面が残っています。`,
    nextStep: "ワールドと名前が集まります",
    nextStepBody: "日付、ワールド、ニックネームが時間の流れに沿ってつながります。",
    noNamesYet: "名前が残っている場面を探しています。",
    noWorld: "名前が残っていないワールド",
    peopleBody: "写真の中で何度も現れた名前が、この物語の大切な仲間になりました。",
    peopleTitle: "何度も再会した名前",
    photoCount: "残された写真",
    preparing: "写真フォルダーの最初の場面を開いています。",
    recapEyebrow: "YOUR VRCHAT MEMORIES",
    recapLead: (days: number) => `${days.toLocaleString("ja-JP")}日にわたって残した場面が、ひとつの物語になりました。`,
    recapTitle: (name?: string) => name ? `${name}さんの思い出` : "あなたの思い出",
    scroll: "下へ進んで思い出の続きを見る",
    seasonNames: ["春", "夏", "秋", "冬"],
    shareBody: "このRecapを彩ったワールド、人、写真を一枚の画像に保存したり、Xへの投稿を開いたりできます。",
    shareCardTitle: (name?: string) => name ? `${name}さんのVRChat Recap` : "私のVRChat Recap",
    shareFailed: "共有画像を作成できませんでした。もう一度お試しください。",
    shareImage: "画像として共有",
    shareLabel: "一枚で振り返る総合結果",
    shareMonthValue: (month: string, photos: number) => `${month} · ${photos.toLocaleString("ja-JP")}枚`,
    sharePost: (photos: number, world?: string, person?: string) => [
      `${photos.toLocaleString("ja-JP")}枚のVRChatの思い出を振り返りました。`,
      world ? `いちばん訪れたワールドは${world}。` : "",
      person ? `ふたりだけの思い出が最も多い相手は${person}。` : "",
      "#VRChatRecap",
    ].filter(Boolean).join(" "),
    sharePreparing: "共有画像を作成しています…",
    shareSaved: "共有画像を保存しました。Xの投稿に添付してみましょう。",
    shareSpecialValue: (name: string, photos: number) => `${name} · ふたりだけの写真${photos.toLocaleString("ja-JP")}枚`,
    shareSuccess: "共有画面を開きました。",
    shareTitle: "すべての思い出を、一枚に",
    shareWorldValue: (world: string, visits: number) => `${world} · ${visits.toLocaleString("ja-JP")}回`,
    saveShareImage: "共有画像を保存",
    selfBody: (name: string, count: number) => `${name}さんは、${count.toLocaleString("ja-JP")}枚の写真に最も多く残っている名前です。`,
    selfFaceBody: (count: number) => `${count.toLocaleString("ja-JP")}枚の写真に、ひとつの懐かしい顔の流れが続いていました。`,
    specialBody: (count: number) => `ふたりだけの写真は${count.toLocaleString("ja-JP")}枚。たくさんの人の中でも、ふたりの瞬間が特別に多く残っています。`,
    specialGeneric: "いちばん懐かしい人",
    specialLabel: "ふたりだけの時間",
    specialTitle: (name?: string) => name ? `${name}さんと残した場面` : "ふたりだけで残した場面",
    statDays: "一緒にいた日",
    statFirstLast: "最初から最後まで",
    statPair: "ふたりだけの写真",
    statPlace: "一緒に訪れたワールド",
    storyReady: "あなただけのRecapが完成します",
    storyReadyBody: "元の写真と実際の名前でつながる、ひとつの思い出の物語です。",
    timelineBody: "最初の一枚からいちばん最近の夜まで、時間の順にもう一度たどります。",
    timelineTitle: "時間に沿って思い出をたどる",
    topMonth: "いちばん多くの思い出が残った月",
    topPeople: "一緒にいた名前",
    topSeason: "いちばん多くの場面が残った季節",
    topWorld: "いちばん訪れたワールド",
    unknownDate: "日付を確認しています",
    visits: "回訪問",
    worldBody: "扉を開き、何度も戻った場所が思い出の背景として残っています。",
    worldPhotos: "枚の写真",
    worldsTitle: "何度も戻ったワールド",
    xShare: "Xで共有",
  },
} as const;

function localeFor(language: Language): string {
  return language === "ko" ? "ko-KR" : language === "ja" ? "ja-JP" : "en-US";
}

function formatDate(language: Language, value: string, style: "long" | "short" = "long"): string {
  return new Intl.DateTimeFormat(localeFor(language), style === "long"
    ? { day: "numeric", month: "long", year: "numeric" }
    : { month: "short", year: "numeric" }).format(new Date(value));
}

function formatMonth(language: Language, year: number, month: number): string {
  return new Intl.DateTimeFormat(localeFor(language), {
    month: "long",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function formatNumber(language: Language, value: number): string {
  return value.toLocaleString(localeFor(language));
}

function canvasText(
  context: CanvasRenderingContext2D,
  value: string,
  maximumWidth: number,
): string {
  if (context.measureText(value).width <= maximumWidth) return value;
  let shortened = value;
  while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maximumWidth) {
    shortened = shortened.slice(0, -1);
  }
  return `${shortened}…`;
}

function drawContainedImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  context.fillStyle = "#0d0d0c";
  context.fillRect(x, y, width, height);
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  );
  context.strokeStyle = "rgba(241,237,229,.24)";
  context.lineWidth = 2;
  context.strokeRect(x, y, width, height);
}

function loadShareImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load a recap photo."));
    image.src = url;
  });
}

async function createShareCardBlob(
  journey: MemoryJourney,
  language: Language,
  photos: RecapPhoto[],
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = 1600;
  canvas.height = 900;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create the share card.");

  const t = COPY[language];
  const selfName = journey.stats.self?.displayName;
  const special = journey.stats.specialPerson;
  const specialName = special?.displayName ?? t.specialGeneric;
  const topWorldResult = journey.stats.topWorlds[0];
  const topWorld = topWorldResult?.displayName ?? t.noWorld;
  const topMonth = formatMonth(
    language,
    journey.stats.topMonth.year,
    journey.stats.topMonth.month,
  );
  const loadedPhotos = await Promise.all(photos.slice(0, 3).map((photo) => loadShareImage(photo.url)));

  context.fillStyle = "#171715";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const glow = context.createRadialGradient(1260, 280, 20, 1260, 280, 680);
  glow.addColorStop(0, "rgba(168,70,50,.28)");
  glow.addColorStop(1, "rgba(23,23,21,0)");
  context.fillStyle = glow;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#a84632";
  context.fillRect(70, 70, 70, 70);
  context.fillStyle = "#fffaf0";
  context.font = "800 22px Segoe UI, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("VR", 105, 106);

  context.textAlign = "left";
  context.fillStyle = "#f1ede5";
  context.font = "800 22px Segoe UI, sans-serif";
  context.fillText("VRCHAT RECAP", 164, 93);
  context.fillStyle = "#a7a096";
  context.font = "600 15px Segoe UI, sans-serif";
  context.fillText(
    `${new Date(journey.startDate).getFullYear()} — ${new Date(journey.endDate).getFullYear()}`,
    164,
    126,
  );

  context.fillStyle = "#fffaf0";
  context.font = "400 67px Georgia, Noto Serif KR, Yu Mincho, serif";
  const title = canvasText(context, t.shareCardTitle(selfName), 690);
  context.fillText(title, 70, 230);
  context.fillStyle = "#d5cec3";
  context.font = "400 24px Segoe UI, sans-serif";
  context.fillText(canvasText(context, t.recapLead(journey.stats.activeDays), 690), 72, 274);

  context.fillStyle = "#fffaf0";
  context.font = "400 118px Georgia, serif";
  context.fillText(formatNumber(language, journey.totalPhotos), 70, 430);
  context.fillStyle = "#d7836c";
  context.font = "800 17px Segoe UI, sans-serif";
  context.fillText(t.photoCount.toLocaleUpperCase(localeFor(language)), 76, 469);

  const summary = [
    {
      label: t.topWorld,
      value: topWorldResult
        ? t.shareWorldValue(topWorld, topWorldResult.visitCount)
        : topWorld,
    },
    {
      label: t.specialLabel,
      value: special
        ? t.shareSpecialValue(specialName, special.pairPhotos)
        : specialName,
    },
    {
      label: t.topMonth,
      value: t.shareMonthValue(topMonth, journey.stats.topMonth.photoCount),
    },
    {
      label: t.activeDays,
      value: formatNumber(language, journey.stats.activeDays),
    },
  ];
  summary.forEach((item, index) => {
    const column = index % 2;
    const row = Math.floor(index / 2);
    const x = 70 + column * 348;
    const y = 540 + row * 118;
    context.strokeStyle = "rgba(241,237,229,.18)";
    context.strokeRect(x, y, 318, 90);
    context.fillStyle = "#8f8980";
    context.font = "700 13px Segoe UI, sans-serif";
    context.fillText(canvasText(context, item.label, 278), x + 18, y + 27);
    context.fillStyle = "#fffaf0";
    context.font = "400 27px Georgia, Noto Serif KR, Yu Mincho, serif";
    context.fillText(canvasText(context, item.value, 278), x + 18, y + 64);
  });

  const names = journey.stats.people.slice(0, 4).map((person) => person.displayName);
  if (names.length) {
    context.fillStyle = "#8f8980";
    context.font = "700 13px Segoe UI, sans-serif";
    context.fillText(t.topPeople, 70, 802);
    context.fillStyle = "#d8d1c6";
    context.font = "400 20px Segoe UI, sans-serif";
    context.fillText(canvasText(context, names.join(" · "), 660), 70, 836);
  }

  const photoRects = [
    [820, 70, 710, 430],
    [820, 530, 340, 300],
    [1190, 530, 340, 300],
  ] as const;
  loadedPhotos.forEach((image, index) => {
    const [x, y, width, height] = photoRects[index];
    context.fillStyle = "#f1ede5";
    context.fillRect(x - 10, y - 10, width + 20, height + 42);
    drawContainedImage(context, image, x, y, width, height);
  });

  context.fillStyle = "#a84632";
  context.fillRect(820, 862, 710, 2);
  context.fillStyle = "#8f8980";
  context.font = "700 13px Segoe UI, sans-serif";
  context.textAlign = "right";
  context.fillText("#VRChatRecap", 1530, 850);

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error("Unable to encode the share card.")),
      "image/png",
    );
  });
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

async function readDirectory(handle: LocalDirectoryHandle): Promise<File[]> {
  const files: File[] = [];
  const directories: LocalDirectoryHandle[] = [];
  let batch: LocalFileHandle[] = [];

  const flushBatch = async () => {
    if (!batch.length) return;
    files.push(...(await Promise.all(batch.map((entry) => entry.getFile()))));
    batch = [];
  };

  for await (const entry of handle.values()) {
    if (entry.kind === "file") {
      batch.push(entry);
      if (batch.length === 32) await flushBatch();
    } else {
      directories.push(entry);
    }
  }
  await flushBatch();
  for (const directory of directories) {
    files.push(...await readDirectory(directory));
  }
  return files;
}

function LanguageSelector({
  language,
  onChange,
}: {
  language: Language;
  onChange: (language: Language) => void;
}) {
  const t = COPY[language];
  return (
    <div className="language-switcher" aria-label={t.language}>
      {(["ko", "en", "ja"] as const).map((item) => (
        <button
          aria-pressed={language === item}
          key={item}
          onClick={() => onChange(item)}
          type="button"
        >
          {item === "ko" ? "한국어" : item === "en" ? "English" : "日本語"}
        </button>
      ))}
    </div>
  );
}

function Brand() {
  return (
    <a className="memory-brand" href="#top">
      <span>VR</span>
      <b>VRCHAT RECAP</b>
    </a>
  );
}

function Intro({
  error,
  language,
  onLanguage,
  onPickFolder,
}: {
  error: ErrorKind | null;
  language: Language;
  onLanguage: (language: Language) => void;
  onPickFolder: () => void;
}) {
  const t = COPY[language];
  const errorText = error === "folder"
    ? t.errorFolder
    : error === "no-images"
      ? t.errorNoImages
      : error === "analysis"
        ? t.errorAnalysis
        : null;
  const steps = [
    [t.firstStep, t.firstStepBody],
    [t.nextStep, t.nextStepBody],
    [t.storyReady, t.storyReadyBody],
  ];

  return (
    <main className="memory-intro" id="top">
      <header className="memory-topbar">
        <Brand />
        <LanguageSelector language={language} onChange={onLanguage} />
      </header>

      <section className="memory-hero">
        <div className="memory-hero-copy">
          <p className="memory-kicker">YOUR PHOTOS · YOUR PEOPLE · YOUR WORLDS</p>
          <h1>
            {t.heroTitle}
            <em>{t.heroAccent}</em>
          </h1>
          <p className="memory-hero-body">{t.heroBody}</p>
          <button className="memory-primary-button" type="button" onClick={onPickFolder}>
            <span aria-hidden="true" />
            {t.chooseFolder}
          </button>
          {errorText && <p className="memory-error" role="alert">{errorText}</p>}
        </div>

        <div className="memory-hero-collage" aria-hidden="true">
          <div className="collage-halo" />
          <div className="paper-photo paper-photo-one">
            <i />
            <b>2019 · 08</b>
          </div>
          <div className="paper-photo paper-photo-two">
            <i />
            <b>2024 · 01</b>
          </div>
          <div className="paper-photo paper-photo-three">
            <i />
            <b>2026 · 06</b>
          </div>
          <span className="collage-caption">THE NIGHTS WE KEPT</span>
        </div>
      </section>

      <section className="memory-steps">
        {steps.map(([title, body], index) => (
          <article key={title}>
            <span>0{index + 1}</span>
            <div>
              <h2>{title}</h2>
              <p>{body}</p>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

function loadingMessage(language: Language, progress: AnalysisProgress): string {
  const t = COPY[language];
  if (progress.stage === "preparing") return t.preparing;
  if (progress.stage === "composing") return t.composing;
  if (progress.photo?.twoPersonMoment) return t.foundPair;
  if (progress.photo?.nicknames[0]) return t.foundPerson(progress.photo.nicknames[0]);
  if (progress.photo?.worldName) return t.foundWorld(progress.photo.worldName);
  return progress.photo ? formatDate(language, progress.photo.date) : t.unknownDate;
}

function Analyzing({
  language,
  onLanguage,
  previews,
  progress,
}: {
  language: Language;
  onLanguage: (language: Language) => void;
  previews: LoadingPreview[];
  progress: AnalysisProgress;
}) {
  const t = COPY[language];
  const percent = Math.round((progress.current / Math.max(1, progress.total)) * 100);
  const current = previews[0];

  return (
    <main className="memory-loading">
      {current && (
        <div
          className="loading-backdrop"
          style={{ backgroundImage: `url(${current.url})` }}
          aria-hidden="true"
        />
      )}
      <div className="loading-shade" aria-hidden="true" />
      <header className="memory-topbar loading-topbar">
        <Brand />
        <LanguageSelector language={language} onChange={onLanguage} />
      </header>

      <section className="loading-layout" aria-live="polite">
        <div className="loading-photo-stage">
          {current ? (
            <figure>
              <img src={current.url} alt="" />
              <figcaption>
                <time>{formatDate(language, current.date)}</time>
                <b>{current.worldName ?? t.noWorld}</b>
                {current.nicknames.length > 0 && <span>{current.nicknames.join(" · ")}</span>}
              </figcaption>
            </figure>
          ) : (
            <div className="loading-photo-placeholder"><i /></div>
          )}
        </div>

        <div className="loading-story">
          <p className="memory-kicker">{t.loadingCount(progress.current, progress.total)}</p>
          <h1>{t.loadingTitle}</h1>
          <p className="loading-message">{loadingMessage(language, progress)}</p>
          <div
            aria-label={`${percent}%`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={percent}
            className="memory-progress"
            role="progressbar"
          >
            <span style={{ width: `${percent}%` }} />
          </div>
          <div className="loading-discoveries">
            <article>
              <b>{formatNumber(language, progress.discoveries.worlds)}</b>
              <span>{t.discoveredWorlds}</span>
            </article>
            <article>
              <b>{formatNumber(language, progress.discoveries.people)}</b>
              <span>{t.discoveredPeople}</span>
            </article>
            <article>
              <b>{formatNumber(language, progress.discoveries.photosWithTwoPeople)}</b>
              <span>{t.statPair}</span>
            </article>
          </div>
          <div className="loading-names">
            <span>{t.loadingPeople}</span>
            <div>
              {progress.discoveries.topNames.length
                ? progress.discoveries.topNames.map((name) => <b key={name}>{name}</b>)
                : <p>{t.noNamesYet}</p>}
            </div>
          </div>
        </div>
      </section>

      <section className="loading-filmstrip" aria-label={t.loadingFilm}>
        <span>{t.loadingFilm}</span>
        <div>
          {previews.map((preview) => (
            <figure key={`${preview.fileName}-${preview.date}`}>
              <img src={preview.url} alt="" />
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}

function PhotoFrame({
  language,
  photo,
  prominent = false,
}: {
  language: Language;
  photo: RecapPhoto;
  prominent?: boolean;
}) {
  const t = COPY[language];
  const details = [
    formatDate(language, photo.date),
    photo.worldName,
    photo.nicknames.join(" · "),
  ].filter(Boolean).join(", ");
  return (
    <figure className={`recap-photo-frame ${prominent ? "prominent" : ""}`}>
      <div>
        <img src={photo.url} alt={details || t.galleryLabel} />
      </div>
      <figcaption>
        <time>{formatDate(language, photo.date)}</time>
        <b>{photo.worldName ?? t.noWorld}</b>
        {photo.nicknames.length > 0 && <span>{photo.nicknames.join(" · ")}</span>}
      </figcaption>
    </figure>
  );
}

function Recap({
  journey,
  language,
  onLanguage,
  onRestart,
}: {
  journey: MemoryJourney;
  language: Language;
  onLanguage: (language: Language) => void;
  onRestart: () => void;
}) {
  const t = COPY[language];
  const [shareBusy, setShareBusy] = useState(false);
  const [shareStatus, setShareStatus] = useState<
    "failed" | "preparing" | "saved" | "success" | null
  >(null);
  const photos = useMemo(
    () => new Map(journey.photos.map((photo) => [photo.id, photo])),
    [journey.photos],
  );
  const coverPhoto = photos.get(journey.coverPhotoId) ?? journey.photos[0];
  const peakMonthPhoto = journey.peakMonthPhotoId
    ? photos.get(journey.peakMonthPhotoId)
    : undefined;
  const timelinePhotos = journey.timelinePhotoIds
    .map((id) => photos.get(id))
    .filter((photo): photo is RecapPhoto => Boolean(photo));
  const special = journey.stats.specialPerson;
  const specialPhotos = useMemo(
    () => special?.photoIds
      .map((id) => photos.get(id))
      .filter((photo): photo is RecapPhoto => Boolean(photo)) ?? [],
    [photos, special],
  );
  const selfName = journey.stats.self?.displayName;
  const summaryPhotos = Array.from(new Map(
    [
      coverPhoto,
      specialPhotos[0],
      peakMonthPhoto,
      timelinePhotos.at(-1),
    ]
      .filter((photo): photo is RecapPhoto => Boolean(photo))
      .map((photo) => [photo.id, photo]),
  ).values());
  const specialName = special?.displayName ?? (special ? t.specialGeneric : undefined);
  const topWorldResult = journey.stats.topWorlds[0];
  const topWorld = topWorldResult?.displayName;
  const topMonthValue = t.shareMonthValue(
    formatMonth(
      language,
      journey.stats.topMonth.year,
      journey.stats.topMonth.month,
    ),
    journey.stats.topMonth.photoCount,
  );
  const topWorldValue = topWorldResult
    ? t.shareWorldValue(topWorldResult.displayName, topWorldResult.visitCount)
    : t.noWorld;
  const specialValue = special
    ? t.shareSpecialValue(specialName ?? t.specialGeneric, special.pairPhotos)
    : "—";
  const rawShareMessage = t.sharePost(journey.totalPhotos, topWorld, specialName);
  const shareMessage = rawShareMessage.length > 250
    ? `${rawShareMessage.replace(/\s*#VRChatRecap$/, "").slice(0, 228).trim()}… #VRChatRecap`
    : rawShareMessage;
  const shareFileName = `vrchat-recap-${new Date(journey.endDate).getFullYear()}.png`;
  const shareStatusText = shareStatus === "preparing"
    ? t.sharePreparing
    : shareStatus === "saved"
      ? t.shareSaved
      : shareStatus === "success"
        ? t.shareSuccess
        : shareStatus === "failed"
          ? t.shareFailed
          : null;

  const saveShareImage = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    setShareStatus("preparing");
    try {
      const blob = await createShareCardBlob(journey, language, summaryPhotos);
      downloadBlob(blob, shareFileName);
      setShareStatus("saved");
    } catch {
      setShareStatus("failed");
    } finally {
      setShareBusy(false);
    }
  };

  const shareImage = async () => {
    if (shareBusy) return;
    setShareBusy(true);
    setShareStatus("preparing");
    try {
      const blob = await createShareCardBlob(journey, language, summaryPhotos);
      const file = new File([blob], shareFileName, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          text: shareMessage,
          title: t.shareCardTitle(selfName),
        });
        setShareStatus("success");
      } else {
        downloadBlob(blob, shareFileName);
        setShareStatus("saved");
      }
    } catch (shareError) {
      if (shareError instanceof DOMException && shareError.name === "AbortError") {
        setShareStatus(null);
      } else {
        setShareStatus("failed");
      }
    } finally {
      setShareBusy(false);
    }
  };

  const openXShare = () => {
    const parameters = new URLSearchParams({ text: shareMessage });
    const isLocalHost = window.location.hostname === "localhost"
      || window.location.hostname === "127.0.0.1";
    if (!isLocalHost && /^https?:$/.test(window.location.protocol)) {
      parameters.set("url", `${window.location.origin}${window.location.pathname}`);
    }
    window.open(
      `https://twitter.com/intent/tweet?${parameters.toString()}`,
      "_blank",
      "noopener,noreferrer",
    );
    setShareStatus("success");
  };

  return (
    <main className="recap-story" id="top">
      <header className="memory-topbar recap-topbar">
        <Brand />
        <div className="recap-topbar-actions">
          <LanguageSelector language={language} onChange={onLanguage} />
          <button type="button" onClick={onRestart}>{t.chooseFolderAgain}</button>
        </div>
      </header>

      <section className="recap-cover">
        <div
          className="recap-cover-backdrop"
          style={{ backgroundImage: `url(${coverPhoto.url})` }}
          aria-hidden="true"
        />
        <div className="recap-cover-photo">
          <img src={coverPhoto.url} alt="" />
        </div>
        <div className="recap-cover-copy">
          <p className="memory-kicker">{t.recapEyebrow}</p>
          <span>{new Date(journey.startDate).getFullYear()} — {new Date(journey.endDate).getFullYear()}</span>
          <h1>{t.recapTitle(selfName)}</h1>
          <p>{t.recapLead(journey.stats.activeDays)}</p>
          <small>{t.scroll}</small>
        </div>
      </section>

      <section className="recap-number-strip">
        <article>
          <b>{formatNumber(language, journey.totalPhotos)}</b>
          <span>{t.photoCount}</span>
        </article>
        <article>
          <b>{formatNumber(language, journey.stats.activeDays)}</b>
          <span>{t.activeDays}</span>
        </article>
        <article>
          <b>{t.seasonNames[journey.stats.topSeason]}</b>
          <span>{t.topSeason}</span>
        </article>
      </section>

      <section className="recap-chapter peak-month-chapter">
        <div className="chapter-copy">
          <p className="chapter-number">01</p>
          <span>{t.topMonth}</span>
          <h2>{formatMonth(
            language,
            journey.stats.topMonth.year,
            journey.stats.topMonth.month,
          )}</h2>
          <p>{t.monthStory(journey.stats.topMonth.photoCount)}</p>
        </div>
        {peakMonthPhoto && <PhotoFrame language={language} photo={peakMonthPhoto} prominent />}
      </section>

      {journey.stats.topWorlds.length > 0 && (
        <section className="recap-chapter worlds-chapter">
          <div className="chapter-heading">
            <p className="chapter-number">02</p>
            <div>
              <span>PLACES</span>
              <h2>{t.worldsTitle}</h2>
              <p>{t.worldBody}</p>
            </div>
          </div>
          <div className="world-memory-grid">
            {journey.stats.topWorlds.map((world, index) => {
              const photo = world.photoId ? photos.get(world.photoId) : undefined;
              return (
                <article key={world.displayName}>
                  {photo && <img src={photo.url} alt="" />}
                  <div>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <h3>{world.displayName}</h3>
                    <p>
                      <b>{formatNumber(language, world.visitCount)}</b> {t.visits}
                      <i>·</i>
                      {formatNumber(language, world.photoCount)} {t.worldPhotos}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <section className="recap-chapter people-chapter">
        <div className="chapter-heading">
          <p className="chapter-number">03</p>
          <div>
            <span>{t.topPeople}</span>
            <h2>{t.peopleTitle}</h2>
            <p>{t.peopleBody}</p>
          </div>
        </div>

        {journey.stats.self && (
          <div className="self-memory">
            <span>{journey.stats.self.displayName?.slice(0, 1) ?? "✦"}</span>
            <p>
              {journey.stats.self.displayName
                ? t.selfBody(journey.stats.self.displayName, journey.stats.self.photoCount)
                : t.selfFaceBody(journey.stats.self.photoCount)}
            </p>
          </div>
        )}

        {journey.stats.people.length > 0 ? (
          <div className="people-ribbon">
            {journey.stats.people.map((person, index) => (
              <article key={person.displayName}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <h3>{person.displayName}</h3>
                <p>{formatNumber(language, person.photoCount)} {t.worldPhotos}</p>
                <small>{formatNumber(language, person.activeDays)} {t.activeDays}</small>
              </article>
            ))}
          </div>
        ) : (
          <p className="recap-empty">{t.emptyPeople}</p>
        )}
      </section>

      {special && (
        <section className="special-chapter">
          {specialPhotos[0] && (
            <div
              className="special-backdrop"
              style={{ backgroundImage: `url(${specialPhotos[0].url})` }}
              aria-hidden="true"
            />
          )}
          <div className="special-inner">
            <div className="special-copy">
              <p>{t.specialLabel}</p>
              <h2>{t.specialTitle(special.displayName)}</h2>
              <span>{special.displayName ?? t.specialGeneric}</span>
              <blockquote>{t.specialBody(special.pairPhotos)}</blockquote>
              <div className="special-stats">
                <article>
                  <b>{formatNumber(language, special.pairPhotos)}</b>
                  <span>{t.statPair}</span>
                </article>
                <article>
                  <b>{formatNumber(language, special.activeDays)}</b>
                  <span>{t.statDays}</span>
                </article>
                {special.topWorld && (
                  <article>
                    <b>{special.topWorld}</b>
                    <span>{t.statPlace}</span>
                  </article>
                )}
                <article>
                  <b>{formatDate(language, special.firstDate, "short")} — {formatDate(language, special.lastDate, "short")}</b>
                  <span>{t.statFirstLast}</span>
                </article>
              </div>
            </div>
            {specialPhotos.length > 0 && (
              <div className="special-gallery" aria-label={t.galleryLabel}>
                {specialPhotos.map((photo, index) => (
                  <PhotoFrame
                    key={photo.id}
                    language={language}
                    photo={photo}
                    prominent={index === 0}
                  />
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="recap-chapter timeline-chapter">
        <div className="chapter-heading">
          <p className="chapter-number">{special ? "05" : "04"}</p>
          <div>
            <span>TIMELINE</span>
            <h2>{t.timelineTitle}</h2>
            <p>{t.timelineBody}</p>
          </div>
        </div>
        <div className="timeline-gallery">
          {timelinePhotos.map((photo, index) => (
            <div className={index % 4 === 1 ? "timeline-offset" : ""} key={photo.id}>
              <PhotoFrame language={language} photo={photo} />
            </div>
          ))}
        </div>
      </section>

      <section className="recap-share-chapter">
        <div className="share-chapter-heading">
          <p>{t.shareLabel}</p>
          <h2>{t.shareTitle}</h2>
          <span>{t.shareBody}</span>
        </div>

        <div className="share-summary-card">
          <div className="share-summary-copy">
            <div className="share-summary-brand">
              <i>VR</i>
              <span>VRCHAT RECAP</span>
            </div>
            <p>{new Date(journey.startDate).getFullYear()} — {new Date(journey.endDate).getFullYear()}</p>
            <h3>{t.shareCardTitle(selfName)}</h3>
            <div className="share-primary-number">
              <b>{formatNumber(language, journey.totalPhotos)}</b>
              <span>{t.photoCount}</span>
            </div>
            <div className="share-result-grid">
              <article>
                <span>{t.activeDays}</span>
                <b>{formatNumber(language, journey.stats.activeDays)}</b>
              </article>
              <article>
                <span>{t.topMonth}</span>
                <b>{topMonthValue}</b>
              </article>
              <article>
                <span>{t.topWorld}</span>
                <b>{topWorldValue}</b>
              </article>
              <article>
                <span>{t.specialLabel}</span>
                <b>{specialValue}</b>
              </article>
            </div>
            {journey.stats.people.length > 0 && (
              <div className="share-people">
                <span>{t.topPeople}</span>
                <p>{journey.stats.people.slice(0, 4).map((person) => person.displayName).join(" · ")}</p>
              </div>
            )}
          </div>

          <div className="share-summary-photos" aria-label={t.galleryLabel}>
            {summaryPhotos.slice(0, 3).map((photo, index) => (
              <figure className={`share-photo-${index + 1}`} key={photo.id}>
                <img src={photo.url} alt="" />
              </figure>
            ))}
            <b>#VRChatRecap</b>
          </div>
        </div>

        <div className="share-actions">
          <button
            className="share-native-button"
            disabled={shareBusy}
            onClick={() => void shareImage()}
            type="button"
          >
            {t.shareImage}
          </button>
          <button
            className="share-x-button"
            disabled={shareBusy}
            onClick={openXShare}
            type="button"
          >
            <b>X</b>
            {t.xShare}
          </button>
          <button
            className="share-save-button"
            disabled={shareBusy}
            onClick={() => void saveShareImage()}
            type="button"
          >
            {t.saveShareImage}
          </button>
          <button className="share-restart-button" type="button" onClick={onRestart}>
            {t.chooseFolderAgain}
          </button>
        </div>
        <p className="share-status" aria-live="polite">{shareStatusText}</p>
      </section>
    </main>
  );
}

export default function MemoryWalk() {
  const [error, setError] = useState<ErrorKind | null>(null);
  const [journey, setJourney] = useState<MemoryJourney | null>(null);
  const [language, setLanguage] = useState<Language>("ko");
  const [phase, setPhase] = useState<AppPhase>("intro");
  const [previews, setPreviews] = useState<LoadingPreview[]>([]);
  const [progress, setProgress] = useState<AnalysisProgress>(EMPTY_PROGRESS);
  const folderInput = useRef<HTMLInputElement>(null);
  const journeyRef = useRef<MemoryJourney | null>(null);
  const previewsRef = useRef<LoadingPreview[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    const browserLanguage = navigator.language.toLocaleLowerCase();
    const next: Language = stored === "en" || stored === "ja" || stored === "ko"
      ? stored
      : browserLanguage.startsWith("ja")
        ? "ja"
        : browserLanguage.startsWith("en")
          ? "en"
          : "ko";
    const timer = window.setTimeout(() => {
      setLanguage(next);
      document.documentElement.lang = next;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    journeyRef.current = journey;
  }, [journey]);

  useEffect(() => () => {
    releaseJourney(journeyRef.current);
    previewsRef.current.forEach((preview) => URL.revokeObjectURL(preview.url));
  }, []);

  const changeLanguage = useCallback((next: Language) => {
    setLanguage(next);
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
    document.documentElement.lang = next;
  }, []);

  const clearPreviews = useCallback(() => {
    previewsRef.current.forEach((preview) => URL.revokeObjectURL(preview.url));
    previewsRef.current = [];
    setPreviews([]);
  }, []);

  const addPreview = useCallback((photo: AnalysisPhoto) => {
    const nextPreview: LoadingPreview = {
      date: photo.date,
      fileName: photo.file.name,
      nicknames: photo.nicknames,
      url: URL.createObjectURL(photo.file),
      worldName: photo.worldName,
    };
    const next = [nextPreview, ...previewsRef.current].slice(0, 8);
    previewsRef.current.slice(7).forEach((preview) => URL.revokeObjectURL(preview.url));
    previewsRef.current = next;
    setPreviews(next);
  }, []);

  const startAnalysis = useCallback(async (files: Iterable<File>) => {
    setError(null);
    setPhase("analyzing");
    setProgress(EMPTY_PROGRESS);
    clearPreviews();
    let lastPreviewAt = 0;
    try {
      const nextJourney = await analyzeFiles(files, (nextProgress) => {
        setProgress(nextProgress);
        if (!nextProgress.photo) return;
        const interval = Math.max(1, Math.floor(nextProgress.total / 42));
        if (
          nextProgress.current <= 6
          || nextProgress.current === nextProgress.total
          || nextProgress.current - lastPreviewAt >= interval
        ) {
          lastPreviewAt = nextProgress.current;
          addPreview(nextProgress.photo);
        }
      });
      clearPreviews();
      releaseJourney(journeyRef.current);
      journeyRef.current = nextJourney;
      setJourney(nextJourney);
      setPhase("recap");
      window.scrollTo({ top: 0 });
    } catch (analysisError) {
      clearPreviews();
      const message = analysisError instanceof Error ? analysisError.message : "";
      setError(message.includes("No image") ? "no-images" : "analysis");
      setPhase("intro");
    }
  }, [addPreview, clearPreviews]);

  const chooseFolder = useCallback(async () => {
    const picker = (window as FolderPickerWindow).showDirectoryPicker;
    if (!picker) {
      folderInput.current?.click();
      return;
    }
    try {
      const handle = await picker();
      const files = await readDirectory(handle);
      await startAnalysis(files);
    } catch (pickerError) {
      if (pickerError instanceof DOMException && pickerError.name === "AbortError") return;
      setError("folder");
      setPhase("intro");
    }
  }, [startAnalysis]);

  if (phase === "analyzing") {
    return (
      <Analyzing
        language={language}
        onLanguage={changeLanguage}
        previews={previews}
        progress={progress}
      />
    );
  }

  if (phase === "recap" && journey) {
    return (
      <Recap
        journey={journey}
        language={language}
        onLanguage={changeLanguage}
        onRestart={() => {
          releaseJourney(journey);
          journeyRef.current = null;
          setJourney(null);
          setPhase("intro");
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />
    );
  }

  return (
    <>
      <Intro
        error={error}
        language={language}
        onLanguage={changeLanguage}
        onPickFolder={chooseFolder}
      />
      <input
        accept="image/*"
        className="visually-hidden"
        multiple
        onChange={(event) => {
          if (event.target.files?.length) void startAnalysis(event.target.files);
          event.target.value = "";
        }}
        ref={folderInput}
        type="file"
        {...({ directory: "", webkitdirectory: "" } as Record<string, string>)}
      />
    </>
  );
}
