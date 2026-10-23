// 브라우저 쪽 패스키 도우미 (외부 라이브러리 없음)
(function () {
  const toBuf = (b64url) => {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64url.length + 3) % 4);
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.buffer;
  };
  const toB64url = (buf) => {
    const bytes = new Uint8Array(buf);
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };

  async function api(path, { method = 'GET', body } = {}) {
    const res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : {},
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try { data = await res.json(); } catch { /* 본문 없음 */ }
    return { status: res.status, ok: res.ok, data };
  }

  function supported() {
    return !!(window.PublicKeyCredential && navigator.credentials && navigator.credentials.create);
  }

  // 카드 2: 등록 — 서버 질문 → 기기가 열쇠 한 쌍 생성 → 공개키+서명만 서버로
  async function register({ account, name }) {
    const opt = await api('/api/register/options', { method: 'POST', body: { account, name } });
    if (!opt.ok) return opt;
    const o = opt.data;
    const publicKey = {
      ...o,
      challenge: toBuf(o.challenge),
      user: { ...o.user, id: toBuf(o.user.id) },
      excludeCredentials: (o.excludeCredentials || []).map((c) => ({ ...c, id: toBuf(c.id) })),
    };
    let cred;
    try {
      cred = await navigator.credentials.create({ publicKey });
    } catch (e) {
      // 사용자가 창을 닫거나 취소한 경우: 서버의 보관 중인 질문도 지운다
      await api('/api/register/cancel', { method: 'POST', body: {} });
      const msg = e.name === 'InvalidStateError'
        ? '이 기기에는 이미 이 계정의 패스키가 있습니다. 다른 기기(휴대폰 QR)나 다른 저장 위치를 고르세요.'
        : '패스키 등록을 취소했습니다. 서버에는 아무것도 저장되지 않았습니다.';
      return { status: 0, ok: false, cancelled: true, data: { error: e.name, message: msg } };
    }
    const body = {
      id: cred.id,
      rawId: toB64url(cred.rawId),
      type: cred.type,
      authenticatorAttachment: cred.authenticatorAttachment || null,
      response: {
        clientDataJSON: toB64url(cred.response.clientDataJSON),
        attestationObject: toB64url(cred.response.attestationObject),
        transports: cred.response.getTransports ? cred.response.getTransports() : [],
      },
    };
    return api('/api/register/verify', { method: 'POST', body });
  }

  // 카드 3: 로그인 — 서버의 새 질문에 기기가 개인키로 서명
  async function login({ account } = {}) {
    const opt = await api('/api/login/options', { method: 'POST', body: account ? { account } : {} });
    if (!opt.ok) return opt;
    const o = opt.data;
    const publicKey = {
      ...o,
      challenge: toBuf(o.challenge),
      allowCredentials: (o.allowCredentials || []).map((c) => ({ ...c, id: toBuf(c.id) })),
    };
    let cred;
    try {
      cred = await navigator.credentials.get({ publicKey });
    } catch (e) {
      return { status: 0, ok: false, cancelled: true, data: { error: e.name, message: '패스키 로그인을 취소했거나 이 기기에 맞는 패스키가 없습니다.' } };
    }
    const body = {
      id: cred.id,
      rawId: toB64url(cred.rawId),
      type: cred.type,
      response: {
        clientDataJSON: toB64url(cred.response.clientDataJSON),
        authenticatorData: toB64url(cred.response.authenticatorData),
        signature: toB64url(cred.response.signature),
        userHandle: cred.response.userHandle ? toB64url(cred.response.userHandle) : null,
      },
    };
    return api('/api/login/verify', { method: 'POST', body });
  }

  window.T08 = { api, register, login, supported };
})();
