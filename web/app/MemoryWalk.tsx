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
    unknownDate: "날짜를 확인하는 중",
    visits: "번의 방문",
    worldBody: "문을 열고 다시 찾았던 장소들이 추억의 배경으로 남았습니다.",
    worldPhotos: "장의 사진",
    worldsTitle: "몇 번이고 돌아간 월드",
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
    unknownDate: "Finding the date",
    visits: "visits",
    worldBody: "The places you opened and returned to became the backdrop of your memories.",
    worldPhotos: "photos",
    worldsTitle: "The worlds you kept returning to",
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
    unknownDate: "日付を確認しています",
    visits: "回訪問",
    worldBody: "扉を開き、何度も戻った場所が思い出の背景として残っています。",
    worldPhotos: "枚の写真",
    worldsTitle: "何度も戻ったワールド",
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
  const specialPhotos = special?.photoIds
    .map((id) => photos.get(id))
    .filter((photo): photo is RecapPhoto => Boolean(photo)) ?? [];
  const selfName = journey.stats.self?.displayName;

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

      <section className="recap-ending">
        <p>{formatDate(language, journey.startDate)} — {formatDate(language, journey.endDate)}</p>
        <h2>{t.endingTitle}</h2>
        <blockquote>{t.endingBody}</blockquote>
        <button type="button" onClick={onRestart}>{t.chooseFolderAgain}</button>
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
