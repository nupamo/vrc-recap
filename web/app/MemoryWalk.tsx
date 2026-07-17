'use client'

/* eslint-disable @next/next/no-img-element -- Object URLs from a user-selected folder cannot use the Next image optimizer. */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  analyzeFiles,
  releaseJourney,
  type AnalysisPhoto,
  type AnalysisProgress,
  type MemoryJourney,
  type RecapPhoto,
} from './lib/memory'

type Language = 'ko' | 'en' | 'ja'
type AppPhase = 'intro' | 'analyzing' | 'recap'
type ErrorKind = 'analysis' | 'folder' | 'no-images'

const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? ''
const BRAND_MARK_SRC = `${PUBLIC_BASE_PATH}/vrc-recap-mark.png`

type LocalFileHandle = {
  getFile: () => Promise<File>
  kind: 'file'
}

type LocalDirectoryHandle = {
  kind: 'directory'
  values: () => AsyncIterable<LocalFileHandle | LocalDirectoryHandle>
}

type FolderPickerWindow = Window & {
  showDirectoryPicker?: () => Promise<LocalDirectoryHandle>
}

type LoadingPreview = {
  date: string
  fileName: string
  nicknames: string[]
  url: string
  visualSubjects: number
  worldName?: string
}

const LANGUAGE_STORAGE_KEY = 'vrchat-recap-language'
const MAX_LOADING_PREVIEWS = 14

const EMPTY_PROGRESS: AnalysisProgress = {
  current: 0,
  discoveries: {
    daysWithTwoPeople: 0,
    people: 0,
    topNames: [],
    visualPeople: 0,
    visualPlaces: 0,
    worlds: 0,
  },
  stage: 'preparing',
  total: 1,
}

const COPY = {
  ko: {
    activeDays: '사진을 남긴 날',
    activeMonths: '추억이 남은 달',
    brandLabel: 'VRC Recap 처음으로',
    chooseFolder: '사진 폴더 고르기',
    chooseFolderAgain: '다른 폴더로 다시 만들기',
    composing: '이제 흩어진 장면들을 하나의 이야기로 잇고 있어요.',
    discoveredPeople: '함께 등장한 사람',
    discoveredWorlds: '되돌아온 장소',
    dayStory: (count: number) =>
      `이 하루에만 ${count.toLocaleString('ko-KR')}장의 장면이 남아 있어요.`,
    emptyPeople:
      '반복해서 등장한 사람을 충분히 찾지 못했지만, 사진의 시간과 장면은 그대로 추억에 남아 있어요.',
    endingBody:
      '돌아보면 긴 시간은 언제나 몇 장의 사진과 몇 사람의 이름으로 다시 가까워집니다.',
    endingTitle: '그때의 우리는, 사진 속에 그대로 남아 있어요.',
    errorAnalysis:
      '사진을 살펴보는 중 문제가 생겼어요. 읽을 수 있는 사진으로 다시 시도해 주세요.',
    errorFolder: '이 브라우저에서는 폴더를 직접 열 수 없었어요.',
    errorNoImages: '선택한 폴더에서 사진을 찾지 못했어요.',
    firstStep: '사진 폴더를 선택하세요',
    firstStepBody:
      'VRChat 스크린샷 폴더만 선택하세요. 사진은 서버로 전송되지 않습니다.',
    familiarPerson: (rank: number) => `익숙한 아바타 ${rank}`,
    familiarScene: (rank: number) => `다시 나타난 풍경 ${rank}`,
    foundPair: '서로 다른 날에 둘만 남긴 순간을 찾고 있어요.',
    foundPerson: (name: string) => `${name}님과 함께한 순간을 찾았어요.`,
    foundVisualPerson: (count: number) =>
      `사진 속에서 ${count.toLocaleString('ko-KR')}명의 익숙한 모습을 찾았어요.`,
    foundWorld: (world: string) => `${world}의 추억이 다시 떠오르고 있어요.`,
    galleryLabel: '추억 사진',
    heroAccent: '우리의 시간',
    heroBody:
      '수많은 스크린샷 속에서 자주 돌아간 풍경과 반복해서 함께한 모습, 오래 이어진 인연을 다시 만나보세요.',
    heroTitle: '사진으로 남은',
    language: '언어',
    loadingCount: (current: number, total: number) =>
      `${total.toLocaleString('ko-KR')}장의 사진 중 ${current.toLocaleString('ko-KR')}장을 살펴보고 있어요`,
    loadingFilm: '지금까지 지나온 장면',
    loadingPeople: '자주 보이는 이름과 아바타',
    loadingTitle: '추억이 하나씩 모습을 드러내고 있어요',
    monthStory: (count: number) =>
      `이 한 달에만 ${count.toLocaleString('ko-KR')}장의 장면이 남아 있어요.`,
    nextStep: '장소와 사람이 모입니다',
    nextStepBody:
      '사진에 남은 날짜와 반복되는 장소, 함께 등장한 모습이 시간순으로 이어져요.',
    noNamesYet: '반복해서 등장한 이름과 모습을 찾는 중이에요.',
    noWorld: '이름이 남지 않은 월드',
    peopleBody: '사진마다 다시 나타난 이름들이 이 시간의 동행자가 되었습니다.',
    peopleCount: '다시 만난 사람',
    peopleTitle: '몇 번이고 다시 만난 이름',
    photoCount: '남겨진 사진',
    preparing:
      '사진을 살펴보는 데 필요한 준비를 하고 있어요. 처음 시작할 때는 잠시 시간이 걸릴 수 있어요.',
    preparingLabel: '사진을 살펴볼 준비 중',
    preparingTitle: '추억을 펼칠 준비를 하고 있어요',
    recapEyebrow: 'YOUR VRCHAT MEMORIES',
    recapLead: (days: number) =>
      `${days.toLocaleString('ko-KR')}일에 걸쳐 남긴 장면들이 다시 하나의 흐름이 되었습니다.`,
    recapTitle: (name?: string) => (name ? `${name}의 추억` : '당신의 추억'),
    scroll: '아래로 내려 추억을 이어서 보세요',
    shareBody:
      '사진, 활동한 날, 자주 돌아간 장소와 함께한 사람을 한 장의 이미지로 모아보세요.',
    shareCardTitle: (name?: string) =>
      name ? `${name}님의 VRC Recap` : '나의 VRC Recap',
    shareFailed: '공유 이미지를 만들지 못했어요. 잠시 후 다시 시도해 주세요.',
    shareLabel: '한 장으로 보는 종합 결과',
    shareMonthValue: (month: string, photos: number) =>
      `${month} · ${photos.toLocaleString('ko-KR')}장`,
    sharePreparing: '공유 이미지를 만들고 있어요…',
    shareSaved: '공유 이미지가 저장됐어요.',
    shareSpecialValue: (days: number) => `${days.toLocaleString('ko-KR')}일`,
    shareTitle: '이 모든 추억을 한 장에',
    shareSceneValue: (scene: string, days: number) =>
      `${scene} · ${days.toLocaleString('ko-KR')}일`,
    shareWorldValue: (world: string, days: number) =>
      `${world} · ${days.toLocaleString('ko-KR')}일`,
    saveShareImage: '공유 이미지 저장',
    selfBody: (name: string, count: number) =>
      `${name}님은 ${count.toLocaleString('ko-KR')}장의 사진에 가장 자주 남은 이름이에요.`,
    selfFaceBody: (count: number) =>
      `${count.toLocaleString('ko-KR')}일에 걸쳐 가장 익숙한 모습이 다시 나타났어요.`,
    specialBody: (count: number) =>
      `둘만 함께한 날이 ${count.toLocaleString('ko-KR')}일. 같은 날의 연속 사진은 한 번으로 모아, 여러 날 이어진 인연만 남겼습니다.`,
    specialGeneric: '가장 익숙한 사람',
    specialLabel: '둘만의 시간',
    specialTitle: (name?: string) =>
      name ? `${name}님과 남긴 장면` : '둘만 남긴 장면',
    statDays: '함께한 날',
    statFirstLast: '처음부터 마지막까지',
    statPair: '둘만의 날',
    statPlace: '함께 찾은 월드',
    sceneDays: '일에 등장',
    storyReady: '나만의 Recap이 완성됩니다',
    storyReadyBody:
      '원본 사진에 남은 시간과 장소, 익숙한 모습으로 이어지는 한 편의 추억 이야기를 만나보세요.',
    timelineBody:
      '오래전의 첫 장면부터 가장 최근의 밤까지, 시간순으로 다시 이어봅니다.',
    timelineTitle: '시간을 따라 다시 걷는 장면',
    topDay: '가장 많은 추억이 남은 날',
    topHour: '가장 많은 사진을 남긴 시간',
    topMonth: '가장 많은 추억이 남은 달',
    topPeople: '함께한 이름',
    topPeriod: '가장 많은 장면이 남은 시기',
    topScene: '가장 자주 돌아온 풍경',
    topWorld: '가장 많이 찾은 월드',
    unknownDate: '날짜를 확인하는 중',
    visits: '번 방문',
    visualPeopleBody:
      '사진 속에서 반복해서 함께 등장한 아바타들이 이 시간의 동행자가 되었습니다.',
    visualPeopleCount: '반복해서 나타난 모습',
    visualPeopleTitle: '몇 번이고 다시 만난 모습',
    visualSubjects: (count: number) =>
      `익숙한 모습 ${count.toLocaleString('ko-KR')}명`,
    visualWorldBody:
      '월드 이름이 남지 않아도 비슷한 풍경이 여러 날 반복되며 추억의 장소가 되었습니다.',
    visualWorldsTitle: '사진 속에서 되돌아온 풍경',
    temporalWorldBody:
      '월드 이름이 남아 있지 않아도, 사진을 남긴 달마다 장면을 모아 추억의 흐름을 만들었습니다.',
    temporalWorldsTitle: '달마다 다시 펼친 장면',
    worldBody: '문을 열고 다시 찾았던 장소들이 추억의 배경으로 남았습니다.',
    worldPhotos: '장의 사진',
    worldsTitle: '몇 번이고 돌아간 월드',
  },
  en: {
    activeDays: 'days remembered',
    activeMonths: 'months remembered',
    brandLabel: 'Back to VRC Recap',
    chooseFolder: 'Choose photo folder',
    chooseFolderAgain: 'Start again with another folder',
    composing: 'The scattered moments are becoming one story.',
    discoveredPeople: 'people appearing',
    discoveredWorlds: 'places returning',
    dayStory: (count: number) =>
      `${count.toLocaleString('en-US')} moments were saved on this day alone.`,
    emptyPeople:
      'No person appeared often enough to form a group, but the dates and scenes still remain part of the story.',
    endingBody:
      'A long stretch of time can feel close again through a handful of photos and familiar names.',
    endingTitle: 'You are still there, exactly as the photos remember.',
    errorAnalysis:
      'Something went wrong while looking through the photos. Please try again with readable images.',
    errorFolder: 'This browser could not open the folder directly.',
    errorNoImages: 'No photos were found in the selected folder.',
    firstStep: 'Choose your photo folder',
    firstStepBody:
      'Choose your VRChat screenshot folder. Your photos are never sent to a server.',
    familiarPerson: (rank: number) => `Familiar avatar ${rank}`,
    familiarScene: (rank: number) => `Returning scene ${rank}`,
    foundPair:
      'Looking for moments with just the two of you across different days.',
    foundPerson: (name: string) => `We found a moment shared with ${name}.`,
    foundVisualPerson: (count: number) =>
      `${count.toLocaleString('en-US')} familiar figures are coming into view.`,
    foundWorld: (world: string) => `${world} is coming back into view.`,
    galleryLabel: 'Memory photos',
    heroAccent: 'the time we shared',
    heroBody:
      'Return to the scenes you revisited, the familiar figures who kept appearing, and the connections that lasted across thousands of screenshots.',
    heroTitle: 'Still alive in our photos:',
    language: 'Language',
    loadingCount: (current: number, total: number) =>
      `Looking through ${current.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} memories`,
    loadingFilm: 'Moments seen so far',
    loadingPeople: 'Names and familiar avatars',
    loadingTitle: 'Your memories are appearing one by one',
    monthStory: (count: number) =>
      `${count.toLocaleString('en-US')} moments were saved in this month alone.`,
    nextStep: 'Places and people come together',
    nextStepBody:
      'Dates, recurring places, and familiar figures fall into place along the timeline.',
    noNamesYet:
      'Still looking for names and figures that return across the photos.',
    noWorld: 'A world without a recorded name',
    peopleBody:
      'The names that returned across the photos became the companions of this story.',
    peopleCount: 'people met again',
    peopleTitle: 'The names you met again and again',
    photoCount: 'photos kept',
    preparing:
      'Preparing everything needed to look through your photos. The first start can take a moment.',
    preparingLabel: 'PREPARING YOUR PHOTOS',
    preparingTitle: 'Getting ready to open your memories',
    recapEyebrow: 'YOUR VRCHAT MEMORIES',
    recapLead: (days: number) =>
      `Moments saved across ${days.toLocaleString('en-US')} days have become one continuous story.`,
    recapTitle: (name?: string) =>
      name ? `${name}'s memories` : 'Your memories',
    scroll: 'Scroll to continue through your memories',
    shareBody:
      'Bring your photos, active days, returning places, and familiar people together in one image.',
    shareCardTitle: (name?: string) =>
      name ? `${name}'s VRC Recap` : 'My VRC Recap',
    shareFailed: 'The share image could not be created. Please try again.',
    shareLabel: 'YOUR STORY AT A GLANCE',
    shareMonthValue: (month: string, photos: number) =>
      `${month} · ${photos.toLocaleString('en-US')} photos`,
    sharePreparing: 'Preparing your share image…',
    shareSaved: 'Your share image was saved.',
    shareSpecialValue: (days: number) => `${days.toLocaleString('en-US')} days`,
    shareTitle: 'Your whole story, in one frame',
    shareSceneValue: (scene: string, days: number) =>
      `${scene} · ${days.toLocaleString('en-US')} days`,
    shareWorldValue: (world: string, days: number) =>
      `${world} · ${days.toLocaleString('en-US')} days`,
    saveShareImage: 'Save share image',
    selfBody: (name: string, count: number) =>
      `${name} is the name that appears most often, across ${count.toLocaleString('en-US')} photos.`,
    selfFaceBody: (count: number) =>
      `One familiar figure returns across ${count.toLocaleString('en-US')} different days.`,
    specialBody: (count: number) =>
      `The two of you appear alone across ${count.toLocaleString('en-US')} different days. Bursts from the same day count only once.`,
    specialGeneric: 'Your most familiar person',
    specialLabel: 'JUST THE TWO OF YOU',
    specialTitle: (name?: string) =>
      name
        ? `The moments you shared with ${name}`
        : 'The moments shared by just two',
    statDays: 'days together',
    statFirstLast: 'from first to last',
    statPair: 'days with just two',
    statPlace: 'a world you shared',
    sceneDays: 'days seen',
    storyReady: 'Your personal Recap takes shape',
    storyReadyBody:
      'See a memory story shaped by the times, places, and familiar figures preserved in your original photos.',
    timelineBody:
      'From the earliest frame to the most recent night, the years meet again in order.',
    timelineTitle: 'Following the memories through time',
    topDay: 'The day that held the most memories',
    topHour: 'The hour with the most photos',
    topMonth: 'The month that held the most memories',
    topPeople: 'Names beside you',
    topPeriod: 'The period with the most moments',
    topScene: 'Most familiar returning scene',
    topWorld: 'Most visited world',
    unknownDate: 'Finding the date',
    visits: 'visits',
    visualPeopleBody:
      'The avatars that kept returning across the photos became the companions of this story.',
    visualPeopleCount: 'figures returning',
    visualPeopleTitle: 'The figures you met again and again',
    visualSubjects: (count: number) =>
      `${count.toLocaleString('en-US')} familiar figures`,
    visualWorldBody:
      'Even without recorded world names, similar views returning across different days became places in your memory.',
    visualWorldsTitle: 'The scenes that kept returning',
    temporalWorldBody:
      'Even without recorded world names, the photos now form memory chapters for each month you captured.',
    temporalWorldsTitle: 'Scenes remembered month by month',
    worldBody:
      'The places you opened and returned to became the backdrop of your memories.',
    worldPhotos: 'photos',
    worldsTitle: 'The worlds you kept returning to',
  },
  ja: {
    activeDays: '写真を残した日',
    activeMonths: '思い出を残した月',
    brandLabel: 'VRC Recapの最初へ',
    chooseFolder: '写真フォルダーを選ぶ',
    chooseFolderAgain: '別のフォルダーでもう一度',
    composing: '散らばっていた場面を、ひとつの物語につないでいます。',
    discoveredPeople: '一緒に写った人',
    discoveredWorlds: 'よみがえった場所',
    dayStory: (count: number) =>
      `この1日だけで${count.toLocaleString('ja-JP')}枚の場面が残っています。`,
    emptyPeople:
      '何度も登場する人は十分に見つかりませんでしたが、写真の時間と場面は思い出として残っています。',
    endingBody:
      '長い時間も、数枚の写真と懐かしい名前を通して、もう一度すぐそばに戻ってきます。',
    endingTitle: 'あの頃の私たちは、写真の中にそのまま残っています。',
    errorAnalysis:
      '写真を振り返る途中で問題が起きました。読み込める写真でもう一度お試しください。',
    errorFolder: 'このブラウザーではフォルダーを直接開けませんでした。',
    errorNoImages: '選択したフォルダーに写真が見つかりませんでした。',
    firstStep: '写真フォルダーを選びます',
    firstStepBody:
      'VRChatのスクリーンショットフォルダーを選ぶだけ。写真がサーバーに送信されることはありません。',
    familiarPerson: (rank: number) => `懐かしいアバター ${rank}`,
    familiarScene: (rank: number) => `よみがえった風景 ${rank}`,
    foundPair: '別の日にも続く、ふたりだけの場面を探しています。',
    foundPerson: (name: string) => `${name}さんと過ごした瞬間を見つけました。`,
    foundVisualPerson: (count: number) =>
      `写真の中に${count.toLocaleString('ja-JP')}人の懐かしい姿を見つけました。`,
    foundWorld: (world: string) => `${world}の記憶がよみがえってきました。`,
    galleryLabel: '思い出の写真',
    heroAccent: '一緒に過ごした時間',
    heroBody:
      'たくさんのスクリーンショットから、何度も戻った風景、繰り返し現れた姿、長く続いたつながりを振り返りましょう。',
    heroTitle: '写真の中に残る',
    language: '言語',
    loadingCount: (current: number, total: number) =>
      `${total.toLocaleString('ja-JP')}枚の思い出のうち、${current.toLocaleString('ja-JP')}枚を振り返っています`,
    loadingFilm: 'これまでに見つけた場面',
    loadingPeople: 'よく現れる名前とアバター',
    loadingTitle: '思い出がひとつずつ姿を見せています',
    monthStory: (count: number) =>
      `この1か月だけで${count.toLocaleString('ja-JP')}枚の場面が残っています。`,
    nextStep: '場所と人が集まります',
    nextStepBody:
      '日付、繰り返し現れる場所、一緒に写った姿が時間の流れに沿ってつながります。',
    noNamesYet: '何度も現れる名前と姿を探しています。',
    noWorld: '名前が残っていないワールド',
    peopleBody:
      '写真の中で何度も現れた名前が、この物語の大切な仲間になりました。',
    peopleCount: '再会した人',
    peopleTitle: '何度も再会した名前',
    photoCount: '残された写真',
    preparing:
      '写真を見ていくための準備をしています。最初の起動には少し時間がかかることがあります。',
    preparingLabel: '写真を見る準備中',
    preparingTitle: '思い出を開く準備をしています',
    recapEyebrow: 'YOUR VRCHAT MEMORIES',
    recapLead: (days: number) =>
      `${days.toLocaleString('ja-JP')}日にわたって残した場面が、ひとつの物語になりました。`,
    recapTitle: (name?: string) =>
      name ? `${name}の思い出` : 'あなたの思い出',
    scroll: '下へ進んで思い出の続きを見る',
    shareBody:
      '写真、活動した日、何度も戻った場所、一緒にいた人を一枚の画像にまとめます。',
    shareCardTitle: (name?: string) =>
      name ? `${name}さんのVRC Recap` : '私のVRC Recap',
    shareFailed: '共有画像を作成できませんでした。もう一度お試しください。',
    shareLabel: '一枚で振り返る総合結果',
    shareMonthValue: (month: string, photos: number) =>
      `${month} · ${photos.toLocaleString('ja-JP')}枚`,
    sharePreparing: '共有画像を作成しています…',
    shareSaved: '共有画像を保存しました。',
    shareSpecialValue: (days: number) => `${days.toLocaleString('ja-JP')}日`,
    shareTitle: 'すべての思い出を、一枚に',
    shareSceneValue: (scene: string, days: number) =>
      `${scene} · ${days.toLocaleString('ja-JP')}日`,
    shareWorldValue: (world: string, days: number) =>
      `${world} · ${days.toLocaleString('ja-JP')}日`,
    saveShareImage: '共有画像を保存',
    selfBody: (name: string, count: number) =>
      `${name}さんは、${count.toLocaleString('ja-JP')}枚の写真に最も多く残っている名前です。`,
    selfFaceBody: (count: number) =>
      `${count.toLocaleString('ja-JP')}日間にわたり、ひとつの懐かしい姿が繰り返し現れました。`,
    specialBody: (count: number) =>
      `ふたりだけで過ごした日は${count.toLocaleString('ja-JP')}日。同じ日の連続写真は一度として数え、別の日にも続いたつながりだけを残しました。`,
    specialGeneric: 'いちばん懐かしい人',
    specialLabel: 'ふたりだけの時間',
    specialTitle: (name?: string) =>
      name ? `${name}さんと残した場面` : 'ふたりだけで残した場面',
    statDays: '一緒にいた日',
    statFirstLast: '最初から最後まで',
    statPair: 'ふたりだけの日',
    statPlace: '一緒に訪れたワールド',
    sceneDays: '日で登場',
    storyReady: 'あなただけのRecapが完成します',
    storyReadyBody:
      '元の写真に残った時間、場所、懐かしい姿でつながる、ひとつの思い出の物語です。',
    timelineBody:
      '最初の一枚からいちばん最近の夜まで、時間の順にもう一度たどります。',
    timelineTitle: '時間に沿って思い出をたどる',
    topDay: 'いちばん多くの思い出が残った日',
    topHour: 'いちばん多く写真を残した時間',
    topMonth: 'いちばん多くの思い出が残った月',
    topPeople: '一緒にいた名前',
    topPeriod: 'いちばん多くの場面が残った時期',
    topScene: 'いちばん多く戻った風景',
    topWorld: 'いちばん訪れたワールド',
    unknownDate: '日付を確認しています',
    visits: '回訪問',
    visualPeopleBody:
      '写真の中で何度も一緒に現れたアバターが、この物語の仲間になりました。',
    visualPeopleCount: '繰り返し現れた姿',
    visualPeopleTitle: '何度も再会した姿',
    visualSubjects: (count: number) =>
      `懐かしい姿 ${count.toLocaleString('ja-JP')}人`,
    visualWorldBody:
      'ワールド名が残っていなくても、似た風景が別の日に繰り返し現れ、思い出の場所になりました。',
    visualWorldsTitle: '写真の中でよみがえった風景',
    temporalWorldBody:
      'ワールド名が残っていなくても、写真を残した月ごとに場面を集め、思い出の流れをつくりました。',
    temporalWorldsTitle: '月ごとによみがえる場面',
    worldBody: '扉を開き、何度も戻った場所が思い出の背景として残っています。',
    worldPhotos: '枚の写真',
    worldsTitle: '何度も戻ったワールド',
  },
} as const

function localeFor(language: Language): string {
  return language === 'ko' ? 'ko-KR' : language === 'ja' ? 'ja-JP' : 'en-US'
}

function formatDate(
  language: Language,
  value: string,
  style: 'long' | 'short' = 'long',
): string {
  return new Intl.DateTimeFormat(
    localeFor(language),
    style === 'long'
      ? { day: 'numeric', month: 'long', year: 'numeric' }
      : { month: 'short', year: 'numeric' },
  ).format(new Date(value))
}

function formatMonth(language: Language, year: number, month: number): string {
  return new Intl.DateTimeFormat(localeFor(language), {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, 1))
}

function formatCalendarDay(
  language: Language,
  year: number,
  month: number,
  day: number,
): string {
  return new Intl.DateTimeFormat(localeFor(language), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month - 1, day, 12))
}

function formatHour(language: Language, hour: number): string {
  if (language === 'ko') return `${hour}시`
  if (language === 'ja') return `${hour}時`
  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    hour12: true,
  }).format(new Date(2026, 0, 1, hour))
}

function formatCompactDate(value: string): string {
  const date = new Date(value)
  return [
    String(date.getFullYear()).slice(-2),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('.')
}

function recapPlaceName(
  language: Language,
  world: MemoryJourney['stats']['topWorlds'][number],
  fallback: string,
): string {
  if (world.inference === 'temporal' && world.year && world.month) {
    return formatMonth(language, world.year, world.month)
  }
  return world.displayName ?? fallback
}

function formatMonthRange(
  language: Language,
  startValue: string,
  endValue: string,
): string {
  const start = new Date(startValue)
  const end = new Date(endValue)
  const startYear = start.getFullYear()
  const endYear = end.getFullYear()
  const startMonth = start.getMonth() + 1
  const endMonth = end.getMonth() + 1

  if (startYear === endYear && startMonth === endMonth) {
    return formatMonth(language, startYear, startMonth)
  }
  if (startYear === endYear) {
    if (language === 'ko')
      return `${startYear}년 ${startMonth}월 — ${endMonth}월`
    if (language === 'ja')
      return `${startYear}年${startMonth}月 — ${endMonth}月`
    const formatter = new Intl.DateTimeFormat(localeFor(language), {
      month: 'long',
    })
    return `${formatter.format(start)} — ${formatter.format(end)} ${startYear}`
  }
  return `${formatMonth(language, startYear, startMonth)} — ${formatMonth(language, endYear, endMonth)}`
}

function formatNumber(language: Language, value: number): string {
  return value.toLocaleString(localeFor(language))
}

function formatVisitCount(language: Language, value: number): string {
  const count = formatNumber(language, value)
  if (language === 'ko') return `${count}번 방문`
  if (language === 'ja') return `${count}回訪問`
  return `${count} visits`
}

function canvasText(
  context: CanvasRenderingContext2D,
  value: string,
  maximumWidth: number,
): string {
  if (context.measureText(value).width <= maximumWidth) return value
  let shortened = value
  while (
    shortened.length > 1 &&
    context.measureText(`${shortened}…`).width > maximumWidth
  ) {
    shortened = shortened.slice(0, -1)
  }
  return `${shortened}…`
}

function drawCoveredImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  context.fillStyle = '#0d0d0c'
  context.fillRect(x, y, width, height)
  const scale = Math.max(
    width / image.naturalWidth,
    height / image.naturalHeight,
  )
  const drawWidth = image.naturalWidth * scale
  const drawHeight = image.naturalHeight * scale
  context.save()
  context.beginPath()
  context.rect(x, y, width, height)
  context.clip()
  context.drawImage(
    image,
    x + (width - drawWidth) / 2,
    y + (height - drawHeight) / 2,
    drawWidth,
    drawHeight,
  )
  context.restore()
  context.strokeStyle = 'rgba(241,237,229,.24)'
  context.lineWidth = 2
  context.strokeRect(x, y, width, height)
}

function loadShareImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.decoding = 'async'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Unable to load a recap photo.'))
    image.src = url
  })
}

async function createShareCardBlob(
  journey: MemoryJourney,
  language: Language,
  photos: RecapPhoto[],
): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = 1600
  canvas.height = 900
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Unable to create the share card.')

  const t = COPY[language]
  const selfName = journey.stats.self?.displayName
  const special = journey.stats.specialPerson
  const topWorldResult = journey.stats.topWorlds[0]
  const topWorld = topWorldResult
    ? recapPlaceName(language, topWorldResult, t.familiarScene(1))
    : t.noWorld
  const peopleSummaryLabel =
    journey.stats.people.length > 0
      ? t.peopleCount
      : journey.stats.recurringPeople > 0
        ? t.visualPeopleCount
        : t.activeMonths
  const peopleSummaryValue =
    journey.stats.people.length > 0
      ? journey.stats.people.length
      : journey.stats.recurringPeople > 0
        ? journey.stats.recurringPeople
        : journey.stats.activeMonths
  const usesTopDay = journey.stats.topPeriod === 'day'
  const topPeriodLabel = usesTopDay ? t.topDay : t.topMonth
  const topPeriodName = usesTopDay
    ? formatCalendarDay(
        language,
        journey.stats.topDay.year,
        journey.stats.topDay.month,
        journey.stats.topDay.day,
      )
    : formatMonth(
        language,
        journey.stats.topMonth.year,
        journey.stats.topMonth.month,
      )
  const topPeriodPhotoCount = usesTopDay
    ? journey.stats.topDay.photoCount
    : journey.stats.topMonth.photoCount
  const shareTitleFontSize =
    language === 'en' ? 67 : language === 'ko' ? 59 : 54
  const shareLeadFontSize = language === 'en' ? 24 : language === 'ko' ? 22 : 21
  const shareValueFontSize =
    language === 'en' ? 27 : language === 'ko' ? 24 : 22
  const [brandMark, loadedPhotos] = await Promise.all([
    loadShareImage(BRAND_MARK_SRC),
    Promise.all(photos.slice(0, 4).map((photo) => loadShareImage(photo.url))),
  ])

  context.fillStyle = '#171715'
  context.fillRect(0, 0, canvas.width, canvas.height)
  const glow = context.createRadialGradient(1260, 280, 20, 1260, 280, 680)
  glow.addColorStop(0, 'rgba(168,70,50,.28)')
  glow.addColorStop(1, 'rgba(23,23,21,0)')
  context.fillStyle = glow
  context.fillRect(0, 0, canvas.width, canvas.height)

  context.drawImage(brandMark, 70, 70, 70, 70)

  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillStyle = '#f1ede5'
  context.font = '800 22px Segoe UI, sans-serif'
  context.fillText('VRC RECAP', 164, 93)
  context.fillStyle = '#a7a096'
  context.font = '600 15px Segoe UI, sans-serif'
  context.fillText(
    formatMonthRange(language, journey.startDate, journey.endDate),
    164,
    126,
  )

  context.fillStyle = '#fffaf0'
  context.font = `400 ${shareTitleFontSize}px Georgia, Noto Serif KR, Yu Mincho, serif`
  const title = canvasText(context, t.shareCardTitle(selfName), 690)
  context.fillText(title, 70, 230)
  context.fillStyle = '#d5cec3'
  context.font = `400 ${shareLeadFontSize}px Segoe UI, sans-serif`
  context.fillText(
    canvasText(context, t.recapLead(journey.stats.activeDays), 690),
    72,
    274,
  )

  context.fillStyle = '#fffaf0'
  context.font = '400 118px Georgia, serif'
  const photoCountText = formatNumber(language, journey.totalPhotos)
  context.fillText(photoCountText, 70, 430)
  const photoCountWidth = context.measureText(photoCountText).width
  context.fillStyle = '#d7836c'
  context.font = '800 17px Segoe UI, sans-serif'
  context.fillText(
    t.photoCount.toLocaleUpperCase(localeFor(language)),
    94 + photoCountWidth,
    448,
  )

  const summary = [
    {
      label:
        topWorldResult?.inference === 'visual'
          ? t.topScene
          : topWorldResult?.inference === 'temporal'
            ? t.topPeriod
            : t.topWorld,
      value: topWorldResult
        ? topWorldResult.inference !== 'metadata'
          ? t.shareSceneValue(topWorld, topWorldResult.activeDays)
          : t.shareWorldValue(topWorld, topWorldResult.activeDays)
        : topWorld,
    },
    {
      label: t.specialLabel,
      value: special ? t.shareSpecialValue(special.pairDays) : '—',
    },
    {
      label: topPeriodLabel,
      value: t.shareMonthValue(topPeriodName, topPeriodPhotoCount),
    },
    {
      label: t.activeDays,
      value: formatNumber(language, journey.stats.activeDays),
    },
    {
      label: t.topHour,
      value: formatHour(language, journey.stats.topHour),
    },
    {
      label: peopleSummaryLabel,
      value: formatNumber(language, peopleSummaryValue),
    },
  ]
  summary.forEach((item, index) => {
    const column = index % 2
    const row = Math.floor(index / 2)
    const x = 70 + column * 348
    const y = 510 + row * 102
    context.strokeStyle = 'rgba(241,237,229,.18)'
    context.strokeRect(x, y, 318, 78)
    context.fillStyle = '#8f8980'
    context.font = '700 13px Segoe UI, sans-serif'
    context.fillText(canvasText(context, item.label, 278), x + 18, y + 23)
    context.fillStyle = '#fffaf0'
    context.font = `400 ${shareValueFontSize}px Georgia, Noto Serif KR, Yu Mincho, serif`
    context.fillText(canvasText(context, item.value, 278), x + 18, y + 57)
  })

  const names = journey.stats.people
    .slice(0, 4)
    .map((person, index) => person.displayName ?? t.familiarPerson(index + 1))
  if (names.length) {
    context.fillStyle = '#8f8980'
    context.font = '700 13px Segoe UI, sans-serif'
    context.fillText(t.topPeople, 70, 824)
    context.fillStyle = '#d8d1c6'
    context.font = '400 20px Segoe UI, sans-serif'
    context.fillText(canvasText(context, names.join(' · '), 660), 70, 854)
  }

  const photoRects = [
    [820, 70, 330, 335],
    [1200, 70, 330, 335],
    [820, 455, 330, 335],
    [1200, 455, 330, 335],
  ] as const
  loadedPhotos.forEach((image, index) => {
    const [x, y, width, height] = photoRects[index]
    context.fillStyle = '#f1ede5'
    context.fillRect(x - 10, y - 10, width + 20, height + 42)
    drawCoveredImage(context, image, x, y, width, height)
  })

  context.fillStyle = '#a84632'
  context.fillRect(820, 862, 710, 2)
  context.fillStyle = '#8f8980'
  context.font = '700 13px Segoe UI, sans-serif'
  context.textAlign = 'right'
  context.fillText('#VRCRecap', 1530, 850)

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error('Unable to encode the share card.')),
      'image/png',
    )
  })
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = fileName
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

async function readDirectory(handle: LocalDirectoryHandle): Promise<File[]> {
  const files: File[] = []
  const directories: LocalDirectoryHandle[] = []
  let batch: LocalFileHandle[] = []

  const flushBatch = async () => {
    if (!batch.length) return
    files.push(...(await Promise.all(batch.map((entry) => entry.getFile()))))
    batch = []
  }

  for await (const entry of handle.values()) {
    if (entry.kind === 'file') {
      batch.push(entry)
      if (batch.length === 32) await flushBatch()
    } else {
      directories.push(entry)
    }
  }
  await flushBatch()
  for (const directory of directories) {
    files.push(...(await readDirectory(directory)))
  }
  return files
}

function LanguageSelector({
  language,
  onChange,
}: {
  language: Language
  onChange: (language: Language) => void
}) {
  const t = COPY[language]
  return (
    <div className="language-switcher" aria-label={t.language}>
      {(['ko', 'en', 'ja'] as const).map((item) => (
        <button
          aria-pressed={language === item}
          key={item}
          onClick={() => onChange(item)}
          type="button"
        >
          {item === 'ko' ? '한국어' : item === 'en' ? 'English' : '日本語'}
        </button>
      ))}
    </div>
  )
}

function Brand() {
  return (
    <a className="memory-brand" href="#top">
      <img
        alt=""
        aria-hidden="true"
        height="36"
        src={BRAND_MARK_SRC}
        width="36"
      />
      <b>VRC RECAP</b>
    </a>
  )
}

function Intro({
  error,
  language,
  onLanguage,
  onPickFolder,
}: {
  error: ErrorKind | null
  language: Language
  onLanguage: (language: Language) => void
  onPickFolder: () => void
}) {
  const t = COPY[language]
  const errorText =
    error === 'folder'
      ? t.errorFolder
      : error === 'no-images'
        ? t.errorNoImages
        : error === 'analysis'
          ? t.errorAnalysis
          : null
  const steps = [
    [t.firstStep, t.firstStepBody],
    [t.nextStep, t.nextStepBody],
    [t.storyReady, t.storyReadyBody],
  ]

  return (
    <main className="memory-intro" id="top">
      <header className="memory-topbar">
        <Brand />
        <LanguageSelector language={language} onChange={onLanguage} />
      </header>

      <section className="memory-hero">
        <div className="memory-hero-copy">
          <p className="memory-kicker">
            YOUR PHOTOS · YOUR PEOPLE · YOUR WORLDS
          </p>
          <h1>
            {t.heroTitle}
            <em>{t.heroAccent}</em>
          </h1>
          <p className="memory-hero-body">{t.heroBody}</p>
          <button
            className="memory-primary-button"
            type="button"
            onClick={onPickFolder}
          >
            <span aria-hidden="true" />
            {t.chooseFolder}
          </button>
          {errorText && (
            <p className="memory-error" role="alert">
              {errorText}
            </p>
          )}
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
  )
}

function loadingMessage(
  language: Language,
  progress: AnalysisProgress,
): string {
  const t = COPY[language]
  if (progress.stage === 'preparing') return t.preparing
  if (progress.stage === 'composing') return t.composing
  if (progress.photo?.twoPersonMoment) return t.foundPair
  if (progress.photo?.nicknames[0])
    return t.foundPerson(progress.photo.nicknames[0])
  if (progress.photo?.worldName) return t.foundWorld(progress.photo.worldName)
  if (progress.photo?.visualSubjects) {
    return t.foundVisualPerson(progress.photo.visualSubjects)
  }
  return progress.photo
    ? formatDate(language, progress.photo.date)
    : t.unknownDate
}

function Analyzing({
  language,
  onLanguage,
  previews,
  progress,
}: {
  language: Language
  onLanguage: (language: Language) => void
  previews: LoadingPreview[]
  progress: AnalysisProgress
}) {
  const t = COPY[language]
  const percent = Math.round(
    (progress.current / Math.max(1, progress.total)) * 100,
  )
  const current = previews[0]
  const isPreparing = progress.stage === 'preparing'

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
                {current.nicknames.length > 0 ? (
                  <span>{current.nicknames.join(' · ')}</span>
                ) : current.visualSubjects > 0 ? (
                  <span>{t.visualSubjects(current.visualSubjects)}</span>
                ) : null}
              </figcaption>
            </figure>
          ) : (
            <div className="loading-photo-placeholder" role="status">
              <i aria-hidden="true" />
              <span>{t.preparingLabel}</span>
            </div>
          )}
        </div>

        <div className="loading-story">
          <p className="memory-kicker">
            {isPreparing
              ? t.preparingLabel
              : t.loadingCount(progress.current, progress.total)}
          </p>
          <h1>{isPreparing ? t.preparingTitle : t.loadingTitle}</h1>
          <p className="loading-message">
            {loadingMessage(language, progress)}
          </p>
          <div
            aria-label={isPreparing ? t.preparingLabel : `${percent}%`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={isPreparing ? undefined : percent}
            className={`memory-progress ${isPreparing ? 'is-indeterminate' : ''}`}
            role="progressbar"
          >
            <span style={isPreparing ? undefined : { width: `${percent}%` }} />
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
              <b>
                {formatNumber(language, progress.discoveries.daysWithTwoPeople)}
              </b>
              <span>{t.statPair}</span>
            </article>
          </div>
          <div className="loading-names">
            <span>{t.loadingPeople}</span>
            <div>
              {progress.discoveries.topNames.length ? (
                progress.discoveries.topNames.map((name) => (
                  <b key={name}>{name}</b>
                ))
              ) : progress.discoveries.visualPeople > 0 ? (
                Array.from(
                  { length: Math.min(4, progress.discoveries.visualPeople) },
                  (_, index) => (
                    <b key={index}>{t.familiarPerson(index + 1)}</b>
                  ),
                )
              ) : (
                <p>{t.noNamesYet}</p>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="loading-filmstrip" aria-label={t.loadingFilm}>
        <span>{t.loadingFilm}</span>
        <div>
          {previews.length > 0
            ? previews.map((preview) => (
                <figure key={`${preview.fileName}-${preview.date}`}>
                  <img src={preview.url} alt="" />
                </figure>
              ))
            : Array.from({ length: 12 }, (_, index) => (
                <figure
                  className="loading-film-placeholder"
                  key={index}
                  aria-hidden="true"
                />
              ))}
        </div>
      </section>
    </main>
  )
}

function PhotoFrame({
  language,
  photo,
  prominent = false,
}: {
  language: Language
  photo: RecapPhoto
  prominent?: boolean
}) {
  const t = COPY[language]
  const place =
    photo.worldName ??
    (photo.visualSceneRank ? t.familiarScene(photo.visualSceneRank) : t.noWorld)
  const people =
    photo.nicknames.length > 0
      ? photo.nicknames.join(' · ')
      : photo.visualSubjects > 0
        ? t.visualSubjects(photo.visualSubjects)
        : undefined
  const details = [formatDate(language, photo.date), place, people]
    .filter(Boolean)
    .join(', ')
  return (
    <figure className={`recap-photo-frame ${prominent ? 'prominent' : ''}`}>
      <div>
        <img src={photo.url} alt={details || t.galleryLabel} />
      </div>
      <figcaption>
        <time>{formatDate(language, photo.date)}</time>
        <b>{place}</b>
        {people && <span>{people}</span>}
      </figcaption>
    </figure>
  )
}

function Recap({
  journey,
  language,
  onLanguage,
  onRestart,
}: {
  journey: MemoryJourney
  language: Language
  onLanguage: (language: Language) => void
  onRestart: () => void
}) {
  const t = COPY[language]
  const storyRef = useRef<HTMLElement>(null)
  const [shareBusy, setShareBusy] = useState(false)
  const [shareStatus, setShareStatus] = useState<
    'failed' | 'preparing' | 'saved' | null
  >(null)
  const photos = useMemo(
    () => new Map(journey.photos.map((photo) => [photo.id, photo])),
    [journey.photos],
  )
  const coverPhoto = photos.get(journey.coverPhotoId) ?? journey.photos[0]
  const peakPeriodPhoto = journey.peakPeriodPhotoId
    ? photos.get(journey.peakPeriodPhotoId)
    : undefined
  const timelinePhotos = journey.timelinePhotoIds
    .map((id) => photos.get(id))
    .filter((photo): photo is RecapPhoto => Boolean(photo))
  const special = journey.stats.specialPerson
  const specialPhotos = useMemo(
    () =>
      special?.photoIds
        .map((id) => photos.get(id))
        .filter((photo): photo is RecapPhoto => Boolean(photo)) ?? [],
    [photos, special],
  )
  const selfName = journey.stats.self?.displayName
  const selfPhoto = journey.stats.self?.photoId
    ? photos.get(journey.stats.self.photoId)
    : undefined
  const worldPhotos = journey.stats.topWorlds
    .map((world) => (world.photoId ? photos.get(world.photoId) : undefined))
    .filter((photo): photo is RecapPhoto => Boolean(photo))
  const summaryPhotos = Array.from(
    new Map(
      [
        coverPhoto,
        peakPeriodPhoto,
        worldPhotos[0],
        worldPhotos[1],
        timelinePhotos[Math.floor(timelinePhotos.length / 2)],
        timelinePhotos.at(-1),
        timelinePhotos[0],
        specialPhotos[0],
        specialPhotos[1],
      ]
        .filter((photo): photo is RecapPhoto => Boolean(photo))
        .map((photo) => [photo.id, photo]),
    ).values(),
  ).slice(0, 4)
  const topWorldResult = journey.stats.topWorlds[0]
  const topWorld = topWorldResult
    ? recapPlaceName(language, topWorldResult, t.familiarScene(1))
    : undefined
  const peopleLabels = journey.stats.people.map(
    (person, index) => person.displayName ?? t.familiarPerson(index + 1),
  )
  const usesVisualPeople =
    journey.stats.self?.inference === 'visual' ||
    (journey.stats.people.length > 0 &&
      journey.stats.people.every((person) => person.inference === 'visual'))
  const usesVisualWorlds =
    journey.stats.topWorlds.length > 0 &&
    journey.stats.topWorlds.every((world) => world.inference === 'visual')
  const usesTemporalWorlds =
    journey.stats.topWorlds.length > 0 &&
    journey.stats.topWorlds.every((world) => world.inference === 'temporal')
  const usesTopDay = journey.stats.topPeriod === 'day'
  const topPeriodLabel = usesTopDay ? t.topDay : t.topMonth
  const topPeriodName = usesTopDay
    ? formatCalendarDay(
        language,
        journey.stats.topDay.year,
        journey.stats.topDay.month,
        journey.stats.topDay.day,
      )
    : formatMonth(
        language,
        journey.stats.topMonth.year,
        journey.stats.topMonth.month,
      )
  const topPeriodPhotoCount = usesTopDay
    ? journey.stats.topDay.photoCount
    : journey.stats.topMonth.photoCount
  const topPeriodValue = t.shareMonthValue(topPeriodName, topPeriodPhotoCount)
  const topWorldValue = topWorldResult
    ? topWorldResult.inference !== 'metadata'
      ? t.shareSceneValue(
          topWorld ?? t.familiarScene(1),
          topWorldResult.activeDays,
        )
      : t.shareWorldValue(topWorld ?? t.noWorld, topWorldResult.activeDays)
    : t.noWorld
  const specialValue = special ? t.shareSpecialValue(special.pairDays) : '—'
  const peopleSummaryLabel =
    journey.stats.people.length > 0
      ? t.peopleCount
      : journey.stats.recurringPeople > 0
        ? t.visualPeopleCount
        : t.activeMonths
  const peopleSummaryValue =
    journey.stats.people.length > 0
      ? journey.stats.people.length
      : journey.stats.recurringPeople > 0
        ? journey.stats.recurringPeople
        : journey.stats.activeMonths
  const shareFileName = `vrc-recap-${new Date(journey.endDate).getFullYear()}.png`
  const shareStatusText =
    shareStatus === 'preparing'
      ? t.sharePreparing
      : shareStatus === 'saved'
        ? t.shareSaved
        : shareStatus === 'failed'
          ? t.shareFailed
          : null

  useEffect(() => {
    const story = storyRef.current
    if (!story || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
      return

    const images = Array.from(story.querySelectorAll<HTMLImageElement>('img'))
    const currentPositions = new Map<HTMLImageElement, number>()
    const targetPositions = new Map<HTMLImageElement, number>()
    let measureFrame = 0
    let motionFrame = 0

    const animate = () => {
      motionFrame = 0
      let isMoving = false

      for (const [image, target] of targetPositions) {
        const current = currentPositions.get(image) ?? target
        const distance = target - current
        const next =
          Math.abs(distance) < 0.04 ? target : current + distance * 0.085
        currentPositions.set(image, next)
        image.style.setProperty('--photo-pan-y', `${next.toFixed(2)}%`)
        if (next !== target) isMoving = true
      }

      if (isMoving) motionFrame = window.requestAnimationFrame(animate)
    }

    const startMotion = () => {
      if (!motionFrame) motionFrame = window.requestAnimationFrame(animate)
    }

    const measure = () => {
      measureFrame = 0
      const viewportHeight = window.innerHeight

      for (const image of images) {
        if (
          !image.complete ||
          image.naturalWidth === 0 ||
          image.naturalHeight === 0
        )
          continue
        const rect = image.getBoundingClientRect()
        if (rect.width === 0 || rect.height === 0) continue

        const imageAspect = image.naturalWidth / image.naturalHeight
        const frameAspect = rect.width / rect.height
        const isVerticallyCropped = imageAspect < frameAspect - 0.02

        if (!isVerticallyCropped) {
          image.removeAttribute('data-photo-pan')
          image.style.removeProperty('--photo-pan-y')
          currentPositions.delete(image)
          targetPositions.delete(image)
          continue
        }

        const progress = Math.min(
          1,
          Math.max(
            0,
            (viewportHeight - rect.top) / (viewportHeight + rect.height),
          ),
        )
        const isMainPhoto = image.dataset.mainPhoto === 'true'
        const minimum = isMainPhoto ? 12 : 0
        const maximum = isMainPhoto ? 88 : 100
        const target = minimum + progress * (maximum - minimum)
        image.dataset.photoPan = 'true'
        targetPositions.set(image, target)

        if (!currentPositions.has(image)) {
          currentPositions.set(image, target)
          image.style.setProperty('--photo-pan-y', `${target.toFixed(2)}%`)
        }
      }

      startMotion()
    }

    const requestMeasure = () => {
      if (measureFrame) return
      measureFrame = window.requestAnimationFrame(measure)
    }

    images.forEach((image) => image.addEventListener('load', requestMeasure))
    window.addEventListener('resize', requestMeasure, { passive: true })
    window.addEventListener('scroll', requestMeasure, { passive: true })
    requestMeasure()

    return () => {
      if (measureFrame) window.cancelAnimationFrame(measureFrame)
      if (motionFrame) window.cancelAnimationFrame(motionFrame)
      images.forEach((image) => {
        image.removeEventListener('load', requestMeasure)
        image.removeAttribute('data-photo-pan')
        image.style.removeProperty('--photo-pan-y')
      })
      window.removeEventListener('resize', requestMeasure)
      window.removeEventListener('scroll', requestMeasure)
    }
  }, [journey])

  const saveShareImage = async () => {
    if (shareBusy) return
    setShareBusy(true)
    setShareStatus('preparing')
    try {
      const blob = await createShareCardBlob(journey, language, summaryPhotos)
      downloadBlob(blob, shareFileName)
      setShareStatus('saved')
    } catch {
      setShareStatus('failed')
    } finally {
      setShareBusy(false)
    }
  }

  return (
    <main className="recap-story" id="top" ref={storyRef}>
      <header className="memory-topbar recap-topbar">
        <Brand />
        <div className="recap-topbar-actions">
          <LanguageSelector language={language} onChange={onLanguage} />
          <button type="button" onClick={onRestart}>
            {t.chooseFolderAgain}
          </button>
        </div>
      </header>

      <section className="recap-cover">
        <div
          className="recap-cover-backdrop"
          style={{ backgroundImage: `url(${coverPhoto.url})` }}
          aria-hidden="true"
        />
        <div className="recap-cover-inner">
          <div className="recap-cover-photo">
            <img
              src={coverPhoto.url}
              alt=""
              data-main-photo="true"
              fetchPriority="high"
            />
          </div>
          <div className="recap-cover-copy">
            <p className="memory-kicker">{t.recapEyebrow}</p>
            <span>
              {formatMonthRange(language, journey.startDate, journey.endDate)}
            </span>
            <h1>{t.recapTitle(selfName)}</h1>
            <p>{t.recapLead(journey.stats.activeDays)}</p>
            <small>{t.scroll}</small>
          </div>
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
          <b>{formatHour(language, journey.stats.topHour)}</b>
          <span>{t.topHour}</span>
        </article>
      </section>

      <section className="recap-chapter peak-month-chapter">
        <div className="recap-chapter-inner peak-month-inner">
          <div className="chapter-copy">
            <p className="chapter-number">01</p>
            <span>{topPeriodLabel}</span>
            <h2>{topPeriodName}</h2>
            <p>
              {usesTopDay
                ? t.dayStory(topPeriodPhotoCount)
                : t.monthStory(topPeriodPhotoCount)}
            </p>
          </div>
          {peakPeriodPhoto && (
            <PhotoFrame language={language} photo={peakPeriodPhoto} prominent />
          )}
        </div>
      </section>

      {journey.stats.topWorlds.length > 0 && (
        <section className="recap-chapter worlds-chapter">
          <div className="recap-chapter-inner">
            <div className="chapter-heading">
              <p className="chapter-number">02</p>
              <div>
                <span>PLACES</span>
                <h2>
                  {usesVisualWorlds
                    ? t.visualWorldsTitle
                    : usesTemporalWorlds
                      ? t.temporalWorldsTitle
                      : t.worldsTitle}
                </h2>
                <p>
                  {usesVisualWorlds
                    ? t.visualWorldBody
                    : usesTemporalWorlds
                      ? t.temporalWorldBody
                      : t.worldBody}
                </p>
              </div>
            </div>
            <div className="world-memory-grid">
              {journey.stats.topWorlds.map((world, index) => {
                const photo = world.photoId
                  ? photos.get(world.photoId)
                  : undefined
                const worldLabel = recapPlaceName(
                  language,
                  world,
                  t.familiarScene(index + 1),
                )
                return (
                  <article key={world.id}>
                    {photo && <img src={photo.url} alt="" />}
                    <div>
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <h3>{worldLabel}</h3>
                      <p>
                        {world.inference === 'metadata' ? (
                          <b>{formatVisitCount(language, world.activeDays)}</b>
                        ) : (
                          <>
                            <b>{formatNumber(language, world.activeDays)}</b>{' '}
                            {world.inference === 'temporal'
                              ? t.activeDays
                              : t.sceneDays}
                          </>
                        )}
                        <i>·</i>
                        {formatNumber(language, world.photoCount)}{' '}
                        {t.worldPhotos}
                      </p>
                    </div>
                  </article>
                )
              })}
            </div>
          </div>
        </section>
      )}

      <section className="recap-chapter people-chapter">
        <div className="recap-chapter-inner">
          <div className="chapter-heading">
            <p className="chapter-number">03</p>
            <div>
              <span>{t.topPeople}</span>
              <h2>{usesVisualPeople ? t.visualPeopleTitle : t.peopleTitle}</h2>
              <p>{usesVisualPeople ? t.visualPeopleBody : t.peopleBody}</p>
            </div>
          </div>

          {journey.stats.self && (
            <div className="self-memory">
              {selfPhoto ? (
                <img src={selfPhoto.url} alt="" />
              ) : (
                <span>
                  {journey.stats.self.displayName?.slice(0, 1) ?? '✦'}
                </span>
              )}
              <p>
                {journey.stats.self.displayName
                  ? t.selfBody(
                      journey.stats.self.displayName,
                      journey.stats.self.photoCount,
                    )
                  : t.selfFaceBody(journey.stats.self.photoCount)}
              </p>
            </div>
          )}

          {journey.stats.people.length > 0 ? (
            <div className="people-ribbon">
              {journey.stats.people.map((person, index) => (
                <article key={person.id}>
                  {person.photoId && photos.get(person.photoId) && (
                    <img src={photos.get(person.photoId)!.url} alt="" />
                  )}
                  <span>{String(index + 1).padStart(2, '0')}</span>
                  <h3>{peopleLabels[index]}</h3>
                  <p>
                    {formatNumber(language, person.photoCount)} {t.worldPhotos}
                  </p>
                  <small>
                    {formatNumber(language, person.activeDays)} {t.activeDays}
                  </small>
                </article>
              ))}
            </div>
          ) : !journey.stats.self ? (
            <p className="recap-empty">{t.emptyPeople}</p>
          ) : null}
        </div>
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
              <blockquote>{t.specialBody(special.pairDays)}</blockquote>
              <div className="special-stats">
                <article>
                  <b>{formatNumber(language, special.pairDays)}</b>
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
                  <b>
                    {formatCompactDate(special.firstDate)} —{' '}
                    {formatCompactDate(special.lastDate)}
                  </b>
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
        <div className="recap-chapter-inner">
          <div className="chapter-heading">
            <p className="chapter-number">{special ? '05' : '04'}</p>
            <div>
              <span>TIMELINE</span>
              <h2>{t.timelineTitle}</h2>
              <p>{t.timelineBody}</p>
            </div>
          </div>
          <div className="timeline-gallery">
            {timelinePhotos.map((photo, index) => (
              <div
                className={index % 4 === 1 ? 'timeline-offset' : ''}
                key={photo.id}
              >
                <PhotoFrame language={language} photo={photo} />
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="recap-share-chapter">
        <div className="recap-share-inner">
          <div className="share-chapter-heading">
            <p>{t.shareLabel}</p>
            <h2>{t.shareTitle}</h2>
            <span>{t.shareBody}</span>
          </div>

          <div className="share-summary-card">
            <div className="share-summary-copy">
              <div className="share-summary-brand">
                <img alt="" aria-hidden="true" src={BRAND_MARK_SRC} />
                <span>VRC RECAP</span>
              </div>
              <p>
                {formatMonthRange(language, journey.startDate, journey.endDate)}
              </p>
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
                  <span>{topPeriodLabel}</span>
                  <b>{topPeriodValue}</b>
                </article>
                <article>
                  <span>
                    {topWorldResult?.inference === 'visual'
                      ? t.topScene
                      : topWorldResult?.inference === 'temporal'
                        ? t.topPeriod
                        : t.topWorld}
                  </span>
                  <b>{topWorldValue}</b>
                </article>
                <article>
                  <span>{t.specialLabel}</span>
                  <b>{specialValue}</b>
                </article>
                <article>
                  <span>{t.topHour}</span>
                  <b>{formatHour(language, journey.stats.topHour)}</b>
                </article>
                <article>
                  <span>{peopleSummaryLabel}</span>
                  <b>{formatNumber(language, peopleSummaryValue)}</b>
                </article>
              </div>
              {journey.stats.people.length > 0 && (
                <div className="share-people">
                  <span>{t.topPeople}</span>
                  <p>{peopleLabels.slice(0, 4).join(' · ')}</p>
                </div>
              )}
            </div>

            <div className="share-summary-photos" aria-label={t.galleryLabel}>
              {summaryPhotos.map((photo, index) => (
                <figure className={`share-photo-${index + 1}`} key={photo.id}>
                  <img src={photo.url} alt="" />
                </figure>
              ))}
              <b>#VRCRecap</b>
            </div>
          </div>

          <div className="share-actions">
            <button
              className="share-save-button"
              disabled={shareBusy}
              onClick={() => void saveShareImage()}
              type="button"
            >
              {t.saveShareImage}
            </button>
            <button
              className="share-restart-button"
              type="button"
              onClick={onRestart}
            >
              {t.chooseFolderAgain}
            </button>
          </div>
          <p className="share-status" aria-live="polite">
            {shareStatusText}
          </p>
        </div>
      </section>
      <footer className="recap-footer">
        <p>
          © {new Date().getFullYear()}{' '}
          <a
            href="https://x.com/nupamo"
            rel="noopener noreferrer"
            target="_blank"
          >
            nupamo
          </a>
        </p>
      </footer>
    </main>
  )
}

export default function MemoryWalk() {
  const [error, setError] = useState<ErrorKind | null>(null)
  const [journey, setJourney] = useState<MemoryJourney | null>(null)
  const [language, setLanguage] = useState<Language>('en')
  const [phase, setPhase] = useState<AppPhase>('intro')
  const [previews, setPreviews] = useState<LoadingPreview[]>([])
  const [progress, setProgress] = useState<AnalysisProgress>(EMPTY_PROGRESS)
  const folderInput = useRef<HTMLInputElement>(null)
  const journeyRef = useRef<MemoryJourney | null>(null)
  const previewsRef = useRef<LoadingPreview[]>([])

  useEffect(() => {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY)
    const next: Language =
      stored === 'en' || stored === 'ja' || stored === 'ko' ? stored : 'en'
    const timer = window.setTimeout(() => {
      setLanguage(next)
      document.documentElement.lang = next
    }, 0)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    journeyRef.current = journey
  }, [journey])

  useEffect(
    () => () => {
      releaseJourney(journeyRef.current)
      previewsRef.current.forEach((preview) => URL.revokeObjectURL(preview.url))
    },
    [],
  )

  const changeLanguage = useCallback((next: Language) => {
    setLanguage(next)
    localStorage.setItem(LANGUAGE_STORAGE_KEY, next)
    document.documentElement.lang = next
  }, [])

  const clearPreviews = useCallback(() => {
    previewsRef.current.forEach((preview) => URL.revokeObjectURL(preview.url))
    previewsRef.current = []
    setPreviews([])
  }, [])

  const addPreview = useCallback((photo: AnalysisPhoto) => {
    const nextPreview: LoadingPreview = {
      date: photo.date,
      fileName: photo.file.name,
      nicknames: photo.nicknames,
      url: URL.createObjectURL(photo.file),
      visualSubjects: photo.visualSubjects,
      worldName: photo.worldName,
    }
    const next = [nextPreview, ...previewsRef.current].slice(
      0,
      MAX_LOADING_PREVIEWS,
    )
    previewsRef.current
      .slice(MAX_LOADING_PREVIEWS - 1)
      .forEach((preview) => URL.revokeObjectURL(preview.url))
    previewsRef.current = next
    setPreviews(next)
  }, [])

  const startAnalysis = useCallback(
    async (files: Iterable<File>) => {
      setError(null)
      setPhase('analyzing')
      setProgress(EMPTY_PROGRESS)
      clearPreviews()
      let lastPreviewAt = 0
      try {
        const nextJourney = await analyzeFiles(files, (nextProgress) => {
          setProgress(nextProgress)
          if (!nextProgress.photo) return
          const interval = Math.max(1, Math.floor(nextProgress.total / 42))
          if (
            nextProgress.current <= 6 ||
            nextProgress.current === nextProgress.total ||
            nextProgress.current - lastPreviewAt >= interval
          ) {
            lastPreviewAt = nextProgress.current
            addPreview(nextProgress.photo)
          }
        })
        clearPreviews()
        releaseJourney(journeyRef.current)
        journeyRef.current = nextJourney
        setJourney(nextJourney)
        setPhase('recap')
        window.scrollTo({ top: 0 })
      } catch (analysisError) {
        clearPreviews()
        const message =
          analysisError instanceof Error ? analysisError.message : ''
        setError(message.includes('No image') ? 'no-images' : 'analysis')
        setPhase('intro')
      }
    },
    [addPreview, clearPreviews],
  )

  const chooseFolder = useCallback(async () => {
    const picker = (window as FolderPickerWindow).showDirectoryPicker
    if (!picker) {
      folderInput.current?.click()
      return
    }
    try {
      const handle = await picker()
      const files = await readDirectory(handle)
      await startAnalysis(files)
    } catch (pickerError) {
      if (
        pickerError instanceof DOMException &&
        pickerError.name === 'AbortError'
      )
        return
      setError('folder')
      setPhase('intro')
    }
  }, [startAnalysis])

  if (phase === 'analyzing') {
    return (
      <Analyzing
        language={language}
        onLanguage={changeLanguage}
        previews={previews}
        progress={progress}
      />
    )
  }

  if (phase === 'recap' && journey) {
    return (
      <Recap
        journey={journey}
        language={language}
        onLanguage={changeLanguage}
        onRestart={() => {
          releaseJourney(journey)
          journeyRef.current = null
          setJourney(null)
          setPhase('intro')
          window.scrollTo({ top: 0, behavior: 'smooth' })
        }}
      />
    )
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
          if (event.target.files?.length) void startAnalysis(event.target.files)
          event.target.value = ''
        }}
        ref={folderInput}
        type="file"
        {...({ directory: '', webkitdirectory: '' } as Record<string, string>)}
      />
    </>
  )
}
