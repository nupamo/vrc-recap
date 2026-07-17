# VRC Recap

[English](README.en.md) · [Live site](https://nupamo.github.io/vrc-recap/)

VRChat 스크린샷 폴더를 선택하면 원본 사진, 실제 월드 이름, 실제 닉네임과 날짜를 시간순으로 엮어 개인 Recap을 만드는 웹 앱입니다.

## 특징

- 한국어, 영어, 일본어 지원
- 메타데이터에서 가장 자주 등장하는 닉네임을 사용자 본인으로 판단
- 여러 날에 걸쳐 단둘이 찍은 사진으로 특별한 사람의 추억 구성
- 같은 날의 비슷한 장면은 한 번의 방문과 만남으로 계산
- 브라우저 안에서 MediaPipe 모델을 실행해 메타데이터가 부족한 사진을 보완
- 대표 사진 네 장과 주요 통계를 담은 16:9 공유 이미지 저장

사진과 분석 결과는 서버로 전송하지 않습니다. 개인 스크린샷 폴더도 `.gitignore`에 포함되어 저장소에 올라가지 않습니다.

## 로컬 실행

Node.js 22.13 이상과 pnpm 9가 필요합니다.

```bash
cd web
pnpm install
pnpm run dev
```

검증:

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
```

`main` 브랜치에 푸시하면 GitHub Actions가 정적 사이트를 빌드해 GitHub Pages로 배포합니다.

## 더 정확한 분석으로 개선하기

현재 모델은 브라우저에서 빠르고 로컬로 실행되는 것을 우선한 기본 구현입니다. 아바타 식별이나 장면 군집을 더 정확하게 만들고 싶다면 저장소를 포크한 뒤 Claude Code 또는 Codex에 개선을 요청할 수 있습니다. 구체적인 작업 프롬프트는 [영문 README](README.en.md#improve-the-local-models-with-an-ai-coding-agent)에 포함되어 있습니다.

## 라이선스

[MIT](LICENSE)
