# KNRD · Korea Navy Random Defence

한국 해군을 모티프로 한 싱글 플레이 디펜스 게임입니다. 브라우저에서 canvas 기반으로 함대를 지휘하며 각 시대별로 함선을 업그레이드하고 몰려오는 적을 방어합니다.

<img width="960" height="540" alt="Image" src="https://github.com/user-attachments/assets/26a6b7bd-d0cc-41ae-82b2-b095b1afbb6a" />

[게임 플레이 바로가기](https://sigee-min.github.io/knrd/)

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
3. 개발 서버 (자동 번들 + 정적 서버)
   ```bash
   npm run dev
   ```
   브라우저에서 `http://localhost:5173/index.html`로 접속하세요. (CORS 에러 방지)

4. 개발 모드 (자동 번들)
   ```bash
   npm run build:watch
   ```
   파일 변경 시 자동으로 `dist/bundle.js`를 갱신합니다.
5. 정적 서버 실행 (선택 사항)
   ```bash
   npx serve .
   ```
   또는 선호하는 정적 서버 툴을 사용해 `/index.html`을 열어주세요.

## 블로그 · 외부 페이지에 임베드
게임을 별도의 페이지에 호스팅한 뒤, 블로그 글 등에 간단한 스크립트 한 줄로 삽입할 수 있습니다.

1. `index.html`, `styles.css`, `dist/bundle.js`, `assets/`를 정적 호스팅(예: GitHub Pages)으로 배포합니다. 예시 URL: `https://sigee-min.github.io/knrd/`
2. 글 본문에 다음 스니펫을 넣습니다.

```html
<script src="https://sigee-min.github.io/knrd/embed.js"
        data-game-src="https://sigee-min.github.io/knrd/"
        data-width="100%"
        data-max-width="960px"
        data-aspect="16/9"
        defer></script>
```

- `data-game-src`: 실제 게임이 배포된 URL (`index.html` 경로).
- `data-width`, `data-max-width`: 임베드 영역 너비 조정(기본값 `100%`, `960px`).
- `data-aspect`: 가로세로 비율 (`16/9` 기본).
- `data-center="false"`, `data-background`, `data-shadow`, `data-allow-fullscreen="false"` 등 속성으로 세부 스타일을 조정할 수 있습니다.

스크립트는 자동으로 반응형 컨테이너와 `iframe`을 생성하므로, 별도의 CSS 없이도 게임이 바로 표시됩니다.

### iframe 단독 버전
스크립트를 쓰기 힘든 환경이라면 `iframe` HTML만으로도 임베드할 수 있습니다.

```html
<div style="max-width:960px;margin:0 auto;aspect-ratio:16/9;">
  <iframe src="https://sigee-min.github.io/knrd/"
          style="width:100%;height:100%;border:0;box-shadow:0 16px 32px rgba(0,0,0,0.35);"
          loading="lazy"
          allowfullscreen></iframe>
</div>
```
