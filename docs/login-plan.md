# 로그인 추가 계획서

## 0. 현재 구조와 정해진 방향

- **현재 구조:** 빌드 과정이 없는 정적 사이트(GitHub Pages)이고, 스크립트는 모듈 없이 일반 스크립트로 불러온다. 진행 상황은 `js/core.js`의 `Save` 객체가 localStorage(`mungchyeo-run-v1`)에 저장한다.
- **정해진 방향:**
  - 백엔드: Supabase
  - 로그인: 구글
  - 게스트 플레이 허용 (로그인하지 않아도 지금처럼 플레이)
  - 기기 간 진행은 자동으로 합치기
  - 전체 랭킹 (도달 스테이지 → 총 별 수 순), 직접 정한 닉네임 표시
  - 조작 방지는 서버의 기본 검증
- **유지하는 원칙:** 빌드 단계는 계속 없다. 서버에 연결되지 않아도 게임은 지금처럼 동작해야 한다.

## 1단계: Supabase와 구글 준비 (코드 작업 없음)

1. Supabase 프로젝트를 만들고 Project URL과 **anon key**를 받아 둔다. anon key는 브라우저에 공개돼도 되는 키다. **service_role key는 절대 코드에 넣지 않는다.**
2. Google Cloud Console에서 OAuth 클라이언트(웹)를 만든다. 승인된 리디렉션 URI에는 Supabase가 알려주는 콜백 주소를 넣는다.
3. Supabase에서 Auth → Providers → Google을 켜고 클라이언트 ID와 시크릿을 입력한다.
4. Auth → URL Configuration에 다음 주소를 등록한다.
   - Site URL: `https://elielieli-kim.github.io/crowd-runner/`
   - 리디렉션 허용 목록: 위 주소, 로컬 테스트용 `http://localhost:8000`
5. 구글 OAuth 리디렉션은 `file://`에서 동작하지 않는다. 로컬 테스트는 `python3 -m http.server 8000`처럼 간단한 서버를 띄워서 연다. 이 내용을 README에 적는다.

## 2단계: 데이터베이스 (SQL Editor에서 실행)

### `profiles` 테이블

| 열 | 내용 |
|---|---|
| `id` | uuid, PK, `auth.users` 참조 |
| `nickname` | text, unique, 2~12자 check 조건 |
| `created_at` | 생성 시각 |

### `progress` 테이블 (사용자당 한 줄)

| 열 | 내용 |
|---|---|
| `user_id` | PK, `auth.users` 참조 |
| `level`, `coins`, `up_start`, `up_income` | int |
| `stars`, `best` | jsonb (스테이지 번호 → 값) |
| `total_stars` | int, 서버가 계산 |
| `updated_at` | 마지막 저장 시각 |

### `leaderboard` 뷰

- `profiles`와 `progress`를 조인해 `level desc, total_stars desc, updated_at asc` 순으로 정렬한다.
- 상위 100명만 보여준다.

### RLS(행 수준 보안)

- 모든 테이블에서 RLS를 켠다.
- `progress`는 본인 것만 읽을 수 있다(`auth.uid() = user_id`). insert/update 정책은 열지 않는다.
- `profiles`는 누구나 읽을 수 있고 수정은 본인만 할 수 있다.

### 기본 검증: `save_progress(new jsonb, merge boolean)` RPC 함수

클라이언트는 `progress`에 직접 쓰지 않고 이 함수만 호출한다(security definer). 함수 안에서 확인하는 규칙:

- `level`은 기존 값 +1까지만 늘어날 수 있다. 로그인 직후 합치기(`merge = true`, 계정당 첫 동기화)는 예외로 한다.
- 스테이지별 별은 0~3개이고 `level` 미만 스테이지에만 붙을 수 있다.
- `up_start`는 30 이하이다.
- 코인은 0 이상이고 레벨에 비례하는 상한을 넘지 않는다.
- 규칙을 위반한 요청은 거부하고 `flagged` 테이블에 로그를 남긴다. 관리자는 Supabase 대시보드에서 확인하고 지운다.
- `total_stars`는 서버가 직접 계산한다.

## 3단계: 클라이언트 코드

### 새 파일 `js/account.js` (`core.js` 다음에 불러옴)

- `index.html`에 Supabase를 CDN으로 불러온다: `@supabase/supabase-js@2`의 UMD 빌드, 정확한 버전으로 고정.
- `Account` 객체가 맡는 일:
  - `init()`: 세션을 복원하고 `onAuthStateChange`를 구독한다.
  - `signIn()`: `signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin + location.pathname } })`
  - `signOut()`
  - `pull()`: 서버 진행을 가져와 로컬과 합친다.
  - `push()`: 2초 디바운스 후 `save_progress`를 호출한다.
- Supabase 스크립트를 불러오지 못하면 `Account`는 아무 일도 하지 않고, 게임은 게스트 모드로 계속 동작한다.

### `js/core.js`의 `Save` 수정

- `store()` 끝에서 `Account.push()`를 호출한다. `finish()`(`js/game.js`)와 업그레이드 구매(`js/main.js`)가 모두 `Save.store()`를 거치므로 훅은 이 한 곳이면 된다.
- `Save.merge(remote)`를 추가한다. 규칙:
  - `level`, `upStart`, `upIncome`: 큰 값
  - `stars[n]`, `best[n]`: 스테이지별로 큰 값
  - `coins`: 큰 값 (합산하지 않음, 합치기로 코인이 불어나지 않게)

### 로그인 흐름

1. 로그인이 끝나면 `pull()`을 실행한다.
2. 로컬 진행과 합친 결과를 저장하고 `push()`한다. 이 첫 push는 `merge = true`로 보내 레벨 +1 제한을 받지 않게 한다.
3. `refreshUI()`로 화면을 갱신한다.

### 닉네임

- 첫 로그인 때 `profiles` 행이 없으면 닉네임 입력 카드를 띄운다.
- 중복이면 unique 오류가 나므로 "이미 쓰는 닉네임이에요"라고 알려준다.

## 4단계: 화면 (`index.html`, `style.css`, `js/main.js`)

- **메뉴 `dock-head`:** 게스트면 "구글로 로그인" 버튼, 로그인 상태면 닉네임 칩과 로그아웃 버튼.
- **`go-row`:** "랭킹" 버튼 추가.
- **새 `<section id="ranking">`:** 지도 화면처럼 돌아가기 버튼, 순위·닉네임·스테이지·별 목록, 맨 아래 내 순위 고정. 게스트에게는 "로그인하면 랭킹에 올라가요" 안내.
- **새 닉네임 입력 카드:** `result` 카드와 같은 스타일.
- 닉네임은 반드시 `textContent`로만 넣는다. `innerHTML`은 XSS 위험이 있다.
- 테스트용으로 `window.__game`에 `account` 상태를 노출한다.

## 5단계: 테스트 체크리스트

- [ ] 게스트로 플레이 → 로그인 → 진행이 그대로 남는다
- [ ] 기기 A 5스테이지, 기기 B 게스트 8스테이지 → B에서 로그인하면 8스테이지가 되고 별이 합쳐진다
- [ ] 콘솔에서 `Save.data.level = 999; Save.store()`를 실행하면 서버가 거부한다
- [ ] 다른 사람의 `progress`를 고치려 하면 RLS가 막는다
- [ ] 중복 닉네임과 13자 이상 닉네임이 거부된다
- [ ] 오프라인이나 Supabase 장애 때도 게임이 정상 동작한다
- [ ] 휴대폰(iOS Safari)에서 구글 로그인 리디렉션이 끝까지 된다

## 6단계: 배포와 문서

- `main` 브랜치에 반영해 GitHub Pages에 배포한다.
- README에 로그인·랭킹 설명, 로컬 테스트는 `http.server`로 해야 한다는 점, Supabase 설정 방법을 추가한다.
- 개인정보 안내: 저장하는 정보는 구글 계정 식별자와 닉네임뿐이라는 한 줄을 넣는다.

## 작업 순서와 분량

1·2단계는 대시보드와 SQL 작업으로 반나절 정도. 3·4단계는 새 파일 하나와 기존 파일 4개(`index.html`, `style.css`, `js/core.js`, `js/main.js`)를 조금씩 고치는 수준이다.
