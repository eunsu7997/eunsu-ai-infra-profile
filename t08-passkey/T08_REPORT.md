# T08 — 내 소개 페이지에 패스키 달기 (비밀번호 없이 나만 들어가기)

> ✏️ 표시가 있는 곳은 **실제 기기로 확인한 뒤 은수가 직접 채우거나 고칠 부분**입니다.

## 제출 주소

- 공개 결과물 URL: `https://✏️<Render 주소>.onrender.com/` — 첫 화면은 1번 소개 페이지 그대로이고, 맨 아래 "🔒 나만 보는 자리"만 패스키로 잠겨 있습니다.
- 소스 URL: `https://github.com/eunsu7997/eunsu-ai-infra-profile/tree/main/t08-passkey`
- 두 주소 모두 계정 생성, 로그인, 비밀번호, OAuth, CAPTCHA 없이 시크릿 창에서 열립니다. 심사하는 사람은 공개 소개 페이지까지만 보면 되고, 잠긴 자리를 열 필요는 없습니다.
- 비공개 자리에 넣은 내용은 전부 **만들어 넣은 예시**입니다. 실제 연락처, 신분증 번호 같은 개인정보와 비밀번호는 제출물 어디에도 없습니다(C12).

---

## 인증 구현 설명서 (6항목)

### ① 무엇으로 붙였나

- **직접 구현**했습니다. 외부 패키지는 0개이고, Node.js 내장 `http`와 `crypto`만 썼습니다.
  - 서버 검증: `lib/webauthn.js`. clientDataJSON 확인, authenticatorData 파싱, COSE 공개키를 JWK로 바꾸기, ES256·EdDSA·RS256 서명 검증, 서명 카운터 확인을 합니다.
  - CBOR 해석: `lib/cbor.js`. WebAuthn에 필요한 만큼만 구현한 최소 디코더입니다.
  - 브라우저: 표준 Web Authentication API(`navigator.credentials.create/get`)를 직접 호출합니다(`public/webauthn-client.js`).
- 라이브러리나 인증 서비스(SimpleWebAuthn, Auth0 등)는 쓰지 않았습니다.

### ② 왜 그걸 골랐나

- 원래 계획은 검증된 라이브러리(SimpleWebAuthn)였습니다. 그런데 작업 환경에서 npm 레지스트리 접속이 막혀 패키지를 설치할 수 없었습니다.
- 그래서 범위를 "attestation `none` 등록 + 로그인 서명 검증"으로 좁혀 표준대로 직접 구현했습니다. 대신 Chromium 가상 인증기로 30개 항목을 자동 확인해서, 직접 짠 코드가 맞는지 검증했습니다.
- 1번 페이지는 GitHub Pages(정적 호스팅)에 있어 서버가 401/403을 낼 수 없습니다. 그래서 1번 페이지 파일을 그대로 서버의 `/`로 옮기고, 같은 출처에서 API를 제공하게 했습니다. 이렇게 하면 쿠키와 rpID 문제도 생기지 않습니다.
- 세션은 JWT 대신 **서버 메모리 세션**으로 했습니다. 로그아웃할 때 서버에서 지울 수 있어야 같은 값을 다시 보냈을 때 401이 나오기 때문입니다(C33).

### ③ 어디를 어떻게 고쳤나 (네 흐름의 소스 위치)

| 흐름 | 지나는 소스 |
|---|---|
| **등록** | `public/vault.js`(첫 패스키) · `public/passkeys.js`(추가) → `webauthn-client.js` `register()` → `server.js:177` `POST /api/register/options`(challenge 생성, 세션에 5분 보관) → `server.js:208` `POST /api/register/verify` → `lib/webauthn.js:109` `verifyRegistration()` → `lib/store.js` `passkeys.add()`(공개키 저장). 취소는 `server.js:239` |
| **로그인** | `vault.js` → `webauthn-client.js` `login()` → `server.js:247` `POST /api/login/options` → `server.js:258` `POST /api/login/verify` → `server.js:135` `takePending()`(challenge를 꺼내며 삭제, 사용 기록) → `lib/webauthn.js:150` `verifyAuthentication()`(서명은 `:162`, 카운터는 `:167`) → `server.js:282` 세션 ID 새로 발급 |
| **로그아웃** | `vault.js` 로그아웃 버튼 → `server.js:288` `POST /api/logout` → `server.js:74` `destroySession()`(서버 메모리에서 세션 삭제 + 쿠키 만료) |
| **비공개 자료 조회** | `vault.js` `refresh()` → `server.js:296` `GET /api/private`(세션 사용자 자료만, 주소의 `user` 값은 무시) · `server.js:329` `GET /api/private/:account`(남의 계정이면 **403**, `:336`) · `server.js:342` 패스키 삭제(남의 패스키면 403 `:350`, 마지막 패스키면 409 `:354`) |

- 1번 페이지에서 바꾼 것: `public/index.html`에 `#vault` 섹션, 메뉴 링크, 푸터 문구를 추가하고, `t08.css`·`webauthn-client.js`·`vault.js`를 연결했습니다. 1번의 공개 내용과 `style.css`·`script.js`는 그대로입니다(C11).
- **실제로 고친 결함 2건**
  1. 로그인이 늘 401로 실패했습니다. 원인은 userHandle(base64url 문자열)을 디코딩한 바이트와 비교한 것이었고, 같은 base64url 문자열끼리 비교하도록 고쳤습니다.
  2. 로그인 전에도 비공개 카드가 보였습니다. `.vault-card{display:grid}`가 `hidden` 속성을 덮어쓴 탓이라 `[hidden]{display:none !important}`를 추가했습니다. 지금도 내용은 서버가 보내지 않으니 빈 카드였지만, C15를 어기는 결함이었습니다.

### ④ 안 열리는 것을 확인한 기록

전체 요청과 응답은 `evidence/E2E_LOG.md`에 있습니다(자동 확인 **30/30 통과**). 핵심만 나란히 적으면 다음과 같습니다.

| 확인 | 통과한 요청 | 거절된 요청 |
|---|---|---|
| 로그인 없이 열기 | 로그인 후 `GET /api/private` → **200** (demo-a 자료 3건) | 쿠키 없이 `GET /api/private` → **401** `login_required`. 받은 HTML·JS 소스에 비공개 문구 0건 |
| 남의 패스키로 열기 | demo-a 세션 `GET /api/private?user=demo-b` → **200**인데 `owner: demo-a`(내 자료만) | demo-a 세션 `GET /api/private/demo-b` → **403**, 반대 방향 demo-b → demo-a도 **403**. 거절 앞뒤 자료 건수는 3건 → 3건으로 같음 |
| 이미 쓴 질문 재사용 | 새 challenge로 `POST /api/login/verify` → **200** | 같은 본문을 한 번 더 보냄 → **400** `challenge_already_used` / 틀린 서명 → **401** `signature_invalid` |
| 패스키 삭제 뒤 로그인 | 남은 패스키(A-휴대폰)로 로그인 → **200** | 지운 패스키(A-노트북)로 로그인 → **401** `unknown_credential` |

- 그 밖의 거절 기록
  - 로그아웃 후 같은 세션 값으로 요청 → **401**
  - 로그인 없이 이미 패스키가 있는 계정에 패스키를 붙이려는 시도 → **403**
  - 남의 패스키 삭제 → **403**
  - 마지막 패스키 삭제 → **409**
- ✏️ 배포 주소에서 실제 기기(Windows Hello, 휴대폰)로 한 번 더 해 보고, 화면 캡처를 `evidence/screenshots/`에 추가하세요.

### ⑤ AI와 나

- AI에게 맡긴 일: ✏️ 예) 과제 화면을 읽고 계획 세우기, 서버·WebAuthn 검증 코드 작성, 가상 인증기 자동 테스트와 증거 기록 만들기
- 내가 직접 판단한 일: ✏️ 예) 1번 페이지를 GitHub Pages가 아니라 서버로 옮겨 붙이기로 결정, 비공개 자리에 넣을 내용 선정, 실제 기기에서 패스키 2개(어느 기기·어느 저장 위치)를 등록하고 확인
- AI 말을 따르지 않은 일: ✏️ 실제로 거절한 제안을 적거나, 없었다면 "없었다 — 이유: …"로 적기

### ⑥ 아직 못 막은 것

1. **로그인·등록 요청 횟수 제한이 없습니다.** 서명 없이는 통과할 수 없지만, 같은 주소로 요청을 계속 보내 서버를 바쁘게 만드는 것은 막지 못합니다.
2. **첫 패스키 창구가 열려 있는 동안**(`ALLOW_FIRST_PASSKEY=true`)에는 아직 패스키가 없는 데모 계정을 다른 사람이 먼저 차지할 수 있습니다. 두 계정에 패스키를 만든 뒤 `false`로 닫아야 합니다.
3. **세션이 서버 메모리에 있습니다.** 서버가 재시작하면 모두 로그아웃되고, 서버를 여러 대로 늘리면 세션을 공유하지 못합니다.
4. **attestation을 검증하지 않습니다**(`none`). 어떤 제조사의 인증기인지는 확인하지 않습니다.
5. **기기를 모두 잃으면 복구 수단이 없습니다.** 복구 코드나 이메일 복구가 없습니다. 지금은 마지막 패스키 삭제를 막는 것까지만 했습니다.
6. 무료 호스팅이 재시작하면 저장 파일이 사라질 수 있어 `SEED_PASSKEYS` 환경변수로 공개키를 되살리는 기능을 넣었습니다. 그런데 **지운 패스키가 환경변수에 남아 있으면 재시작 뒤 되살아납니다.**

---

## 짧은 확인 방법 4줄

- **어디로 가나요:** ✏️ 공개 결과물 URL(`https://<Render 주소>.onrender.com/`)
- **무엇을 하나요(3단계 이내):** 1) 시크릿 창으로 연다 2) 맨 아래 "🔒 나만 보는 자리"까지 내린다 3) 같은 주소 뒤에 `/api/private`를 붙여 연다
- **무엇이 보이면 통과인가요:** 위쪽은 1번 소개 내용이 그대로 보이고, 아래는 "🔒 잠겨 있음"과 패스키 버튼만 보입니다. `/api/private`는 `401 login_required`입니다.
- **안 될 때:** 첫 접속이 30초쯤 걸리면 무료 서버가 깨어나는 중이니 새로고침합니다. 패스키 창이 안 뜨면 주소가 https인지, 최신 Chrome·Edge인지 확인합니다.

## AI와 내 판단 3줄

- AI에게 맡긴 일: ✏️
- 내가 직접 판단한 일: ✏️
- AI 말을 따르지 않은 일: ✏️ (없었다면 왜 없었는지)

---

## 카드별 근거 위치

- **C19·C21·C22·C23·C24** (등록): `E2E_LOG.md` "카드 2". 저장된 값은 COSE 공개키이고, 등록 요청 본문에는 `clientDataJSON`·`attestationObject`·`transports`만 있습니다. 개인키는 서버로 오지 않습니다.
- **C20·C28** (challenge가 매번 다름): `E2E_LOG.md` "이미 쓴 질문 재사용" 아래에 challenge 4개의 앞 16자를 적어 두었습니다.
- **C26** (패스키 저장 위치): ✏️ 실제 등록 후 적기. 예) "A-노트북 = Windows Hello(이 PC에 묶임), A-휴대폰 = 구글 비밀번호 관리자(안드로이드, 동기화)". 목록 화면의 "저장 위치(추정)" 칸이 BS 플래그로 동기화 여부를 보여 줍니다.
- **C32**: 로그인하면 `HttpOnly; SameSite=Lax; Secure` 세션 쿠키 `t08_sid`가 발급되고, 서버 메모리 세션과 연결됩니다. 로그인할 때마다 세션 ID를 새로 발급합니다.
- **C34**: 서버 로그와 E2E 기록 모두 세션 값을 앞 4자만 남기고 `…(가림)`으로 표시합니다.
- **C35**: 비밀번호 입력 칸이 없습니다. 테스트에서 `type="password"`를 검색했고 0건이었습니다.
- **C46**: 패스키가 하나만 남으면 삭제 버튼이 비활성화되고, API로 지우려 해도 409 `last_passkey`가 나옵니다. 화면에는 "하나 더 추가하세요" 경고가 뜹니다.
