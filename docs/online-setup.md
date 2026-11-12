# Supabase 온라인 연결

코드는 준비되어 있지만 `js/online-config.js`의 설정은 비어 있습니다. 프로젝트를 연결하기 전에는 기존 스테이지와 무한 연습 모드를 사용할 수 있습니다. 이 안내는 `jinw2540/crowd-runner` 배포를 기준으로 합니다.

## 1. 데이터베이스

새 Supabase 프로젝트의 SQL Editor에서 `supabase/migrations/202611120001_online.sql` 전체를 실행합니다. `docs/supabase.sql`도 같은 내용입니다. 둘 중 하나만 실행하면 됩니다. 기존 PR #1의 테이블이 있는 프로젝트에도 적용할 수 있으며 기존 진행도와 닉네임을 유지합니다.

CLI로 마이그레이션을 관리하는 프로젝트는 저장소 루트에서 `supabase link --project-ref YOUR_PROJECT_REF`, `supabase db push`를 사용합니다. SQL Editor로 먼저 적용했다면 CLI 이력도 맞춘 뒤 후속 마이그레이션을 적용하세요.

## 2. 로그인

- Authentication에서 Anonymous Sign-Ins를 켭니다. 랭킹 도전을 누른 사람에게만 게스트 계정이 만들어집니다.
- Google 공급자를 설정합니다. Google Cloud에 웹 OAuth 클라이언트를 만들고, Supabase 화면에 표시되는 `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`을 승인된 리디렉션 URI에 등록합니다. 클라이언트 ID와 비밀 값은 Supabase 공급자 설정에 입력합니다.
- Supabase의 Site URL을 `https://jinw2540.github.io/crowd-runner/`로 설정합니다. Redirect URLs에 같은 주소와 `https://jinw2540.github.io/crowd-runner/index.html`을 추가합니다. 다른 호스팅을 사용하면 실제 주소로 바꿉니다.
- 로컬 개발 주소도 Redirect URLs에 추가합니다. 예: 저장소 루트에서 `python3 -m http.server 8765 --bind 127.0.0.1`로 실행할 때 `http://127.0.0.1:8765/`, `http://127.0.0.1:8765/index.html`.
- **Manual Linking을 켭니다.** 게스트 상태에서 구글 로그인을 누르면 `linkIdentity`로 같은 사용자 ID에 연결해 랭킹 기록을 유지합니다. 이미 다른 계정에 연결된 Google 계정과의 기록 병합은 구현하지 않았습니다. 이 경우 게스트에서 로그아웃한 뒤 기존 계정으로 로그인할 수 있으며 두 계정의 기록은 별개입니다.

공급자 설정은 [Google 로그인 문서](https://supabase.com/docs/guides/auth/social-sign-in/auth-google), 계정 연결은 [Identity Linking 문서](https://supabase.com/docs/guides/auth/auth-identity-linking)를 참고하세요. 익명 계정은 브라우저 데이터를 지우면 접근을 잃을 수 있습니다.

## 3. 검증 함수 배포

Supabase CLI가 설치된 환경에서 저장소 루트를 사용합니다.

```sh
supabase login
supabase link --project-ref YOUR_PROJECT_REF
supabase secrets set ALLOWED_ORIGINS=https://jinw2540.github.io,http://127.0.0.1:8765
supabase functions deploy endless
```

`ALLOWED_ORIGINS`에는 경로·마지막 슬래시 없이 허용할 origin만 쉼표로 구분합니다. 운영에서는 쓰지 않는 로컬 origin을 제거할 수 있습니다. 함수 이름은 `endless`를 유지합니다. 배포할 때 `shared/`도 함께 있어야 합니다. 함수가 공통 시뮬레이션을 상대 경로로 불러옵니다.

`supabase/config.toml`의 `verify_jwt=false`는 함수 내부 인증을 사용하기 위한 설정입니다. 함수는 Authorization 토큰을 Supabase Auth `/auth/v1/user`에 보내 검증하고, 확인된 사용자에게만 판 생성·입력·종료를 허용합니다. 순위표만 로그인 없이 읽을 수 있습니다.

서버는 호스팅 환경의 `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`를 사용합니다. 관리자 키는 서버 환경에만 있어야 합니다. 브라우저 설정에는 공개 키만 넣습니다. [배포](https://supabase.com/docs/guides/functions/deploy)와 [서버 환경 변수](https://supabase.com/docs/guides/functions/secrets) 문서를 참고하세요.

## 4. 게임 설정

`js/online-config.js`를 수정한 뒤 정적 사이트를 배포합니다.

```js
window.CROWD_ONLINE = Object.freeze({
  url: 'https://YOUR_PROJECT_REF.supabase.co',
  publicKey: 'YOUR_PUBLISHABLE_OR_ANON_KEY',
  functionName: 'endless'
});
```

공개 URL과 publishable/anon 키는 웹 앱 설정입니다. `service_role`, secret 키, Google 클라이언트 비밀 값은 이 파일에 넣지 않습니다. 비어 있으면 온라인 버튼은 준비 중 상태가 되고 연습은 계속 작동합니다.

## 5. 실제 프로젝트 연결 후 확인

1. 두 브라우저에서 닉네임을 다르게 정하고 랭킹 도전을 합니다.
2. 일시정지 → 여기까지 기록하기를 눌러 `기록 등록 완료`를 확인합니다.
3. 양쪽 순위표에 같은 기록과 서로 다른 내 순위가 표시되는지 확인합니다.
4. 더 낮은 기록을 등록해도 일일 최고 기록이 유지되는지 확인합니다.
5. Google 로그인·로그아웃, 다른 기기에서 진행도 복원, 게스트의 Google 연결을 확인합니다.
6. 네트워크를 잠시 끊었다 복구해 재전송과 종료 등록을 확인합니다. 10분을 넘긴 판은 연습으로 전환됩니다.

이 저장소에서는 공통 규칙, 실제 SQL, 서버 처리 코드와 로컬 두 계정의 등록 흐름을 검증합니다. 실제 Google OAuth, Supabase 배포, 실제 모바일 기기와 서비스 부하는 별도 확인이 필요합니다.

## 운영

- 하루는 한국 시간 기준입니다. 자정을 넘어도 시작한 날짜에 기록됩니다.
- 새 판은 계정당 분당 6회까지입니다. 한 계정이 새 판을 시작하면 이전의 진행 중 판은 중단됩니다.
- 최대 300틱(5초)의 입력을 한 묶음으로 검증합니다. 미확인 입력은 최대 36,000틱, 마지막 확인 이후 대기는 최대 10분입니다. 페이지를 닫거나 새로고침한 판을 이어 하는 기능은 없습니다.
- 요청은 10KB까지, 입력은 정수 목표 위치 ±4,400mm까지입니다. 이동 속도는 서버가 제한하며 클라이언트가 보내는 점수는 사용하지 않습니다. 시작 이후 실제 시간보다 1.5초 이상 빠른 진행은 재시도 대상으로 거절합니다.
- `profiles`와 탐험 진행도는 본인만 읽고 변경합니다. 공개 순위표는 닉네임·순위·점수/거리 또는 스테이지/별만 내보냅니다. 무한 기록 테이블과 저장 함수는 서버 역할만 접근할 수 있습니다. 탐험 랭킹은 PR의 범위 검증 방식이며 무한 랭킹처럼 입력을 재계산하지 않습니다.
- 게임 DB에는 사용자 ID·닉네임·진행도·입력 묶음·검증 상태·최고 기록이 저장됩니다. Google 로그인 정보는 Supabase Auth에서 처리하며 이메일·이름·사진 등 공급자 메타데이터가 저장될 수 있습니다. 게임 공개 순위표에는 이 정보가 나오지 않습니다.
- 입력 로그 보관은 **종료/중단 후 30일**입니다. 운영자가 Supabase Cron에 하루 한 번 `select public.endless_prune_history();`를 등록하면 만료 판을 중단 처리하고 오래된 입력과 최고 기록이 아닌 판을 정리합니다. 일일 최고 기록 및 해당 판의 최종 검증 상태는 보존합니다. 이 함수는 설치만으로 자동 실행되지 않습니다.
- 밸런스 변경에는 새 `RULES.version`을 사용합니다. 현재 함수는 활성 버전 하나를 검증합니다. 버전 교체 전 신규 시작을 잠시 끄고 진행 중 판의 종료 시간을 둡니다. 과거 버전 지원과 시즌 UI는 후속 범위입니다.
- 봇의 합법적인 입력 생성까지 차단하지는 않습니다. 공개 규모를 늘리기 전에 익명 가입 제한, 서버 호출 수·비용, 검증 실패율, 프레임 성능을 측정합니다.
