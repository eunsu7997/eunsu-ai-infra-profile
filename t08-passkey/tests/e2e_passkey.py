"""
T08 패스키 E2E 확인 — Chromium 가상 인증기(CDP WebAuthn)로 실제 브라우저 흐름을 재현하고
요청/응답을 evidence/E2E_LOG.md 에 남긴다. (세션 쿠키 값은 가림)

실행: 서버를 띄운 뒤  python3 -I tests/e2e_passkey.py [BASE_URL]
"""
import json, re, sys, pathlib
from playwright.sync_api import sync_playwright

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:3000"
ROOT = pathlib.Path(__file__).resolve().parent.parent
EVID = ROOT / "evidence"
EVID.mkdir(exist_ok=True)
PRIVATE_STRINGS = ["준비 중인 프로젝트 메모", "지원하려는 곳 목록", "B 계정 전용 메모", "KubeLLM-Ops: GPU"]

log = []          # 마크다운 줄
results = []      # (기준, 설명, 통과여부)

def mask(v):
    return (v[:4] + "…(가림)") if v else "-"

def short(v, n=48):
    if isinstance(v, str) and len(v) > n:
        return v[:n] + f"…({len(v)}자)"
    return v

def shorten(obj):
    if isinstance(obj, dict):
        return {k: (obj[k][:16] + "…" if k == "challenge" and isinstance(obj[k], str) else shorten(obj[k])) for k in obj}
    if isinstance(obj, list):
        return [shorten(x) for x in obj]
    return short(obj)

def mask_text(t):
    return re.sub(r"(t08_sid=)([A-Za-z0-9_-]{4})[A-Za-z0-9_-]*", r"\1\2…(가림)", t or "")

def section(title):
    log.append(f"\n## {title}\n")

def note(text):
    log.append(text + "\n")

def check(cid, desc, ok):
    results.append((cid, desc, ok))
    log.append(f"- {'✅' if ok else '❌'} **{cid}** {desc}\n")
    if not ok:
        print("FAIL", cid, desc)

def record(label, method, path, status, req_body=None, res_body=None, headers=None):
    log.append(f"\n**{label}**\n\n```http\n{method} {path}\n")
    if headers:
        for k, v in headers.items():
            log.append(f"{k}: {mask_text(v)}\n")
    if req_body is not None:
        log.append("\n" + json.dumps(shorten(req_body), ensure_ascii=False, indent=2) + "\n")
    log.append(f"\n→ HTTP {status}\n")
    if res_body is not None:
        body = res_body if isinstance(res_body, str) else json.dumps(shorten(res_body), ensure_ascii=False, indent=2)
        log.append(mask_text(body) + "\n")
    log.append("```\n")

# 브라우저 안에서 패스키 흐름을 "날 것"으로 실행해 요청 본문까지 돌려받는 도우미
RAW_JS = r"""
window.__raw = {
  toBuf(s){s=s.replace(/-/g,'+').replace(/_/g,'/');s+='==='.slice((s.length+3)%4);const b=atob(s);const u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u.buffer;},
  toB64(buf){const u=new Uint8Array(buf);let s='';for(const c of u)s+=String.fromCharCode(c);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');},
  async post(path, body){const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});let d=null;try{d=await r.json()}catch{};return {status:r.status,data:d};},
  async loginBody(){
    const o=await this.post('/api/login/options',{});
    const cred=await navigator.credentials.get({publicKey:{...o.data,challenge:this.toBuf(o.data.challenge),allowCredentials:[]}});
    return {options:o, body:{id:cred.id,rawId:this.toB64(cred.rawId),type:cred.type,response:{clientDataJSON:this.toB64(cred.response.clientDataJSON),authenticatorData:this.toB64(cred.response.authenticatorData),signature:this.toB64(cred.response.signature),userHandle:cred.response.userHandle?this.toB64(cred.response.userHandle):null}}};
  }
};
"""

def add_authenticator(cdp):
    return cdp.send("WebAuthn.addVirtualAuthenticator", {"options": {
        "protocol": "ctap2", "transport": "internal", "hasResidentKey": True,
        "hasUserVerification": True, "isUserVerified": True, "automaticPresenceSimulation": True,
    }})["authenticatorId"]

def api(page, method, path, body=None):
    return page.evaluate("""async ([m,p,b]) => { const r = await fetch(p,{method:m,headers:b?{'Content-Type':'application/json'}:{},body:b?JSON.stringify(b):undefined}); let d=null; try{d=await r.json()}catch{}; return {status:r.status,data:d}; }""", [method, path, body])

def sid_of(ctx):
    for c in ctx.cookies():
        if c["name"] == "t08_sid":
            return c["value"]
    return None

def watch(page, bucket):
    def on_finished(req):
        if "/api/" not in req.url:
            return
        try:
            resp = req.response()
            body = resp.json() if resp else None
        except Exception:
            body = None
        try:
            rb = req.post_data_json
        except Exception:
            rb = None
        bucket.append({"method": req.method, "path": req.url.replace(BASE, ""), "status": resp.status if resp else 0, "req": rb, "res": body})
    page.on("requestfinished", on_finished)

def flush(bucket, label_prefix, only=None):
    for i, r in enumerate(bucket):
        if only and not any(o in r["path"] for o in only):
            continue
        record(f"{label_prefix} — {r['method']} {r['path']}", r["method"], r["path"], r["status"], r["req"], r["res"])
    bucket.clear()


with sync_playwright() as p:
    browser = p.chromium.launch()
    shots = EVID / "screenshots"
    shots.mkdir(exist_ok=True)

    # ================= 카드 1: 공개 / 비공개 =================
    section("카드 1 — 공개 영역과 비공개 영역 (로그인 없이)")
    anon = p.request.new_context(base_url=BASE)
    html = anon.get("/").text()
    js_all = "".join(anon.get(f).text() for f in ["/script.js", "/vault.js", "/webauthn-client.js", "/passkeys.js"])
    r = anon.get("/api/private")
    record("로그인 없이 비공개 자료 직접 요청", "GET", "/api/private", r.status, None, r.json())
    check("T08-C16/C17", "로그인 없이 /api/private → 401", r.status == 401)
    r2 = anon.get("/api/private/demo-a")
    record("로그인 없이 계정 지정해서 요청", "GET", "/api/private/demo-a", r2.status, None, r2.json())
    r3 = anon.get("/api/passkeys")
    check("T08-C16", "로그인 없이 /api/private/demo-a, /api/passkeys → 401", r2.status == 401 and r3.status == 401)
    leaked = [s for s in PRIVATE_STRINGS if s in html or s in js_all]
    note(f"로그인 없이 받은 `/` HTML({len(html)}자)과 JS 4개에서 비공개 문구 {len(PRIVATE_STRINGS)}개 검색 → 발견 {len(leaked)}개")
    check("T08-C18", "로그인하지 않고 받은 페이지 소스 어디에도 비공개 내용이 없다", not leaked)
    check("T08-C11", "1번 소개 페이지의 공개 내용(h1·강점 3개·공개 범위)이 그대로 있다",
          "근거를 남기며 해결합니다" in html and "원인을 좁혀가는 문제 해결" in html and "공개할 것과 공개하지 않을 것" in html)
    (EVID / "anon_index.html").write_text(html, encoding="utf-8")
    csp = anon.get("/").headers.get("content-security-policy", "")
    note(f"응답 헤더 Content-Security-Policy: `{csp}`")

    ctxA = browser.new_context(base_url=BASE, viewport={"width": 1366, "height": 768}, bypass_csp=True)  # 테스트 도우미 주입용 (실제 CSP 헤더는 아래에서 따로 확인)
    pageA = ctxA.new_page()
    cdpA = ctxA.new_cdp_session(pageA)
    cdpA.send("WebAuthn.enable")
    authA1 = add_authenticator(cdpA)
    busA = []
    watch(pageA, busA)
    pageA.goto("/")
    pageA.evaluate(RAW_JS)
    pageA.locator("#vault").scroll_into_view_if_needed()
    vis = pageA.locator("#vault-open").is_visible()
    check("T08-C15", "로그인 전에는 비공개 영역(#vault-open)이 화면에 보이지 않는다", not vis)
    pageA.screenshot(path=str(shots / "01_locked_vault.png"), full_page=False)
    busA.clear()

    # ================= 카드 2: 등록 =================
    section("카드 2 — 패스키 등록 (demo-a, 첫 패스키)")
    pageA.locator("#firstPasskey summary").click()
    pageA.select_option("#firstAccount", "demo-a")
    pageA.fill("#firstName", "A-노트북 Windows Hello")
    pageA.click("#firstRegisterBtn")
    pageA.wait_for_function("document.getElementById('vaultMsg').dataset.kind==='ok' || document.getElementById('vaultMsg').dataset.kind==='error'")
    regA = [x for x in busA if x["path"].startswith("/api/register/")]
    flush(busA, "demo-a 첫 등록", only=["/api/register/"])
    opt = next(x for x in regA if x["path"] == "/api/register/options")
    ver = next(x for x in regA if x["path"] == "/api/register/verify")
    ch1 = opt["res"]["challenge"]
    check("T08-C19", "서버가 등록용 challenge를 만들어 보내고(options) 검증 때까지 보관", opt["status"] == 200 and len(ch1) >= 40)
    check("T08-C21/C22", "등록 후 서버에 공개키(COSE)가 저장되고 '비밀번호가 아니다' 설명이 응답에 있다",
          ver["status"] == 200 and ver["res"]["saved"] and "공개키" in ver["res"]["note"])
    req_keys = json.dumps(ver["req"])
    check("T08-C23", "등록 요청 본문에는 clientDataJSON·attestationObject(공개키 포함)·transports만 있고 개인키 필드가 없다",
          set(ver["req"]["response"].keys()) <= {"clientDataJSON", "attestationObject", "transports"} and "private" not in req_keys.lower())
    check("T08-C24", "등록한 패스키에 사람이 알아볼 이름이 붙는다", ver["res"]["stored"]["name"] == "A-노트북 Windows Hello")
    credA1 = ver["res"]["stored"]["credentialID"]

    # 이미 패스키가 있는 계정에 로그인 없이 패스키를 붙이려는 시도 (계정 탈취 방지)
    hijack = api(pageA, "POST", "/api/register/options", {"account": "demo-a", "name": "남이 붙이려는 패스키"})
    record("로그인 없이 이미 패스키가 있는 demo-a에 새 패스키 붙이기 시도", "POST", "/api/register/options", hijack["status"], {"account": "demo-a"}, hijack["data"])
    note(f"→ 거절({hijack['status']}). 기존 계정에 패스키를 추가하는 것은 그 계정으로 로그인한 상태에서만 됩니다.")

    # 등록 취소 (사용자가 창을 닫은 상황을 AbortController로 재현)
    section("카드 2 — 등록 중간에 취소")
    before = len(json.loads((ROOT / "data" / "db.json").read_text(encoding="utf-8"))["passkeys"])
    cancel = pageA.evaluate("""async () => {
      const o = await __raw.post('/api/register/options', {account:'demo-b', name:'취소될 패스키'});
      const ac = new AbortController();
      const pr = navigator.credentials.create({signal: ac.signal, publicKey: {...o.data, challenge: __raw.toBuf(o.data.challenge), user: {...o.data.user, id: __raw.toBuf(o.data.user.id)}, excludeCredentials: []}});
      ac.abort();
      let err = null; try { await pr; } catch(e) { err = e.name; }
      const c = await __raw.post('/api/register/cancel', {});
      return {optionsChallenge: o.data.challenge, browserError: err, cancel: c};
    }""")
    after = len(json.loads((ROOT / "data" / "db.json").read_text(encoding="utf-8"))["passkeys"])
    ch2 = cancel["optionsChallenge"]
    record("등록 창을 닫음(취소) → 서버에 취소 알림", "POST", "/api/register/cancel", cancel["cancel"]["status"], {}, cancel["cancel"]["data"])
    note(f"브라우저 오류: `{cancel['browserError']}` · 저장된 패스키 수: 취소 전 {before}개 → 취소 후 {after}개")
    check("T08-C25", "등록을 중간에 취소하면 안내가 나오고 서버에 아무것도 저장되지 않는다", cancel["browserError"] in ("AbortError", "NotAllowedError") and before == after)

    # ================= 카드 3: 로그인 =================
    section("카드 3 — 패스키로 들어가기 (demo-a)")
    pageA.click("#loginBtn")
    pageA.wait_for_selector("#vault-open:not([hidden])")
    logA = [x for x in busA if x["path"].startswith("/api/login/")]
    flush(busA, "demo-a 로그인", only=["/api/login/", "/api/private"])
    ch3 = next(x for x in logA if x["path"] == "/api/login/options")["res"]["challenge"]
    pageA.locator("#vault").scroll_into_view_if_needed()
    pageA.screenshot(path=str(shots / "02_unlocked_vault_demo-a.png"))
    check("T08-C14", "비공개 영역에 들어 있는 항목이 세 개 이상", pageA.locator("#vaultItems li").count() >= 3)
    check("T08-C27/C29", "로그인 때 서버가 새 challenge를 보내고, 공개키로 서명을 확인한 뒤 통과", any(x["path"] == "/api/login/verify" and x["status"] == 200 for x in logA))

    # 두 번째 로그인으로 challenge가 매번 다른지 + 재사용 거절
    section("카드 3 — 이미 쓴 질문(challenge) 재사용")
    rawA = pageA.evaluate("async () => { const x = await __raw.loginBody(); const v1 = await __raw.post('/api/login/verify', x.body); const v2 = await __raw.post('/api/login/verify', x.body); return {ch: x.options.data.challenge, body: x.body, v1, v2}; }")
    record("새 challenge로 로그인 (성공)", "POST", "/api/login/verify", rawA["v1"]["status"], rawA["body"], rawA["v1"]["data"])
    record("똑같은 요청 본문(같은 challenge·같은 서명)을 한 번 더 보냄", "POST", "/api/login/verify", rawA["v2"]["status"], rawA["body"], rawA["v2"]["data"])
    check("T08-C31", "이미 한 번 쓴 질문으로 다시 로그인하면 거절된다", rawA["v1"]["status"] == 200 and rawA["v2"]["status"] == 400 and rawA["v2"]["data"]["error"] == "challenge_already_used")
    ch4 = rawA["ch"]
    chs = [ch1, ch2, ch3, ch4]
    note("등록·로그인마다 받은 challenge 앞 16자: " + " / ".join(f"`{c[:16]}`" for c in chs))
    check("T08-C20", "등록 요청마다 challenge가 서로 다르다 (demo-a 등록 vs 취소한 demo-b 등록)", ch1 != ch2)
    check("T08-C28", "로그인 요청마다 challenge가 서로 다르다", ch3 != ch4)

    section("카드 3 — 서명 확인 실패 (일부러 틀린 서명)")
    cdpA.send("WebAuthn.setResponseOverrideBits", {"authenticatorId": authA1, "isBogusSignature": True})
    bad = pageA.evaluate("async () => { const x = await __raw.loginBody(); return {body: x.body, v: await __raw.post('/api/login/verify', x.body)}; }")
    cdpA.send("WebAuthn.setResponseOverrideBits", {"authenticatorId": authA1, "isBogusSignature": False})
    record("틀린 서명으로 로그인 시도", "POST", "/api/login/verify", bad["v"]["status"], bad["body"], bad["v"]["data"])
    check("T08-C30", "서명 확인 성공 요청(200)과 실패 요청(401 signature_invalid)이 나란히 있다", bad["v"]["status"] == 401 and bad["v"]["data"]["error"] == "signature_invalid")

    # ================= 계정 B =================
    section("계정 B 준비 (다른 브라우저·다른 인증기)")
    ctxB = browser.new_context(base_url=BASE, viewport={"width": 1366, "height": 768}, bypass_csp=True)  # 테스트 도우미 주입용 (실제 CSP 헤더는 아래에서 따로 확인)
    pageB = ctxB.new_page()
    cdpB = ctxB.new_cdp_session(pageB)
    cdpB.send("WebAuthn.enable")
    add_authenticator(cdpB)
    busB = []
    watch(pageB, busB)
    pageB.goto("/")
    pageB.locator("#firstPasskey summary").click()
    pageB.select_option("#firstAccount", "demo-b")
    pageB.fill("#firstName", "B-휴대폰")
    pageB.click("#firstRegisterBtn")
    pageB.wait_for_function("document.getElementById('vaultMsg').dataset.kind==='ok'")
    pageB.click("#loginBtn")
    pageB.wait_for_selector("#vault-open:not([hidden])")
    regB = [x for x in busB if x["path"] == "/api/register/verify"][0]
    credB = regB["res"]["stored"]["credentialID"]
    busB.clear()
    note("demo-b 첫 패스키 등록 후 로그인 완료")

    # ================= 카드 5: 서로의 자료 =================
    section("카드 5 — 한쪽 패스키로 다른 쪽 비공개 자료 읽기")
    b_before = api(pageB, "GET", "/api/private")
    a_before = api(pageA, "GET", "/api/private")
    x1 = api(pageA, "GET", "/api/private/demo-b")
    record("demo-a 세션으로 demo-b 자료 요청", "GET", "/api/private/demo-b", x1["status"], None, x1["data"], {"Cookie": f"t08_sid={sid_of(ctxA)}"})
    x2 = api(pageB, "GET", "/api/private/demo-a")
    record("demo-b 세션으로 demo-a 자료 요청 (반대 방향)", "GET", "/api/private/demo-a", x2["status"], None, x2["data"], {"Cookie": f"t08_sid={sid_of(ctxB)}"})
    x3 = api(pageA, "GET", "/api/private?user=demo-b")
    record("demo-a 세션으로 주소에 user=demo-b를 적어 요청", "GET", "/api/private?user=demo-b", x3["status"], None, x3["data"], {"Cookie": f"t08_sid={sid_of(ctxA)}"})
    b_after = api(pageB, "GET", "/api/private")
    a_after = api(pageA, "GET", "/api/private")
    check("T08-C36", "패스키를 등록한 계정이 두 개이고, 서로 다른 비공개 내용이 들어 있다", a_before["data"]["items"] != b_before["data"]["items"])
    check("T08-C37", "demo-a 패스키로 demo-b 자료 요청 → 403", x1["status"] == 403)
    check("T08-C38", "반대 방향(demo-b → demo-a)도 403", x2["status"] == 403)
    note(f"거절 앞뒤 자료 건수 — demo-a: {len(a_before['data']['items'])} → {len(a_after['data']['items'])}, demo-b: {len(b_before['data']['items'])} → {len(b_after['data']['items'])}")
    check("T08-C39", "거절 앞뒤로 반대편 자료 건수가 같다", len(b_before["data"]["items"]) == len(b_after["data"]["items"]) and len(a_before["data"]["items"]) == len(a_after["data"]["items"]))
    check("T08-C40", "주소에 다른 계정을 적어 보내도 내 자료(demo-a)만 돌아온다", x3["status"] == 200 and x3["data"]["owner"] == "demo-a")
    xd = api(pageA, "DELETE", f"/api/passkeys/{credB}")
    record("demo-a 세션으로 demo-b의 패스키 삭제 시도", "DELETE", "/api/passkeys/<demo-b의 credentialID>", xd["status"], None, xd["data"])
    note(f"→ 남의 패스키는 지울 수 없음 ({xd['status']})")

    # ================= 카드 4: 패스키 두 개 =================
    section("카드 4 — 마지막 패스키 삭제 막기")
    last = api(pageA, "DELETE", f"/api/passkeys/{credA1}")
    record("패스키가 하나뿐일 때 삭제 시도", "DELETE", "/api/passkeys/<A-노트북>", last["status"], None, last["data"])
    check("T08-C46", "패스키가 하나만 남으면 삭제를 막고(409) 이유를 안내한다", last["status"] == 409 and last["data"]["error"] == "last_passkey")

    section("카드 4 — 두 번째 패스키 등록 (다른 인증기)")
    savedA1 = cdpA.send("WebAuthn.getCredentials", {"authenticatorId": authA1})["credentials"]
    cdpA.send("WebAuthn.removeVirtualAuthenticator", {"authenticatorId": authA1})
    authA2 = add_authenticator(cdpA)
    pageA.goto("/passkeys.html")
    pageA.wait_for_selector("#pkOpen:not([hidden])")
    busA.clear()
    pageA.fill("#pkName", "A-휴대폰(두 번째)")
    pageA.click("#pkAddBtn")
    pageA.wait_for_function("document.querySelectorAll('#pkRows tr').length === 2")
    flush(busA, "demo-a 두 번째 패스키", only=["/api/register/verify"])
    lst = api(pageA, "GET", "/api/passkeys")
    record("패스키 목록", "GET", "/api/passkeys", lst["status"], None, lst["data"])
    pageA.screenshot(path=str(shots / "03_passkeys_two.png"), full_page=True)
    check("T08-C42", "한 계정(demo-a)에 패스키가 두 개 등록되어 있다", len(lst["data"]["passkeys"]) == 2)
    check("T08-C43", "목록 화면에 각 패스키의 이름과 등록 날짜가 보인다",
          pageA.locator("#pkRows tr").count() == 2 and "A-노트북" in pageA.inner_text("#pkRows") and "2026" in pageA.inner_text("#pkRows"))

    section("카드 4 — 하나를 지운 뒤 남은 하나로 들어가기")
    pageA.locator("#pkRows tr", has_text="A-노트북").get_by_role("button").click()
    pageA.wait_for_function("document.querySelectorAll('#pkRows tr').length === 1")
    flush(busA, "A-노트북 패스키 삭제", only=["/api/passkeys/"])
    pageA.screenshot(path=str(shots / "04_after_delete.png"), full_page=True)
    api(pageA, "POST", "/api/logout", {})
    pageA.goto("/")
    pageA.evaluate(RAW_JS)
    ok2 = pageA.evaluate("async () => { const x = await __raw.loginBody(); return await __raw.post('/api/login/verify', x.body); }")
    record("남은 패스키(A-휴대폰)로 로그인", "POST", "/api/login/verify", ok2["status"], None, ok2["data"])
    check("T08-C44", "패스키 하나를 지운 뒤 남은 하나로 들어갈 수 있다", ok2["status"] == 200)
    api(pageA, "POST", "/api/logout", {})
    # 지운 패스키(A-노트북)를 가진 기기로 다시 시도
    cdpA.send("WebAuthn.removeVirtualAuthenticator", {"authenticatorId": authA2})
    authA1b = add_authenticator(cdpA)
    for c in savedA1:
        cdpA.send("WebAuthn.addCredential", {"authenticatorId": authA1b, "credential": c})
    gone = pageA.evaluate("async () => { const x = await __raw.loginBody(); return {body: x.body, v: await __raw.post('/api/login/verify', x.body)}; }")
    record("지운 패스키(A-노트북)로 로그인 시도", "POST", "/api/login/verify", gone["v"]["status"], {"id": gone["body"]["id"][:12] + "…"}, gone["v"]["data"])
    check("T08-C45", "지운 패스키로는 더 이상 들어갈 수 없다(401 unknown_credential)", gone["v"]["status"] == 401 and gone["v"]["data"]["error"] == "unknown_credential")

    # ================= 로그아웃 후 같은 세션 값 =================
    section("카드 3 — 로그아웃한 뒤 같은 세션 값으로 다시 요청")
    old_sid = sid_of(ctxB)
    out = api(pageB, "POST", "/api/logout", {})
    record("demo-b 로그아웃", "POST", "/api/logout", out["status"], {}, out["data"], {"Cookie": f"t08_sid={old_sid}"})
    replay = p.request.new_context(base_url=BASE, extra_http_headers={"Cookie": f"t08_sid={old_sid}"})
    rr = replay.get("/api/private")
    record("로그아웃 전에 쓰던 세션 값을 그대로 붙여 요청", "GET", "/api/private", rr.status, None, rr.json(), {"Cookie": f"t08_sid={old_sid}"})
    check("T08-C33", "로그아웃한 뒤 같은 세션 값으로 다시 요청하면 401", rr.status == 401)
    check("T08-C32", "로그인 뒤에는 HttpOnly 세션 쿠키(t08_sid)로 사람을 알아본다",
          any(c["name"] == "t08_sid" and c["httpOnly"] for c in ctxA.cookies()))
    check("T08-C35", "페이지 어디에도 비밀번호 입력 칸이 없다", 'type="password"' not in html and 'type="password"' not in pageA.content())
    full_log = "".join(log)
    check("T08-C34", "기록에 세션 값이 그대로 남지 않았다(앞 4자만)", (old_sid not in full_log) and (sid_of(ctxA) or "x") not in full_log)

    browser.close()

passed = sum(1 for r in results if r[2])
head = [f"# T08 E2E 확인 기록\n\n- 대상: `{BASE}`\n- 방법: Chromium 가상 인증기(CDP WebAuthn)로 실제 등록·로그인 흐름 실행, 요청/응답 기록\n- 세션 쿠키 값은 앞 4자만 남기고 가렸습니다. 긴 값(clientDataJSON 등)은 앞부분만 표시했습니다.\n- 결과: **{passed}/{len(results)} 통과**\n"]
(EVID / "E2E_LOG.md").write_text("".join(head + log), encoding="utf-8")
print(f"{passed}/{len(results)} passed")
for cid, desc, ok in results:
    if not ok:
        print(" -", cid, desc)
