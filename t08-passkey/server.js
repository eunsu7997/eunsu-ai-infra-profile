'use strict';
// T08 — 1번 소개 페이지에 패스키 달기 (비밀번호 없음)
// 외부 패키지 0개: node:http + node:crypto 만 사용
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const wa = require('./lib/webauthn');
const store = require('./lib/store');

// ---------- 설정 ----------
const PORT = Number(process.env.PORT || 3000);
const ORIGIN = (process.env.ORIGIN || process.env.RENDER_EXTERNAL_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const RP_ID = process.env.RP_ID || new URL(ORIGIN).hostname;
const SECURE_COOKIE = ORIGIN.startsWith('https://');
// 아직 패스키가 하나도 없는 데모 계정에 "첫 패스키"를 만드는 것을 허용할지.
// 배포 후 두 계정에 패스키를 만들었다면 false로 바꿔서 닫는다.
const ALLOW_FIRST_PASSKEY = (process.env.ALLOW_FIRST_PASSKEY || 'true') === 'true';

const CHALLENGE_TTL_MS = 5 * 60 * 1000;      // 질문(challenge) 유효시간 5분
const SESSION_IDLE_MS = 30 * 60 * 1000;      // 30분 동안 아무 요청 없으면 세션 만료
const SESSION_MAX_MS = 8 * 60 * 60 * 1000;   // 최대 8시간
const COOKIE_NAME = 't08_sid';
const PUBLIC_DIR = path.join(__dirname, 'public');

// ---------- 세션 (서버 메모리에 저장 → 로그아웃 때 서버에서 지울 수 있음) ----------
const sessions = new Map(); // sid -> { userId, credentialID, createdAt, lastSeen, pendingReg, pendingLogin }
const usedChallenges = new Map(); // challenge -> 만료시각 (이미 쓴 질문을 알아보기 위한 기록)

const mask = (v) => (v ? `${String(v).slice(0, 4)}…(가림)` : '-');

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function cookieHeader(sid, maxAgeSec) {
  return [
    `${COOKIE_NAME}=${sid}`, 'Path=/', 'HttpOnly', 'SameSite=Lax',
    SECURE_COOKIE ? 'Secure' : null, `Max-Age=${maxAgeSec}`,
  ].filter(Boolean).join('; ');
}

function getSession(req) {
  const sid = parseCookies(req)[COOKIE_NAME];
  if (!sid) return null;
  const s = sessions.get(sid);
  if (!s) return null;
  const now = Date.now();
  if (now - s.lastSeen > SESSION_IDLE_MS || now - s.createdAt > SESSION_MAX_MS) {
    sessions.delete(sid);
    return null;
  }
  s.lastSeen = now;
  return s;
}

function createSession(res, fields = {}) {
  const sid = crypto.randomBytes(32).toString('base64url');
  const s = { sid, userId: null, credentialID: null, createdAt: Date.now(), lastSeen: Date.now(), pendingReg: null, pendingLogin: null, ...fields };
  sessions.set(sid, s);
  res.setHeader('Set-Cookie', cookieHeader(sid, Math.floor(SESSION_MAX_MS / 1000)));
  return s;
}

function getOrCreateSession(req, res) {
  return getSession(req) || createSession(res);
}

function destroySession(s, res) {
  if (s) sessions.delete(s.sid);
  res.setHeader('Set-Cookie', cookieHeader('', 0));
}

setInterval(() => {
  const now = Date.now();
  for (const [sid, s] of sessions) if (now - s.lastSeen > SESSION_IDLE_MS || now - s.createdAt > SESSION_MAX_MS) sessions.delete(sid);
  for (const [c, exp] of usedChallenges) if (exp < now) usedChallenges.delete(c);
}, 60 * 1000).unref();

// ---------- 공통 응답 ----------
const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};

function send(res, status, body, headers = {}) {
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  const payload = isJson ? JSON.stringify(body, null, 2) : body;
  res.writeHead(status, {
    ...SECURITY_HEADERS,
    'Content-Type': isJson ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

const loginRequired = (res) => send(res, 401, { error: 'login_required', message: '패스키로 들어간 뒤에만 볼 수 있습니다.' });

function readJson(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const ct = req.headers['content-type'] || '';
    if (!ct.startsWith('application/json')) return reject(Object.assign(new Error('JSON만 받습니다'), { status: 415 }));
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(Object.assign(new Error('요청이 너무 큽니다'), { status: 413 })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('JSON 형식 오류'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

// 응답 안 clientDataJSON에서 challenge만 꺼내 본다 (재사용 감지용)
function challengeFromResponse(body) {
  try {
    const cd = JSON.parse(wa.b64url.decode(body.response.clientDataJSON).toString('utf8'));
    return typeof cd.challenge === 'string' ? cd.challenge : null;
  } catch { return null; }
}

// 질문(challenge)을 꺼내면서 바로 지운다 → 한 번만 쓸 수 있음
function takePending(s, key, body) {
  const used = challengeFromResponse(body);
  if (used && usedChallenges.has(used)) return { error: [400, 'challenge_already_used', '이미 한 번 쓴 질문(challenge)입니다. 새 질문을 받아 다시 시도하세요.'] };
  const pending = s && s[key];
  if (s) s[key] = null;
  if (!pending) return { error: [400, 'no_pending_challenge', '서버가 보낸 질문이 없습니다. 처음부터 다시 시작하세요.'] };
  usedChallenges.set(pending.challenge, Date.now() + 10 * 60 * 1000);
  if (Date.now() > pending.expires) return { error: [400, 'challenge_expired', '질문 유효시간(5분)이 지났습니다.'] };
  return { pending };
}

function cleanName(v, fallback) {
  const s = typeof v === 'string' ? v.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 40) : '';
  return s || fallback;
}

const publicPasskey = (p, currentId) => ({
  credentialID: p.credentialID,
  name: p.name,
  createdAt: p.createdAt,
  lastUsedAt: p.lastUsedAt,
  storedIn: p.backedUp ? '동기화되는 패스키 (예: 구글 비밀번호 관리자 · iCloud 키체인)' : (p.backupEligible ? '동기화 가능 패스키 (아직 백업 안 됨)' : '기기에 묶인 패스키 (예: Windows Hello · 보안 키)'),
  transports: p.transports,
  usedForThisSession: p.credentialID === currentId,
});

// ---------- API ----------
const routes = {
  'GET /api/me': (req, res) => {
    const s = getSession(req);
    const user = s && s.userId ? store.users.byId(s.userId) : null;
    if (!user) {
      return send(res, 200, {
        loggedIn: false,
        allowFirstPasskey: ALLOW_FIRST_PASSKEY,
        demoAccounts: store.users.list().map((name) => ({ username: name, hasPasskey: store.passkeys.forUser(store.users.byUsername(name).id).length > 0 })),
      });
    }
    send(res, 200, { loggedIn: true, username: user.username, displayName: user.displayName, passkeyCount: store.passkeys.forUser(user.id).length });
  },

  // ---- 카드 2: 등록 ----
  'POST /api/register/options': async (req, res) => {
    const body = await readJson(req);
    const s = getOrCreateSession(req, res);
    let user; let mode;
    if (s.userId) {
      user = store.users.byId(s.userId); mode = 'add'; // 로그인한 상태: 내 계정에만 추가 (body.account는 무시)
    } else {
      if (!ALLOW_FIRST_PASSKEY) return send(res, 403, { error: 'registration_closed', message: '새 패스키 등록은 닫혀 있습니다. 기존 패스키로 들어간 뒤 추가하세요.' });
      user = store.users.byUsername(String(body.account || ''));
      if (!user) return send(res, 404, { error: 'no_such_account', message: '데모 계정은 demo-a, demo-b 두 개뿐입니다.' });
      if (store.passkeys.forUser(user.id).length > 0) {
        return send(res, 403, { error: 'account_already_has_passkey', message: '이미 패스키가 있는 계정입니다. 그 패스키로 먼저 들어간 뒤에만 새 패스키를 추가할 수 있습니다.' });
      }
      mode = 'first';
    }
    const challenge = wa.newChallenge();
    const name = cleanName(body.name, `패스키 ${new Date().toISOString().slice(0, 10)}`);
    s.pendingReg = { challenge, userId: user.id, name, mode, expires: Date.now() + CHALLENGE_TTL_MS };
    console.log(`[register/options] user=${user.username} mode=${mode} challenge=${mask(challenge)} 서버에 보관(5분)`);
    send(res, 200, {
      challenge,
      rp: { name: 'EUNSU.INFRA · T08', id: RP_ID },
      user: { id: user.id, name: user.username, displayName: user.displayName },
      pubKeyCredParams: wa.PUB_KEY_CRED_PARAMS,
      timeout: 120000,
      attestation: 'none',
      excludeCredentials: store.passkeys.forUser(user.id).map((p) => ({ type: 'public-key', id: p.credentialID, transports: p.transports })),
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'preferred' },
    });
  },

  'POST /api/register/verify': async (req, res) => {
    const body = await readJson(req);
    const s = getSession(req);
    const taken = takePending(s, 'pendingReg', body);
    if (taken.error) { const [st, error, message] = taken.error; return send(res, st, { error, message }); }
    const { pending } = taken;
    if (pending.mode === 'add' && s.userId !== pending.userId) return send(res, 403, { error: 'session_changed', message: '등록을 시작한 계정과 지금 계정이 다릅니다.' });
    let result;
    try {
      result = wa.verifyRegistration({ response: body, expectedChallenge: pending.challenge, expectedOrigin: ORIGIN, rpID: RP_ID });
    } catch (e) {
      console.log(`[register/verify] 실패 ${e.code || e.message}`);
      return send(res, 400, { error: e.code || 'verification_failed', message: e.message, saved: false });
    }
    if (store.passkeys.byCredentialId(result.credentialID)) return send(res, 409, { error: 'already_registered', message: '이미 등록된 패스키입니다.', saved: false });
    const rec = store.passkeys.add({
      credentialID: result.credentialID, userId: pending.userId, publicKey: result.publicKey, alg: result.alg,
      counter: result.counter, transports: result.transports, name: pending.name, createdAt: new Date().toISOString(),
      backedUp: result.backedUp, backupEligible: result.backupEligible, aaguid: result.aaguid, lastUsedAt: null,
    });
    const user = store.users.byId(pending.userId);
    console.log(`[register/verify] 저장 user=${user.username} name="${rec.name}" credential=${mask(rec.credentialID)}`);
    send(res, 200, {
      saved: true,
      account: user.username,
      stored: { credentialID: rec.credentialID, name: rec.name, alg: rec.alg, publicKey: rec.publicKey, createdAt: rec.createdAt },
      note: '서버에 저장된 값은 COSE 형식의 "공개키"입니다. 비밀번호가 아니며, 개인키는 기기를 떠나지 않습니다.',
      next: pending.mode === 'first' ? '이제 "패스키로 들어가기"를 눌러 로그인하세요.' : '패스키 목록에 추가되었습니다.',
    });
  },

  'POST /api/register/cancel': (req, res) => {
    const s = getSession(req);
    if (s) s.pendingReg = null;
    console.log('[register/cancel] 등록 취소 — 아무것도 저장하지 않음');
    send(res, 200, { saved: false, message: '등록을 취소했습니다. 서버에는 아무것도 저장되지 않았습니다.' });
  },

  // ---- 카드 3: 로그인 ----
  'POST /api/login/options': async (req, res) => {
    const body = await readJson(req);
    const s = getOrCreateSession(req, res);
    const challenge = wa.newChallenge();
    const user = body.account ? store.users.byUsername(String(body.account)) : null;
    const allow = user ? store.passkeys.forUser(user.id).map((p) => ({ type: 'public-key', id: p.credentialID, transports: p.transports })) : [];
    s.pendingLogin = { challenge, allowIds: allow.length ? allow.map((a) => a.id) : null, expires: Date.now() + CHALLENGE_TTL_MS };
    console.log(`[login/options] challenge=${mask(challenge)} 서버에 보관(5분)`);
    send(res, 200, { challenge, rpId: RP_ID, timeout: 120000, userVerification: 'preferred', allowCredentials: allow });
  },

  'POST /api/login/verify': async (req, res) => {
    const body = await readJson(req);
    const s = getSession(req);
    const taken = takePending(s, 'pendingLogin', body);
    if (taken.error) { const [st, error, message] = taken.error; console.log(`[login/verify] 거절 ${error}`); return send(res, st, { error, message }); }
    const { pending } = taken;
    const cred = store.passkeys.byCredentialId(String(body.id || ''));
    if (!cred) { console.log('[login/verify] 거절 unknown_credential'); return send(res, 401, { error: 'unknown_credential', message: '등록되지 않았거나 삭제된 패스키입니다.' }); }
    if (pending.allowIds && !pending.allowIds.includes(cred.credentialID)) return send(res, 401, { error: 'credential_not_allowed', message: '선택한 계정의 패스키가 아닙니다.' });
    const user = store.users.byId(cred.userId);
    // userHandle = 등록 때 보낸 user.id(base64url). 패스키가 다른 계정 것이면 거절
    if (body.response && body.response.userHandle && body.response.userHandle !== user.id) {
      console.log('[login/verify] 거절 user_handle_mismatch');
      return send(res, 401, { error: 'user_handle_mismatch', message: '패스키의 사용자 정보가 맞지 않습니다.' });
    }
    let result;
    try {
      result = wa.verifyAuthentication({ response: body, expectedChallenge: pending.challenge, expectedOrigin: ORIGIN, rpID: RP_ID, credential: cred });
    } catch (e) {
      console.log(`[login/verify] 거절 ${e.code || e.message}`);
      return send(res, 401, { error: e.code || 'verification_failed', message: e.message });
    }
    store.passkeys.update(cred.credentialID, { counter: result.newCounter, lastUsedAt: new Date().toISOString() });
    // 세션 고정 공격 방지: 로그인 성공 시 세션 ID를 새로 발급
    sessions.delete(s.sid);
    const ns = createSession(res, { userId: user.id, credentialID: cred.credentialID });
    console.log(`[login/verify] 성공 user=${user.username} passkey="${cred.name}" 새 세션=${mask(ns.sid)}`);
    send(res, 200, { loggedIn: true, username: user.username, passkey: cred.name, session: 'HttpOnly 쿠키(t08_sid)로 발급 — 값은 화면과 기록에서 가림' });
  },

  'POST /api/logout': (req, res) => {
    const s = getSession(req);
    destroySession(s, res);
    console.log(`[logout] 세션 삭제 ${s ? mask(s.sid) : '(세션 없음)'}`);
    send(res, 200, { loggedOut: true, message: '서버에서 세션을 지웠습니다. 같은 쿠키로 다시 요청하면 401입니다.' });
  },

  // ---- 카드 1·5: 비공개 자리 ----
  'GET /api/private': (req, res, url) => {
    const s = getSession(req);
    const user = s && s.userId ? store.users.byId(s.userId) : null;
    if (!user) return loginRequired(res);
    const requested = url.searchParams.get('user') || url.searchParams.get('account');
    send(res, 200, {
      owner: user.username,
      requestedUser: requested || null,
      note: requested && requested !== user.username ? '주소에 다른 계정을 적어도 무시합니다. 누구의 자료인지는 세션으로만 정합니다.' : undefined,
      items: user.privateItems,
    });
  },

  // ---- 카드 4: 패스키 목록·삭제 ----
  'GET /api/passkeys': (req, res) => {
    const s = getSession(req);
    const user = s && s.userId ? store.users.byId(s.userId) : null;
    if (!user) return loginRequired(res);
    send(res, 200, { owner: user.username, passkeys: store.passkeys.forUser(user.id).map((p) => publicPasskey(p, s.credentialID)) });
  },

  'GET /api/passkeys/export': (req, res) => {
    const s = getSession(req);
    const user = s && s.userId ? store.users.byId(s.userId) : null;
    if (!user) return loginRequired(res);
    // 공개키만 담긴 기록 (SEED_PASSKEYS 환경변수용). 개인키·세션 값 없음.
    send(res, 200, store.passkeys.forUser(user.id).map((p) => ({ username: user.username, credentialID: p.credentialID, publicKey: p.publicKey, alg: p.alg, name: p.name, createdAt: p.createdAt, transports: p.transports, backedUp: p.backedUp })));
  },
};

// 경로에 값이 들어가는 라우트
const paramRoutes = [
  {
    method: 'GET', re: /^\/api\/private\/([A-Za-z0-9_-]{1,40})$/,
    handler: (req, res, m) => {
      const s = getSession(req);
      const user = s && s.userId ? store.users.byId(s.userId) : null;
      if (!user) return loginRequired(res);
      if (m[1] !== user.username) {
        console.log(`[private] 거절 ${user.username} → ${m[1]}의 자료 요청`);
        return send(res, 403, { error: 'forbidden', message: '다른 계정의 비공개 자료는 볼 수 없습니다.' });
      }
      send(res, 200, { owner: user.username, items: user.privateItems });
    },
  },
  {
    method: 'DELETE', re: /^\/api\/passkeys\/([A-Za-z0-9_-]{1,1400})$/,
    handler: (req, res, m) => {
      const s = getSession(req);
      const user = s && s.userId ? store.users.byId(s.userId) : null;
      if (!user) return loginRequired(res);
      const p = store.passkeys.byCredentialId(m[1]);
      if (!p || p.userId !== user.id) {
        console.log(`[passkeys] 거절 ${user.username} → 남의(또는 없는) 패스키 삭제 시도`);
        return send(res, 403, { error: 'not_your_passkey', message: '내 계정의 패스키만 지울 수 있습니다.' });
      }
      const mine = store.passkeys.forUser(user.id);
      if (mine.length <= 1) {
        return send(res, 409, { error: 'last_passkey', message: '마지막 남은 패스키는 지울 수 없습니다. 지우면 이 계정에 들어갈 방법이 없어집니다. 새 패스키를 먼저 추가하세요.' });
      }
      store.passkeys.remove(p.credentialID);
      console.log(`[passkeys] 삭제 user=${user.username} name="${p.name}"`);
      send(res, 200, { deleted: true, name: p.name, remaining: mine.length - 1, message: '삭제한 패스키로는 더 이상 들어올 수 없습니다.' });
    },
  },
];

// ---------- 정적 파일 ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

function serveStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 400, 'bad path');
  fs.readFile(file, (err, data) => {
    if (err) return send(res, 404, 'Not Found');
    const type = MIME[path.extname(file)] || 'application/octet-stream';
    send(res, 200, data, { 'Content-Type': type, 'Cache-Control': type.startsWith('text/html') ? 'no-store' : 'public, max-age=300' });
  });
}

// ---------- 서버 ----------
const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url, ORIGIN);
  res.on('finish', () => {
    const s = getSessionSilently(req);
    const user = s && s.userId ? (store.users.byId(s.userId) || {}).username : '-';
    console.log(`[${new Date().toISOString()}] ${req.method} ${url.pathname}${url.search} → ${res.statusCode} sid=${mask(parseCookies(req)[COOKIE_NAME])} user=${user} ${Date.now() - started}ms`);
  });
  try {
    // 상태를 바꾸는 요청은 같은 출처에서 온 것만 받는다 (CSRF 방지)
    if (['POST', 'DELETE', 'PUT', 'PATCH'].includes(req.method)) {
      const o = req.headers.origin;
      if (o && o !== ORIGIN) return send(res, 403, { error: 'bad_origin', message: '다른 사이트에서 온 요청은 받지 않습니다.' });
    }
    const key = `${req.method} ${url.pathname}`;
    if (routes[key]) return await routes[key](req, res, url);
    for (const r of paramRoutes) {
      const m = r.method === req.method && url.pathname.match(r.re);
      if (m) return await r.handler(req, res, m, url);
    }
    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'not_found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed');
    return serveStatic(req, res, url);
  } catch (e) {
    const status = e.status || 500;
    if (status === 500) console.error(e);
    send(res, status, { error: status === 500 ? 'server_error' : 'bad_request', message: status === 500 ? '서버 오류' : e.message });
  }
});

function getSessionSilently(req) {
  const sid = parseCookies(req)[COOKIE_NAME];
  return sid ? sessions.get(sid) : null;
}

store.load();
server.listen(PORT, () => {
  console.log(`T08 passkey server: ${ORIGIN} (rpID=${RP_ID}, 첫 패스키 등록 ${ALLOW_FIRST_PASSKEY ? '허용' : '닫힘'})`);
});
