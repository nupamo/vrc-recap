# VRC Recap PV (실험)

스크린샷 폴더를 통째로 넣고 기간을 고르면, 그 기간이 **문자 PV 스타일의 인터랙티브 회상 영상**으로 재생됩니다.
기존 `web/`과는 독립된 실험 프로젝트입니다.

- **Remotion** — 영상은 프레임의 순수 함수인 컴포지션(`src/video/RecapPV.tsx`)이고, 브라우저에서 `@remotion/player`로 재생합니다. 서버 렌더링이 없어 비용이 들지 않습니다.
- **JIZURA** — 타이포 레이어는 [JIZURA](https://github.com/852wa/JIZURA)(MIT) 엔진이 그립니다. 통계 문장을 LRC 타임스탬프가 붙은 "가사"로 넘기고, 매 프레임 `Renderer.frame(ctx, plan, t)`을 투명 캔버스에 호출합니다.
- **wsrv.nl** — 공유된 리캡의 사진은 wsrv.nl을 거쳐 리사이즈·WebP 변환·CDN 캐시되어 전송됩니다. 로컬 재생에는 쓰이지 않습니다(브라우저 안의 blob).

## 동작

1. 폴더 선택 또는 드롭 → 파일명에서 촬영 시각만 읽어 목록화 (디코딩 없음)
2. 기간 선택 (올해 / 최근 90일 / 전체 / 직접)
3. 기간 안의 PNG에서 메타데이터 청크만 읽음
   - **VRCX** `Description` 청크: 월드 + 인스턴스에 있던 사람 → "함께한 사람들" 챕터 추가
   - **VRChat 네이티브 XMP**(2025.3.2+): 월드 + 촬영자
   - 둘 다 없으면 시간 통계만으로 구성
4. 스토리보드(월별 → 월드 → 사람 → 피날레)를 만들고, 쓰일 사진 60~70장만 1600px로 줄임
5. JIZURA 플랜 생성 → 재생

얼굴/이미지 ML은 쓰지 않습니다. 하루의 경계는 05:00이라 자정을 넘긴 밤이 하루로 묶입니다.

## 인터랙션

- 사진 클릭 → 일시정지 + 원본 크게 보기 (날짜, 월드, 함께 있던 사람)
- 월드 이름 버튼 → VRChat 월드 페이지 열기
- 챕터 칩 / 스크럽 바로 이동
- 다시 섞기(시드 변경: 사진 선택과 타이포 구성이 바뀜), 룩(오버레이 / 반전), 16:9 ↔ 9:16
- 닉네임 가리기, 음악 파일 얹기, KO / JA / EN

## 공유

"공유용으로 내보내기"는 줄인 사진과 `manifest.json`을 폴더에 저장합니다(Chrome/Edge). 그 폴더를 정적 호스팅 아무 데나 올리면
`?m=<manifest.json 주소>` 링크로 재생됩니다. 닉네임을 가린 상태로 내보내면 실명은 매니페스트에 들어가지 않습니다.
리캡 하나는 약 1MB입니다(테스트 기준 사진 68장).

## 실행

```sh
pnpm install
pnpm dev
```

JIZURA 엔진은 `public/jizura-engine.js`에 빌드되어 들어 있습니다(v0.13.0, UI·내보내기 제외). 갱신하려면:

```sh
git clone https://github.com/852wa/JIZURA ../JIZURA
pnpm jizura ../JIZURA
```

## 테스트

```sh
pnpm shots   # 합성 스크린샷 폴더 생성 (sharp 필요)
pnpm test    # 파이프라인 테스트
```

## 검증 상태

- 파이프라인 테스트 6개 통과, 헤드리스 Chromium에서 폴더 입력부터 재생·인터랙션·공유 왕복까지 확인했습니다.
- **단, 그 실행은 실제 `remotion` 패키지가 아니라 `shim/`의 대역으로 했습니다.** 작성 환경에서 패키지 설치가 불가능했기 때문입니다. `src/`는 실제 `remotion` / `@remotion/player`를 import하며 대역을 참조하지 않습니다. `pnpm install && pnpm dev`로 한 번 확인한 뒤 `shim/`, `scripts/demo-build.mjs`는 지워도 됩니다.
- `pnpm typecheck`도 같은 이유로 돌리지 못했습니다.
- 메타데이터 파서는 형식에 맞춰 만든 합성 PNG로만 검증했습니다. 실제 VRCX / VRChat 파일로 확인이 필요합니다.
- 웹폰트(Google Fonts)와 wsrv.nl 실제 호출은 네트워크가 막힌 환경이라 확인하지 못했습니다.

## 아직 없는 것

- MP4 내보내기
- 음악 박자에 컷 맞추기 (JIZURA에 비트 감지가 있어 연결 가능)
- 업로드 서버 / 링크 미리보기 카드

## 라이선스 메모

JIZURA는 MIT입니다(`public/JIZURA-LICENSE.txt`). Remotion은 자체 라이선스라 사용 조건을 확인하세요: https://www.remotion.dev/docs/license
