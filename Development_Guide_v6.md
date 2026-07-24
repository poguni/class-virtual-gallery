# 우리 반 가상 미술관 (Class Virtual Gallery) — 개발 가이드 v6

**작성일** 2026-07-24
**이 문서의 성격** v5 문서(Phase 4: 다중 전시실 & 순환 동선)에 이어, **Phase 5: QR코드 & 배포**
작업 내용을 반영해 통합한 문서입니다. 이후 새 대화창에서는 `Development_Guide_v5.md` 대신
이 문서(v6) 하나만 참고하면 됩니다.

---

## 0. 새 대화창에서 작업을 이어가는 방법

1. 이 문서(`Development_Guide_v6.md`)
2. 현재까지의 프로토타입 파일 `index.html` (구 `Class-Virtual-Gallery.html`)
3. `assets/gallery_background_pc.jpg`, `assets/gallery_background_mobile.jpg`
4. (선택) `가상미술관_PRD.md`, `README.md`(배포 가이드)

> "첨부한 Development_Guide_v6와 index.html을 참고해서 이어서 개발해줘. 다음 작업은 Phase 6(마무리)야."

---

## 1. Phase 5에서 무엇을 했나 (요약)

1. **파일명을 `index.html`로 정리** — GitHub Pages가 저장소 루트의 `index.html`을
   자동으로 첫 화면으로 서비스하므로, 배포용 파일명을 이에 맞춤 (내용은 기존
   `Class-Virtual-Gallery_v5.html`과 동일 + 아래 QR코드 기능 추가)
2. **시작 화면에 QR코드 항상 표시** — 로그인/게스트 입장 후 뜨는 시작 화면
   (`#startScreen`)에 QR코드 박스(`#qrEntryBox`)를 추가. 교실 TV·전자칠판에 시작
   화면을 띄워두면 학부모가 휴대폰으로 QR을 스캔해 같은 전시장 주소로 바로 접속 가능
3. **URL 하드코딩 없음** — QR은 `window.location.origin + pathname`(지금 페이지의
   실제 주소)을 즉석에서 읽어 그리므로, 저장소/도메인이 바뀌어도 코드 수정이 필요 없음
4. **QR 스캔 대안으로 "🔗 링크 복사" 버튼** 추가 (클립보드 복사, 실패 시 `prompt`로 대체 표시)
5. **CDN 로드 실패에 대한 방어 처리** — QR 라이브러리를 못 불러와도 QR 영역만 조용히
   숨겨지고 로그인·관람·관리자 등 핵심 기능에는 영향 없음
6. **배포 가이드(`README.md`) 작성** — GitHub Pages 배포 절차, 폴더 구조, Supabase
   점검 사항, 배포 후 체크리스트, 커스텀 도메인(선택) 안내 포함

---

## 2. 코드 변경 지점 (Phase 4 대비 diff 요약)

### 2.1 라이브러리 추가
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"></script>
```
기존 `three.js`/`nipplejs`와 같은 `cdnjs.cloudflare.com`을 사용해 일관성 유지.

### 2.2 HTML — `#startScreen` 내부
`#guide`(PC/모바일 조작법 안내) 바로 아래에 `#qrEntryBox` 추가:
- `#qrCanvasWrap` — QRCode.js가 실제 QR 이미지를 그려 넣는 컨테이너
- `.qr-caption` — 안내 문구
- `#qrCopyLinkBtn` — 링크 복사 버튼

### 2.3 CSS
`#qrEntryBox`, `.qr-canvas-wrap`, `.qr-caption`, `#qrCopyLinkBtn`에 대한 스타일을
기존 `#guide` 박스와 톤을 맞춰 추가. 시작 화면 콘텐츠가 늘어난 만큼, 화면이 작을 때도
잘리지 않도록 `#authScreen, #startScreen`에 `overflow-y:auto` 추가.

### 2.4 JS — 핵심 함수
- **`renderEntryQR()`** — 스크립트 로드 시 1회 즉시 실행. `location.origin + location.pathname`
  으로 접속 주소를 계산해 QRCode.js로 렌더링. 라이브러리 로드 실패 시 `#qrEntryBox`에
  `.hidden` 클래스를 추가해 조용히 숨김 (throw하지 않고 catch로 흡수)
- **`qrCopyLinkBtn` 클릭 핸들러** — `navigator.clipboard.writeText`로 주소 복사,
  실패 시(예: 구형 브라우저·권한 문제) `window.prompt`로 주소를 보여줘 수동 복사 가능

> QR 생성은 로그인 상태(`showGalleryEntry`)나 화면 전환 함수와 무관하게, 스크립트가
> 로드되는 시점에 한 번만 실행됩니다. 접속 주소는 세션 동안 바뀌지 않으므로 재생성할
> 필요가 없기 때문입니다.

---

## 3. 배포 관련 핵심 정보 (자세한 절차는 `README.md` 참고)

- **폴더 구조**: 저장소 루트에 `index.html` + `assets/`(배경 이미지 2장)만 있으면 됨
- **GitHub Pages 설정**: Settings → Pages → Deploy from a branch → `main` / `root`
- **Supabase**: 기존 프로젝트를 그대로 사용, anon key는 RLS 전제하에 공개돼도 무방
- **QR 주소**: 배포 후 별도 설정 없이 자동으로 실제 배포 주소를 가리킴

---

## 4. 그동안 고친 버그들 (Phase 4까지의 이력 — v5에서 이어짐)

| 증상 | 원인 | 수정 |
|---|---|---|
| 방이 여러 개면 작품이 어둡게 나오고 이름표만 보임 | 방마다 그림자 조명이 있어서, 방 개수가 늘수록 동시에 켜지는 그림자 조명 수가 WebGL 한계를 넘어섬 | `ROOM_LIGHT_GROUPS` + `updateRoomLighting`으로 가까운 방만 조명 활성화 |
| 방과 방 구분이 안 됨 | 같은 톤·같은 폭으로 일직선 연결 | 문틀, 복도 전용 바닥 톤, 복도 보조등, 방별 포인트 컬러 스트라이프 추가 |
| 문틀이 너무 낮음 | `DOOR_H=2.6` | `DOOR_H=4.0`으로 확대 |
| 일직선 동선이라 단조롭고 되돌아오기 번거로움 | 로비→복도→방을 일렬로만 연결 | 로비에 문 2개(A동/B동) + 연결 통로로 ㅁ자 순환 구조 재설계 |
| 특정 전시실에 아예 입장이 안 됨 | `clampPlayerPosition`이 진행 방향(z)까지 좁게 제한해 문 앞에서 튕겨 나옴 | 세그먼트별로 "진행 방향 축"은 자유롭게, "폭 방향 축"만 제한하도록 재작성 |
| 문틀이 심하게 떨림(z-fighting) | 문틀과 벽이 거의 같은 깊이에 겹쳐 렌더링되고, 카메라 far(200)가 너무 커서 깊이 정밀도가 낮음 | `logarithmicDepthBuffer:true`, `camera.far` 200→120, 문틀 두께 0.3→0.4 |
| 연결 통로에서 양옆 전시실 어디로도 못 들어감 | 연결 통로의 앞뒤(z)를 양쪽 다 좁게 제한해서, 전시실로 이어지는 쪽도 막혀버림 | 연결 통로는 막다른 벽 방향만 제한하고 반대쪽(전시실 방향)은 열어둠 + `findSegment`가 통로를 전시실보다 먼저 판정하도록 순서 조정 |
| 이동 중 화면이 느려짐 | 멀리 있는 조명이 꺼져 있어도(밝기 0) 여전히 씬에 남아 매 프레임 계산됨 + 트인 공간(복도/로비)은 그릴 범위가 넓음 | 멀리 있는 조명을 씬에서 실제로 제거(add/remove) + 그림자맵 해상도 축소 |
| 로비 사인에 "5학년 3반"이 항상 고정 표시 | 학년/반이 하드코딩돼 있었음 | 실제 전시(`exhibitions` 테이블)의 grade/class를 불러와 표시하도록 변경 |

---

## 5. 지금 이 파일로 바로 테스트하는 방법

`README.md`의 "5. 배포 후 체크리스트" 참고 (QR/링크 복사 테스트 항목 포함).

---

## 6. 다음 단계 로드맵

**Phase 1~5 (완료)** — 전시 자동 생성 · 1인칭 관람 · 좋아요/댓글 · 관리자 페이지 ·
다중 전시실 & 순환 동선 · QR코드 & 배포

**Phase 6 — 마무리 (다음 작업 후보)**
- 모바일 UX 다듬기
- 성능 옵션 (예: 벽처럼 움직이지 않는 조각들을 하나로 합치는 지오메트리 병합 — 방이 아주 많아질 경우를 대비)
- 부적절어 필터
- 실사용 피드백 반영
