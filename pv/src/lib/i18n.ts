export type Lang = "ko" | "ja" | "en";
const MON = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const n = (x: number) => x.toLocaleString("en-US");

/** Lines that appear in the video. `*x*` = emphasis, `/` = cut, `|` = small note, trailing `!` = impact (JIZURA syntax). */
export const V = {
  ko: {
    photos: (c: number) => `사진/*${n(c)}*장`, days: (c: number) => `*${n(c)}*일의/기록`, worlds: (c: number) => `*${n(c)}*개의/월드`,
    month: (m: number) => `${m}월`, topWorlds: "가장 많이/간 곳", daysNote: (c: number) => `${c}일`, people: "함께한/사람들",
    hourHead: "가장/깨어 있던/시간", hour: (h: number) => `${h}시`, bestDay: "가장/길었던/하루", date: (m: number, d: number) => `${m}월 ${d}일`,
    photosNote: (c: number) => `${n(c)}장`, outro: "또 만나!",
  },
  ja: {
    photos: (c: number) => `写真/*${n(c)}*枚`, days: (c: number) => `*${n(c)}*日の/記録`, worlds: (c: number) => `*${n(c)}*の/ワールド`,
    month: (m: number) => `${m}月`, topWorlds: "いちばん/通った場所", daysNote: (c: number) => `${c}日`, people: "一緒に/いた人たち",
    hourHead: "いちばん/起きていた/時間", hour: (h: number) => `${h}時`, bestDay: "いちばん/長かった/一日", date: (m: number, d: number) => `${m}月${d}日`,
    photosNote: (c: number) => `${n(c)}枚`, outro: "またね!",
  },
  en: {
    photos: (c: number) => `*${n(c)}*/photos`, days: (c: number) => `*${n(c)}*/days`, worlds: (c: number) => `*${n(c)}*/worlds`,
    month: (m: number) => MON[m - 1], topWorlds: "Most/visited", daysNote: (c: number) => `${c} days`, people: "With/you",
    hourHead: "Peak/hour", hour: (h: number) => `${String(h).padStart(2, "0")}:00`, bestDay: "Longest/day", date: (m: number, d: number) => `${MON[m - 1]} ${d}`,
    photosNote: (c: number) => `${n(c)} photos`, outro: "See you!",
  },
} as const;

/** Interface strings. */
export const UI = {
  ko: {
    tagline: "스크린샷 폴더를 넣으면, 그 기간이 한 편의 문자 PV가 됩니다.", pick: "스크린샷 폴더 선택", drop: "또는 폴더를 여기에 끌어다 놓기",
    local: "사진은 이 브라우저 안에서만 처리되고 어디에도 업로드되지 않습니다.", found: (c: number) => `사진 ${n(c)}장을 찾았어요`, period: "기간",
    thisYear: "올해", last90: "최근 90일", all: "전체", from: "시작", to: "끝", inRange: (c: number) => `이 기간의 사진 ${n(c)}장`, make: "영상 만들기",
    tooFew: "이 기간에는 사진이 너무 적어요 (최소 8장).", reading: "메타데이터 읽는 중", preparing: "사진 준비 중", composing: "문자 PV 구성 중",
    play: "재생", pause: "일시정지", reroll: "다시 섞기", look: "룩", lookOverlay: "오버레이", lookInvert: "반전", aspect: "화면비", hideNames: "닉네임 가리기",
    music: "음악 넣기", musicOn: "음악 바꾸기", share: "공유용으로 내보내기", back: "처음으로", openWorld: "월드 열기", close: "닫기",
    vrcxOn: "VRCX 메타데이터 발견 — 함께한 사람까지 넣었어요", vrcxOff: "VRCX 메타데이터 없음 — 월드와 시간으로 구성했어요", noWorld: "월드 정보가 없는 사진이 많아 시간 위주로 구성했어요",
    chIntro: "인트로", chWorlds: "월드", chPeople: "사람", chFinale: "피날레", with: "함께",
    shareTitle: "공유용 내보내기", shareBody: "줄인 사진과 manifest.json을 폴더에 저장합니다. 그 폴더를 아무 정적 호스팅에 올리면 링크 하나로 재생돼요. 사진은 wsrv.nl을 거쳐 전송되므로 원본 서버 부담이 작습니다.",
    shareBase: "사진을 올릴 주소 (예: https://example.com/recap/2026/)", shareSave: "폴더에 저장", shareDone: "저장 완료. 공유 링크:", shareNoFs: "이 브라우저는 폴더 저장을 지원하지 않아요. Chrome 또는 Edge에서 열어주세요.",
    loadFail: "공유 데이터를 불러오지 못했어요.", error: "문제가 생겼어요",
  },
  ja: {
    tagline: "スクリーンショットのフォルダを入れると、その期間が一本の文字PVになります。", pick: "スクリーンショットフォルダを選ぶ", drop: "またはフォルダをここにドロップ",
    local: "写真はこのブラウザ内だけで処理され、どこにもアップロードされません。", found: (c: number) => `写真 ${n(c)} 枚を見つけました`, period: "期間",
    thisYear: "今年", last90: "直近90日", all: "すべて", from: "開始", to: "終了", inRange: (c: number) => `この期間の写真 ${n(c)} 枚`, make: "動画をつくる",
    tooFew: "この期間は写真が少なすぎます（最低8枚）。", reading: "メタデータを読み込み中", preparing: "写真を準備中", composing: "文字PVを構成中",
    play: "再生", pause: "一時停止", reroll: "シャッフル", look: "ルック", lookOverlay: "オーバーレイ", lookInvert: "反転", aspect: "比率", hideNames: "名前を隠す",
    music: "音楽を入れる", musicOn: "音楽を変える", share: "共有用に書き出す", back: "最初へ", openWorld: "ワールドを開く", close: "閉じる",
    vrcxOn: "VRCXのメタデータを検出 — 一緒にいた人も入れました", vrcxOff: "VRCXのメタデータなし — ワールドと時間で構成しました", noWorld: "ワールド情報のない写真が多いため、時間中心で構成しました",
    chIntro: "イントロ", chWorlds: "ワールド", chPeople: "ひと", chFinale: "フィナーレ", with: "一緒",
    shareTitle: "共有用の書き出し", shareBody: "縮小した写真と manifest.json をフォルダに保存します。そのフォルダを静的ホスティングに置けば、リンクひとつで再生できます。写真は wsrv.nl 経由で配信されるので、元サーバーの負荷は小さくなります。",
    shareBase: "写真を置くURL（例: https://example.com/recap/2026/）", shareSave: "フォルダに保存", shareDone: "保存しました。共有リンク:", shareNoFs: "このブラウザはフォルダ保存に対応していません。Chrome か Edge で開いてください。",
    loadFail: "共有データを読み込めませんでした。", error: "問題が発生しました",
  },
  en: {
    tagline: "Drop in your screenshot folder and the period becomes a kinetic-type video.", pick: "Choose screenshot folder", drop: "or drop the folder here",
    local: "Photos are processed in this browser only and never uploaded.", found: (c: number) => `Found ${n(c)} photos`, period: "Period",
    thisYear: "This year", last90: "Last 90 days", all: "All", from: "From", to: "To", inRange: (c: number) => `${n(c)} photos in this period`, make: "Make the video",
    tooFew: "Too few photos in this period (8 minimum).", reading: "Reading metadata", preparing: "Preparing photos", composing: "Composing",
    play: "Play", pause: "Pause", reroll: "Shuffle", look: "Look", lookOverlay: "Overlay", lookInvert: "Invert", aspect: "Aspect", hideNames: "Hide names",
    music: "Add music", musicOn: "Change music", share: "Export for sharing", back: "Start over", openWorld: "Open world", close: "Close",
    vrcxOn: "VRCX metadata found — people are included", vrcxOff: "No VRCX metadata — built from worlds and time", noWorld: "Most photos carry no world, so this is built around time",
    chIntro: "Intro", chWorlds: "Worlds", chPeople: "People", chFinale: "Finale", with: "with",
    shareTitle: "Export for sharing", shareBody: "Saves the resized photos and manifest.json to a folder. Put that folder on any static host and one link plays it. Photos are served through wsrv.nl, so your origin does very little work.",
    shareBase: "Where the photos will live (e.g. https://example.com/recap/2026/)", shareSave: "Save to folder", shareDone: "Saved. Share link:", shareNoFs: "This browser cannot save to a folder. Open in Chrome or Edge.",
    loadFail: "Could not load the shared data.", error: "Something went wrong",
  },
} as const;

export const detectLang = (): Lang => {
  const l = (typeof navigator !== "undefined" ? navigator.language : "en").toLowerCase();
  return l.startsWith("ko") ? "ko" : l.startsWith("ja") ? "ja" : "en";
};
