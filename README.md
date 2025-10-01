# KNRD · Korea Navy Random Defence

한국 해군을 모티프로 한 싱글 플레이 디펜스 게임 프로토타입입니다. 브라우저에서 canvas 기반으로 함대를 지휘하며 각 시대별로 함선을 업그레이드하고 몰려오는 적을 방어합니다.

## 주요 특징
- **실시간 디펜스 전투**: 마우스 드래그·우클릭으로 유닛을 선택하고 이동 명령을 내릴 수 있습니다.
- **시대·함선 성장 시스템**: 시대 업, 조선소 확장, 함선 강화 등 다양한 성장 루프를 제공합니다.
- **다양한 UI 요소**: 미니맵, 명령 패널, 상태 칩, 오버레이 등으로 게임 상황을 직관적으로 파악할 수 있습니다.
- **esbuild 번들링**: `esbuild`를 사용해 빠른 번들링과 개발용 워치를 지원합니다.

## 요구 사항
- Node.js 18 이상
- npm (또는 호환되는 패키지 매니저)

## 설치 및 실행
1. 의존성 설치
   ```bash
   npm install
   ```
2. 번들 생성
   ```bash
   npm run build
   ```
   `dist/bundle.js`가 생성되며, `index.html`을 정적 서버로 제공하면 됩니다.
3. 개발 모드 (자동 번들)
   ```bash
   npm run build:watch
   ```
   파일 변경 시 자동으로 `dist/bundle.js`를 갱신합니다.
4. 정적 서버 실행 (선택 사항)
   ```bash
   npx serve .
   ```
   또는 선호하는 정적 서버 툴을 사용해 `/index.html`을 열어주세요.

## GitHub Pages 배포
`main` 브랜치에 변경 사항을 push하면 GitHub Actions가 자동으로 빌드하고 `github-pages` 환경으로 배포합니다.

1. GitHub 저장소 설정에서 **Pages** 탭을 열고, **Source**를 "GitHub Actions"로 설정합니다.
2. 이후 push 또는 수동으로 **Run workflow**를 실행하면 `dist/` 번들과 정적 자산(`index.html`, `styles.css`, `assets/`)이 자동으로 업로드됩니다.
3. 배포 URL은 Actions 로그의 `Deploy to GitHub Pages` 단계에서 확인할 수 있습니다.

## 프로젝트 구조
```
knrd/
├─ index.html           # 게임 진입점
├─ src/
│  ├─ main.js           # esbuild 번들 엔트리
│  ├─ game/             # 게임 루프 및 전투 로직
│  ├─ systems/          # 업그레이드, 명령 처리 등의 시스템 모듈
│  ├─ ui/               # UI 구성 요소 및 렌더링 로직
│  ├─ data/             # 적/함선 데이터 정의
│  └─ utils/            # 공용 유틸리티
├─ assets/              # 아이콘, 스프라이트 등 정적 리소스
├─ styles.css           # 전역 스타일시트
└─ dist/                # 빌드 결과물 출력 위치
```

## 추가 안내
- 미구현 메뉴(멀티플레이 등)는 UI에 표시되지만 아직 동작하지 않습니다.
- 전체화면 및 카메라 이동, 단축키 등은 `index.html`과 `src/game` 하위 파일에서 정의된 명령 체계를 따릅니다.
- 버그 제보나 개선 의견은 이슈 트래커를 통해 남겨주세요.
