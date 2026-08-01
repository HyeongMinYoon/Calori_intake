# INTAKE LOG

음식 사진 한 장으로 칼로리와 탄수화물·단백질·지방을 기록하는 섭취 로그.
신체 정보와 목적(감량/유지/린매스업/벌크업)에서 하루 목표를 계산하고, 남은 양에
맞는 다음 끼니를 추천한다.

**휴대폰 앱(PWA)으로 동작한다.** 홈 화면에 추가하면 주소창 없이 전체 화면으로
뜨고, 비행기 모드에서도 기록 조회·직접 입력이 된다. 앱스토어 심사나 별도 빌드가
필요 없고, `git push` 하면 설치된 폰까지 업데이트가 전달된다.

---

## 폰에 설치하기

먼저 아래 "배포"를 한 번 끝내면 `https://<사용자명>.github.io/Calori_intake/`
주소가 생긴다. 그 주소를 폰 브라우저로 연 뒤:

| 기기 | 방법 |
| --- | --- |
| iPhone / iPad | **Safari**로 열고 → 공유 버튼 → `홈 화면에 추가` |
| Android | Chrome으로 열고 → 메뉴(⋮) → `앱 설치` 또는 `홈 화면에 추가` |

iOS는 Safari에서만 설치된다(Chrome·Firefox에서는 안 된다).

설치하면 미리보기용 기기 프레임이 자동으로 사라지고 화면 전체를 쓴다.

---

## 배포 (GitHub Pages)

푸시하면 `.github/workflows/deploy-pages.yml`이 저장소 내용을 그대로 올린다.
빌드 단계는 없다. 최초 1회만 설정이 필요하다.

1. GitHub 저장소 → **Settings** → **Pages**
2. **Source** 를 `GitHub Actions` 로 변경
3. `main` 브랜치에 푸시 → Actions 탭에서 배포 완료 확인

이후로는 `git push` 만 하면 된다. 설치된 폰에서는 다음 실행 때 "새 버전이 있다"
배너가 뜨고, 눌러야 교체된다 — 기록을 입력하는 중에 화면이 갈아엎히지 않는다.

### 로컬에서 확인

서비스 워커는 `https` 또는 `localhost` 에서만 동작하므로 파일을 더블클릭해서
열면(`file://`) 오프라인 기능이 빠진다. 간단한 정적 서버를 쓸 것:

```sh
python3 -m http.server 8765
# http://localhost:8765/
```

---

## API 키

사진 분석과 메뉴 추천은 Anthropic API(`claude-sonnet-4-6`)를 브라우저에서 직접
호출한다. 설치형 앱으로 쓰려면 **설정 → Anthropic API 키** 에 본인 키
(`sk-ant-...`)를 넣어야 한다.

- 키는 이 기기의 저장소에만 남고, 서버로 전송되지 않는다.
- 키 없이도 **직접 입력**, 기록 조회, 캘린더, 목표 계산은 모두 동작한다.
- 키는 [console.anthropic.com](https://console.anthropic.com) 에서 발급한다.
- 브라우저에서 직접 호출하므로 `anthropic-dangerous-direct-browser-access`
  헤더를 쓴다. 본인 기기에서 본인 키를 쓰는 개인용 구조이며, 여러 사람이 쓰는
  서비스로 확장할 계획이면 키를 서버 쪽으로 옮겨야 한다.

---

## 데이터

기록은 브라우저 `localStorage`에 월 단위(`intake:YYYY-MM`)로 저장된다.
서버도 계정도 없다. 즉:

- 기기 간 동기화가 되지 않는다.
- 브라우저 데이터를 지우거나 앱을 삭제하면 기록도 사라진다.

동기화나 백업이 필요해지면 내보내기/가져오기부터 붙이는 게 순서다.

---

## 구조

```
index.html                  화면 마크업 + PWA 메타
manifest.webmanifest        앱 이름·아이콘·표시 모드
sw.js                       서비스 워커 (오프라인 캐시, 업데이트)
assets/
  css/app.css               디자인 스타일 전부
  fonts/                    Archivo + IBM Plex Mono (latin, 자체 호스팅)
  icons/                    홈 화면 아이콘 (180/192/512 + maskable)
  js/
    store.js                상태, 목표 계산, localStorage
    api.js                  Anthropic API 호출 (분석·추천)
    render.js               카드별 렌더링
    app.js                  이벤트, 부팅, 서비스 워커 등록
tools/
  build-fonts.py            폰트 재다운로드·갱신
  build-icons.py            아이콘 PNG 재생성 (헤드리스 Chromium)
.github/workflows/          Pages 배포
```

`assets/js/*` 는 모듈이 아니라 순서대로 로드되는 일반 스크립트다.
`index.html` 의 `<script>` 순서를 바꾸면 깨진다.

폰트는 원래 Google Fonts에서 `@import` 하던 것을 자체 호스팅으로 바꿨다.
오프라인에서 타이포그래피가 깨지지 않게 하기 위한 것이고, latin 서브셋만
포함한다(두 서체 모두 한글 글리프가 없어 한글은 어차피 시스템 폰트로 떨어진다).

---

## 앞으로

- **내보내기 / 가져오기** — 기기 교체나 백업 대비. 지금 구조에서 가장 아쉬운 부분.
- **앱스토어 배포가 필요하면 Capacitor** — 지금 코드를 그대로 두고 네이티브로
  감쌀 수 있다. Xcode / Android Studio가 필요해진다.
- **주간·월간 통계** — 캘린더에 이미 월 평균이 있으니 확장 여지가 있다.
