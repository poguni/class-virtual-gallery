# 우리 반 가상 미술관 — 배포 가이드 (Phase 5)

이 폴더는 GitHub Pages에 그대로 업로드하면 바로 서비스되는 **배포용 구조**입니다.

## 1. 폴더 구조

```
(리포지토리 루트)
├── index.html                      ← 메인 앱 (구 Class-Virtual-Gallery_v5.html)
└── assets/
    ├── gallery_background_pc.jpg
    └── gallery_background_mobile.jpg
```

- `index.html`은 코드 안에서 배경 이미지를 `assets/gallery_background_pc.jpg`,
  `assets/gallery_background_mobile.jpg` 상대 경로로 불러옵니다. 따라서 **이 폴더
  구조(같은 폴더에 index.html + assets/) 그대로** 업로드해야 배경이 정상적으로 보입니다.
- GitHub Pages는 저장소에 `index.html`이 있으면 그 파일을 자동으로 첫 화면으로
  서비스하므로, 파일명을 반드시 `index.html`로 유지해 주세요.

## 2. GitHub Pages 배포 절차

1. GitHub에서 새 저장소 생성 (예: `class-gallery`) — Public/Private 아무거나 가능
   (Private이어도 GitHub Pages는 정상 동작합니다. 무료 계정은 Public 권장)
2. 이 폴더(`index.html`, `assets/` 전체)를 저장소 루트에 그대로 업로드
   - GitHub 웹에서 "Add file → Upload files"로 드래그해도 되고,
     기존에 쓰시던 방식대로 `git add . && git commit && git push`도 가능합니다
3. 저장소 **Settings → Pages** 이동
4. "Build and deployment" → Source: **Deploy from a branch** 선택
5. Branch: `main`(또는 `master`), 폴더: `/ (root)` 선택 후 **Save**
6. 1~2분 후 상단에 안내되는 주소로 접속 확인
   - 형태 예시: `https://poguni.github.io/class-gallery/`
   - (기존 학급 어린이회 프로젝트가 `https://poguni.github.io/class-meeting/`인 것과
     동일한 방식입니다)

## 3. 배포 후 QR코드 자동 동작 원리

Phase 5에서 추가된 QR코드는 **별도 URL 설정이 필요 없습니다.**

- 시작 화면(로그인/게스트 입장 이후)에 뜨는 QR코드는 코드에 URL을 하드코딩한 것이
  아니라, 접속한 브라우저의 `window.location`(지금 보고 있는 이 페이지의 실제
  주소)을 그대로 읽어 즉석에서 그려줍니다.
- 즉 배포 주소가 `https://poguni.github.io/class-gallery/`든, 나중에 다른 저장소로
  옮기든, 커스텀 도메인을 연결하든 **코드 수정 없이 항상 정확한 현재 주소**로 QR이
  생성됩니다.
- 교실 TV·전자칠판 등 큰 화면에 시작 화면을 띄워두면, 학부모가 각자 휴대폰으로
  QR을 스캔해 같은 전시장 주소로 바로 들어올 수 있습니다.
- QR 아래 "🔗 링크 복사" 버튼은 QR 스캔이 어려운 경우를 위한 보조 수단으로,
  클립보드에 같은 주소를 복사합니다.
- (참고) CDN에서 QR 라이브러리를 못 불러오는 극히 드문 경우(네트워크 문제 등)에는
  QR 영역이 자동으로 조용히 숨겨지고, 나머지 기능(로그인·관람·관리자 페이지 등)에는
  전혀 영향을 주지 않습니다.

## 4. Supabase 관련 확인 사항

- 코드에 포함된 `SUPABASE_ANON_KEY`는 **RLS(Row Level Security) 정책으로 보호되는
  것을 전제로 공개되어도 되는 키**입니다. Service Role Key는 절대 코드에 넣지
  마세요 (현재 파일에는 포함되어 있지 않습니다).
- 배포 전에 Supabase 대시보드에서 아래를 다시 한번 확인하세요.
  - `exhibitions` / `rooms` / `artworks` / `likes` / `comments` 테이블과 RLS 정책이
    설계대로 적용되어 있는지
  - Storage 버킷이 `public`으로 설정되어 있고, 관리자 페이지에서 사용하는 버킷
    이름과 일치하는지
- Supabase 프로젝트 자체는 GitHub Pages와 별개로 이미 운영 중인 백엔드이므로,
  이번 배포에서 추가로 설정할 것은 없습니다.

## 5. 배포 후 체크리스트

Development Guide v5의 5번(테스트 방법) 항목에 아래 QR 관련 항목을 더해 확인하세요.

1. 관리자 페이지에서 사진 15장 이상 업로드해 전시실 3~4개 이상 생성
2. 로비 왼쪽 문 → 순서대로 관람 → 연결 통로 → 반대쪽 동 → 로비 오른쪽 문으로 복귀
3. 로비 사인에 실제 전시 학년/반이 표시되는지 확인
4. 문틀 떨림 없는지, 방마다 스트라이프 색이 다른지 확인
5. **[신규] 시작 화면에 QR코드가 정상적으로 그려지는지 확인**
6. **[신규] 실제 휴대폰으로 QR코드를 스캔해 같은 전시장 페이지가 열리는지 확인**
   (PC로 접속한 상태에서 QR을 그려도, 스캔은 반드시 다른 기기(휴대폰)로 테스트)
7. **[신규] "🔗 링크 복사" 버튼 클릭 시 클립보드에 정확한 주소가 복사되는지 확인**
8. 작품 8개 이하(전시실 1개)인 경우에도 정상 동작하는지 확인 (하위 호환)

## 6. (선택) 커스텀 도메인을 쓰고 싶다면

`poguni.github.io/class-gallery` 형태가 아니라 별도로 구입한 도메인을 쓰고 싶다면:

1. 저장소 루트에 `CNAME`이라는 이름의 파일을 만들고 그 안에 도메인 한 줄만 작성
   (예: `gallery.우리반.com`)
2. 도메인 등록업체(가비아 등)에서 해당 도메인의 DNS에 GitHub Pages용 A/CNAME
   레코드 추가
3. GitHub 저장소 Settings → Pages에서 커스텀 도메인 등록 후 HTTPS 적용까지 대기

QR코드는 이 경우에도 `window.location` 기반이라 별도 코드 수정 없이 새 도메인
주소로 자동으로 다시 그려집니다.
