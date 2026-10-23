# T08 — 소개 페이지에 패스키 달기

1번 과제 소개 페이지(`../index.html`)를 그대로 옮겨 두고, 맨 아래에 **패스키로만 열리는 "나만 보는 자리"**를 붙였습니다. 비밀번호는 없고, **외부 패키지도 0개**입니다.

```
t08-passkey/
├─ server.js              HTTP 서버, 세션, API, 정적 파일
├─ lib/webauthn.js        WebAuthn 등록/로그인 검증 (node:crypto)
├─ lib/cbor.js            최소 CBOR 디코더
├─ lib/store.js           JSON 저장소 (데모 계정 2개, 패스키 공개키)
├─ public/                1번 페이지 + vault.js / passkeys.html / webauthn-client.js / t08.css
├─ tests/e2e_passkey.py   Chromium 가상 인증기 E2E 확인 (30항목)
├─ evidence/              E2E_LOG.md, 스크린샷
└─ T08_REPORT.md          제출용 보고서 (설명서 6항목, 확인 4줄, AI 3줄)
```

## 로컬 실행

```bash
cd t08-passkey
node server.js            # http://localhost:3000  (Node 20 이상)
```

패스키는 https 주소나 `localhost`에서만 동작합니다.

## Render 배포 (무료)

1. Render 대시보드 → **New → Web Service** → 이 저장소를 연결합니다.
2. 설정은 다음과 같이 합니다.
   - Root Directory: `t08-passkey`
   - Runtime: Node
   - Build Command: 비워 둠(또는 `echo no build`)
   - Start Command: `node server.js`
   - Instance: Free
3. 환경변수
   - `ALLOW_FIRST_PASSKEY=true`: 처음 두 계정에 패스키를 만들 때만 켭니다. 다 만들면 **`false`로 바꿔서 닫습니다.**
   - `ORIGIN`·`RP_ID`는 Render가 주는 `RENDER_EXTERNAL_URL`로 자동 설정되므로 넣지 않아도 됩니다.
4. 배포 후 `https://<이름>.onrender.com/`을 엽니다. 맨 아래 "처음 패스키 만들기"에서 demo-a와 demo-b에 첫 패스키를 각각 만듭니다. 그다음 demo-a로 들어가 "내 패스키 관리"에서 두 번째 패스키(휴대폰 QR)를 추가합니다.

> ⚠️ Render 무료 플랜은 15분 동안 요청이 없으면 잠들고, 다시 깨어날 때 저장 파일(`data/db.json`)이 사라질 수 있습니다.
> 패스키를 유지하려면 로그인한 상태에서 `/api/passkeys/export`를 열고, 나온 JSON(공개키만 들어 있음)을 계정별로 합쳐 환경변수 `SEED_PASSKEYS`에 넣으세요.

## 자동 확인

```bash
node server.js &
python3 tests/e2e_passkey.py http://localhost:3000   # pip install playwright 필요
```

데이터가 빈 상태(`data/` 삭제)에서 실행해야 합니다.
