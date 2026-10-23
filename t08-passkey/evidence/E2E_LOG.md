# T08 E2E 확인 기록

- 대상: `http://localhost:3000`
- 방법: Chromium 가상 인증기(CDP WebAuthn)로 실제 등록·로그인 흐름 실행, 요청/응답 기록
- 세션 쿠키 값은 앞 4자만 남기고 가렸습니다. 긴 값(clientDataJSON 등)은 앞부분만 표시했습니다.
- 결과: **30/30 통과**

## 카드 1 — 공개 영역과 비공개 영역 (로그인 없이)

**로그인 없이 비공개 자료 직접 요청**

```http
GET /api/private

→ HTTP 401
{
  "error": "login_required",
  "message": "패스키로 들어간 뒤에만 볼 수 있습니다."
}
```
- ✅ **T08-C16/C17** 로그인 없이 /api/private → 401

**로그인 없이 계정 지정해서 요청**

```http
GET /api/private/demo-a

→ HTTP 401
{
  "error": "login_required",
  "message": "패스키로 들어간 뒤에만 볼 수 있습니다."
}
```
- ✅ **T08-C16** 로그인 없이 /api/private/demo-a, /api/passkeys → 401
로그인 없이 받은 `/` HTML(10024자)과 JS 4개에서 비공개 문구 4개 검색 → 발견 0개
- ✅ **T08-C18** 로그인하지 않고 받은 페이지 소스 어디에도 비공개 내용이 없다
- ✅ **T08-C11** 1번 소개 페이지의 공개 내용(h1·강점 3개·공개 범위)이 그대로 있다
응답 헤더 Content-Security-Policy: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`
- ✅ **T08-C15** 로그인 전에는 비공개 영역(#vault-open)이 화면에 보이지 않는다

## 카드 2 — 패스키 등록 (demo-a, 첫 패스키)

**demo-a 첫 등록 — POST /api/register/options**

```http
POST /api/register/options

{
  "account": "demo-a",
  "name": "A-노트북 Windows Hello"
}

→ HTTP 200
{
  "challenge": "c1N5FTB9zsk8PanU…",
  "rp": {
    "name": "EUNSU.INFRA · T08",
    "id": "localhost"
  },
  "user": {
    "id": "hnRU-Jkp-53CbuCfXFmyEQ",
    "name": "demo-a",
    "displayName": "은수 A (데모)"
  },
  "pubKeyCredParams": [
    {
      "type": "public-key",
      "alg": -7
    },
    {
      "type": "public-key",
      "alg": -8
    },
    {
      "type": "public-key",
      "alg": -257
    }
  ],
  "timeout": 120000,
  "attestation": "none",
  "excludeCredentials": [],
  "authenticatorSelection": {
    "residentKey": "required",
    "requireResidentKey": true,
    "userVerification": "preferred"
  }
}
```

**demo-a 첫 등록 — POST /api/register/verify**

```http
POST /api/register/verify

{
  "id": "C2_V7CxWk8ztzr97JuJuwqsDTKgKByBBGPW3VQFCo6w",
  "rawId": "C2_V7CxWk8ztzr97JuJuwqsDTKgKByBBGPW3VQFCo6w",
  "type": "public-key",
  "authenticatorAttachment": "platform",
  "response": {
    "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwiY2hhbGxlbmdl…(183자)",
    "attestationObject": "o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YVikSZYN5YgO…(259자)",
    "transports": [
      "internal"
    ]
  }
}

→ HTTP 200
{
  "saved": true,
  "account": "demo-a",
  "stored": {
    "credentialID": "C2_V7CxWk8ztzr97JuJuwqsDTKgKByBBGPW3VQFCo6w",
    "name": "A-노트북 Windows Hello",
    "alg": -7,
    "publicKey": "pQECAyYgASFYICxs2B-77rYt0mFF9oji1czNjx5bEELcLYd-…(103자)",
    "createdAt": "2026-10-23T02:25:41.281Z"
  },
  "note": "서버에 저장된 값은 COSE 형식의 \"공개키\"입니다. 비밀번호가 아니며, 개인키는 기기…(59자)",
  "next": "이제 \"패스키로 들어가기\"를 눌러 로그인하세요."
}
```
- ✅ **T08-C19** 서버가 등록용 challenge를 만들어 보내고(options) 검증 때까지 보관
- ✅ **T08-C21/C22** 등록 후 서버에 공개키(COSE)가 저장되고 '비밀번호가 아니다' 설명이 응답에 있다
- ✅ **T08-C23** 등록 요청 본문에는 clientDataJSON·attestationObject(공개키 포함)·transports만 있고 개인키 필드가 없다
- ✅ **T08-C24** 등록한 패스키에 사람이 알아볼 이름이 붙는다

**로그인 없이 이미 패스키가 있는 demo-a에 새 패스키 붙이기 시도**

```http
POST /api/register/options

{
  "account": "demo-a"
}

→ HTTP 403
{
  "error": "account_already_has_passkey",
  "message": "이미 패스키가 있는 계정입니다. 그 패스키로 먼저 들어간 뒤에만 새 패스키를 추가할 수…(54자)"
}
```
→ 거절(403). 기존 계정에 패스키를 추가하는 것은 그 계정으로 로그인한 상태에서만 됩니다.

## 카드 2 — 등록 중간에 취소

**등록 창을 닫음(취소) → 서버에 취소 알림**

```http
POST /api/register/cancel

{}

→ HTTP 200
{
  "saved": false,
  "message": "등록을 취소했습니다. 서버에는 아무것도 저장되지 않았습니다."
}
```
브라우저 오류: `AbortError` · 저장된 패스키 수: 취소 전 1개 → 취소 후 1개
- ✅ **T08-C25** 등록을 중간에 취소하면 안내가 나오고 서버에 아무것도 저장되지 않는다

## 카드 3 — 패스키로 들어가기 (demo-a)

**demo-a 로그인 — POST /api/login/options**

```http
POST /api/login/options

{}

→ HTTP 200
{
  "challenge": "ouzZ7UXNG9Kf7X8w…",
  "rpId": "localhost",
  "timeout": 120000,
  "userVerification": "preferred",
  "allowCredentials": []
}
```

**demo-a 로그인 — POST /api/login/verify**

```http
POST /api/login/verify

{
  "id": "C2_V7CxWk8ztzr97JuJuwqsDTKgKByBBGPW3VQFCo6w",
  "rawId": "C2_V7CxWk8ztzr97JuJuwqsDTKgKByBBGPW3VQFCo6w",
  "type": "public-key",
  "response": {
    "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoi…(179자)",
    "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAA…(50자)",
    "signature": "MEUCIH3fN5a3HIaQy-14QXFZkZ_LmYBFYHg7i8DcwHRsABqv…(95자)",
    "userHandle": "hnRU-Jkp-53CbuCfXFmyEQ"
  }
}

→ HTTP 200
{
  "loggedIn": true,
  "username": "demo-a",
  "passkey": "A-노트북 Windows Hello",
  "session": "HttpOnly 쿠키(t08_sid)로 발급 — 값은 화면과 기록에서 가림"
}
```

**demo-a 로그인 — GET /api/private**

```http
GET /api/private

→ HTTP 200
{
  "owner": "demo-a",
  "requestedUser": null,
  "items": [
    {
      "title": "준비 중인 프로젝트 메모",
      "body": "KubeLLM-Ops: GPU 노드 장애 주입 시나리오 3개 정리하기 (만들어 넣은 메…(50자)"
    },
    {
      "title": "지원하려는 곳 목록",
      "body": "가상회사 A 인프라팀 · 가상회사 B 플랫폼팀 · 가상회사 C MLOps팀 (예시)"
    },
    {
      "title": "이번 주 회고",
      "body": "패스키는 비밀번호 대신 \"기기가 가진 개인키로 서명\"하는 방식이라는 걸 직접 붙여 보며…(53자)"
    }
  ]
}
```
- ✅ **T08-C14** 비공개 영역에 들어 있는 항목이 세 개 이상
- ✅ **T08-C27/C29** 로그인 때 서버가 새 challenge를 보내고, 공개키로 서명을 확인한 뒤 통과

## 카드 3 — 이미 쓴 질문(challenge) 재사용

**새 challenge로 로그인 (성공)**

```http
POST /api/login/verify

{
  "id": "C2_V7CxWk8ztzr97JuJuwqsDTKgKByBBGPW3VQFCo6w",
  "rawId": "C2_V7CxWk8ztzr97JuJuwqsDTKgKByBBGPW3VQFCo6w",
  "type": "public-key",
  "response": {
    "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoi…(179자)",
    "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAA…(50자)",
    "signature": "MEUCIA-nUQHBwhs9iFixeTgqYG6Vj9lhjkZbmT8yS3K0vrCm…(95자)",
    "userHandle": "hnRU-Jkp-53CbuCfXFmyEQ"
  }
}

→ HTTP 200
{
  "loggedIn": true,
  "username": "demo-a",
  "passkey": "A-노트북 Windows Hello",
  "session": "HttpOnly 쿠키(t08_sid)로 발급 — 값은 화면과 기록에서 가림"
}
```

**똑같은 요청 본문(같은 challenge·같은 서명)을 한 번 더 보냄**

```http
POST /api/login/verify

{
  "id": "C2_V7CxWk8ztzr97JuJuwqsDTKgKByBBGPW3VQFCo6w",
  "rawId": "C2_V7CxWk8ztzr97JuJuwqsDTKgKByBBGPW3VQFCo6w",
  "type": "public-key",
  "response": {
    "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoi…(179자)",
    "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAA…(50자)",
    "signature": "MEUCIA-nUQHBwhs9iFixeTgqYG6Vj9lhjkZbmT8yS3K0vrCm…(95자)",
    "userHandle": "hnRU-Jkp-53CbuCfXFmyEQ"
  }
}

→ HTTP 400
{
  "error": "challenge_already_used",
  "message": "이미 한 번 쓴 질문(challenge)입니다. 새 질문을 받아 다시 시도하세요."
}
```
- ✅ **T08-C31** 이미 한 번 쓴 질문으로 다시 로그인하면 거절된다
등록·로그인마다 받은 challenge 앞 16자: `c1N5FTB9zsk8PanU` / `94an_98gi5PttHLP` / `ouzZ7UXNG9Kf7X8w` / `GjNu8syhgdnZjLcO`
- ✅ **T08-C20** 등록 요청마다 challenge가 서로 다르다 (demo-a 등록 vs 취소한 demo-b 등록)
- ✅ **T08-C28** 로그인 요청마다 challenge가 서로 다르다

## 카드 3 — 서명 확인 실패 (일부러 틀린 서명)

**틀린 서명으로 로그인 시도**

```http
POST /api/login/verify

{
  "id": "C2_V7CxWk8ztzr97JuJuwqsDTKgKByBBGPW3VQFCo6w",
  "rawId": "C2_V7CxWk8ztzr97JuJuwqsDTKgKByBBGPW3VQFCo6w",
  "type": "public-key",
  "response": {
    "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uZ2V0IiwiY2hhbGxlbmdlIjoi…(324자)",
    "authenticatorData": "SZYN5YgOjGh0NBcPZHZgW4_krrmihjLHmVzzuoMdl2MFAAAA…(50자)",
    "signature": "AA",
    "userHandle": "hnRU-Jkp-53CbuCfXFmyEQ"
  }
}

→ HTTP 401
{
  "error": "signature_invalid",
  "message": "서명이 저장된 공개키와 맞지 않습니다"
}
```
- ✅ **T08-C30** 서명 확인 성공 요청(200)과 실패 요청(401 signature_invalid)이 나란히 있다

## 계정 B 준비 (다른 브라우저·다른 인증기)
demo-b 첫 패스키 등록 후 로그인 완료

## 카드 5 — 한쪽 패스키로 다른 쪽 비공개 자료 읽기

**demo-a 세션으로 demo-b 자료 요청**

```http
GET /api/private/demo-b
Cookie: t08_sid=CGWu…(가림)

→ HTTP 403
{
  "error": "forbidden",
  "message": "다른 계정의 비공개 자료는 볼 수 없습니다."
}
```

**demo-b 세션으로 demo-a 자료 요청 (반대 방향)**

```http
GET /api/private/demo-a
Cookie: t08_sid=iW-b…(가림)

→ HTTP 403
{
  "error": "forbidden",
  "message": "다른 계정의 비공개 자료는 볼 수 없습니다."
}
```

**demo-a 세션으로 주소에 user=demo-b를 적어 요청**

```http
GET /api/private?user=demo-b
Cookie: t08_sid=CGWu…(가림)

→ HTTP 200
{
  "owner": "demo-a",
  "requestedUser": "demo-b",
  "note": "주소에 다른 계정을 적어도 무시합니다. 누구의 자료인지는 세션으로만 정합니다.",
  "items": [
    {
      "title": "준비 중인 프로젝트 메모",
      "body": "KubeLLM-Ops: GPU 노드 장애 주입 시나리오 3개 정리하기 (만들어 넣은 메…(50자)"
    },
    {
      "title": "지원하려는 곳 목록",
      "body": "가상회사 A 인프라팀 · 가상회사 B 플랫폼팀 · 가상회사 C MLOps팀 (예시)"
    },
    {
      "title": "이번 주 회고",
      "body": "패스키는 비밀번호 대신 \"기기가 가진 개인키로 서명\"하는 방식이라는 걸 직접 붙여 보며…(53자)"
    }
  ]
}
```
- ✅ **T08-C36** 패스키를 등록한 계정이 두 개이고, 서로 다른 비공개 내용이 들어 있다
- ✅ **T08-C37** demo-a 패스키로 demo-b 자료 요청 → 403
- ✅ **T08-C38** 반대 방향(demo-b → demo-a)도 403
거절 앞뒤 자료 건수 — demo-a: 3 → 3, demo-b: 3 → 3
- ✅ **T08-C39** 거절 앞뒤로 반대편 자료 건수가 같다
- ✅ **T08-C40** 주소에 다른 계정을 적어 보내도 내 자료(demo-a)만 돌아온다

**demo-a 세션으로 demo-b의 패스키 삭제 시도**

```http
DELETE /api/passkeys/<demo-b의 credentialID>

→ HTTP 403
{
  "error": "not_your_passkey",
  "message": "내 계정의 패스키만 지울 수 있습니다."
}
```
→ 남의 패스키는 지울 수 없음 (403)

## 카드 4 — 마지막 패스키 삭제 막기

**패스키가 하나뿐일 때 삭제 시도**

```http
DELETE /api/passkeys/<A-노트북>

→ HTTP 409
{
  "error": "last_passkey",
  "message": "마지막 남은 패스키는 지울 수 없습니다. 지우면 이 계정에 들어갈 방법이 없어집니다. …(64자)"
}
```
- ✅ **T08-C46** 패스키가 하나만 남으면 삭제를 막고(409) 이유를 안내한다

## 카드 4 — 두 번째 패스키 등록 (다른 인증기)

**demo-a 두 번째 패스키 — POST /api/register/verify**

```http
POST /api/register/verify

{
  "id": "K6C3lYXrhozlRiuAbJicoMDxcOyCRA-fKAoB3U9tCeg",
  "rawId": "K6C3lYXrhozlRiuAbJicoMDxcOyCRA-fKAoB3U9tCeg",
  "type": "public-key",
  "authenticatorAttachment": "platform",
  "response": {
    "clientDataJSON": "eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIiwiY2hhbGxlbmdl…(328자)",
    "attestationObject": "o2NmbXRkbm9uZWdhdHRTdG10oGhhdXRoRGF0YVikSZYN5YgO…(259자)",
    "transports": [
      "internal"
    ]
  }
}

→ HTTP 200
{
  "saved": true,
  "account": "demo-a",
  "stored": {
    "credentialID": "K6C3lYXrhozlRiuAbJicoMDxcOyCRA-fKAoB3U9tCeg",
    "name": "A-휴대폰(두 번째)",
    "alg": -7,
    "publicKey": "pQECAyYgASFYIPuOhyw0NJlNEUa-T39jrQRauJq8izc9isIF…(103자)",
    "createdAt": "2026-10-23T02:25:42.147Z"
  },
  "note": "서버에 저장된 값은 COSE 형식의 \"공개키\"입니다. 비밀번호가 아니며, 개인키는 기기…(59자)",
  "next": "패스키 목록에 추가되었습니다."
}
```

**패스키 목록**

```http
GET /api/passkeys

→ HTTP 200
{
  "owner": "demo-a",
  "passkeys": [
    {
      "credentialID": "C2_V7CxWk8ztzr97JuJuwqsDTKgKByBBGPW3VQFCo6w",
      "name": "A-노트북 Windows Hello",
      "createdAt": "2026-10-23T02:25:41.281Z",
      "lastUsedAt": "2026-10-23T02:25:41.518Z",
      "storedIn": "기기에 묶인 패스키 (예: Windows Hello · 보안 키)",
      "transports": [
        "internal"
      ],
      "usedForThisSession": true
    },
    {
      "credentialID": "K6C3lYXrhozlRiuAbJicoMDxcOyCRA-fKAoB3U9tCeg",
      "name": "A-휴대폰(두 번째)",
      "createdAt": "2026-10-23T02:25:42.147Z",
      "lastUsedAt": null,
      "storedIn": "기기에 묶인 패스키 (예: Windows Hello · 보안 키)",
      "transports": [
        "internal"
      ],
      "usedForThisSession": false
    }
  ]
}
```
- ✅ **T08-C42** 한 계정(demo-a)에 패스키가 두 개 등록되어 있다
- ✅ **T08-C43** 목록 화면에 각 패스키의 이름과 등록 날짜가 보인다

## 카드 4 — 하나를 지운 뒤 남은 하나로 들어가기

**A-노트북 패스키 삭제 — DELETE /api/passkeys/C2_V7CxWk8ztzr97JuJuwqsDTKgKByBBGPW3VQFCo6w**

```http
DELETE /api/passkeys/C2_V7CxWk8ztzr97JuJuwqsDTKgKByBBGPW3VQFCo6w

→ HTTP 200
{
  "deleted": true,
  "name": "A-노트북 Windows Hello",
  "remaining": 1,
  "message": "삭제한 패스키로는 더 이상 들어올 수 없습니다."
}
```

**남은 패스키(A-휴대폰)로 로그인**

```http
POST /api/login/verify

→ HTTP 200
{
  "loggedIn": true,
  "username": "demo-a",
  "passkey": "A-휴대폰(두 번째)",
  "session": "HttpOnly 쿠키(t08_sid)로 발급 — 값은 화면과 기록에서 가림"
}
```
- ✅ **T08-C44** 패스키 하나를 지운 뒤 남은 하나로 들어갈 수 있다

**지운 패스키(A-노트북)로 로그인 시도**

```http
POST /api/login/verify

{
  "id": "C2_V7CxWk8zt…"
}

→ HTTP 401
{
  "error": "unknown_credential",
  "message": "등록되지 않았거나 삭제된 패스키입니다."
}
```
- ✅ **T08-C45** 지운 패스키로는 더 이상 들어갈 수 없다(401 unknown_credential)

## 카드 3 — 로그아웃한 뒤 같은 세션 값으로 다시 요청

**demo-b 로그아웃**

```http
POST /api/logout
Cookie: t08_sid=iW-b…(가림)

{}

→ HTTP 200
{
  "loggedOut": true,
  "message": "서버에서 세션을 지웠습니다. 같은 쿠키로 다시 요청하면 401입니다."
}
```

**로그아웃 전에 쓰던 세션 값을 그대로 붙여 요청**

```http
GET /api/private
Cookie: t08_sid=iW-b…(가림)

→ HTTP 401
{
  "error": "login_required",
  "message": "패스키로 들어간 뒤에만 볼 수 있습니다."
}
```
- ✅ **T08-C33** 로그아웃한 뒤 같은 세션 값으로 다시 요청하면 401
- ✅ **T08-C32** 로그인 뒤에는 HttpOnly 세션 쿠키(t08_sid)로 사람을 알아본다
- ✅ **T08-C35** 페이지 어디에도 비밀번호 입력 칸이 없다
- ✅ **T08-C34** 기록에 세션 값이 그대로 남지 않았다(앞 4자만)
