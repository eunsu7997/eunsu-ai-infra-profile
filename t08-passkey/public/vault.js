// 소개 페이지 아래 "나만 보는 자리" — 내용은 로그인 후 /api/private 응답으로만 채운다
(function () {
  const $ = (id) => document.getElementById(id);
  const msg = (text, kind) => {
    const el = $('vaultMsg');
    el.textContent = text || '';
    el.dataset.kind = kind || '';
  };

  function renderItems(items) {
    const ul = $('vaultItems');
    ul.replaceChildren();
    for (const it of items) {
      const li = document.createElement('li');
      const strong = document.createElement('strong');
      strong.textContent = it.title;
      const span = document.createElement('span');
      span.textContent = it.body;
      li.append(strong, span);
      ul.append(li);
    }
  }

  async function refresh() {
    const me = await T08.api('/api/me');
    if (me.data && me.data.loggedIn) {
      const priv = await T08.api('/api/private');
      if (priv.ok) {
        $('vaultWho').textContent = `${priv.data.owner}`;
        renderItems(priv.data.items);
        $('vault-locked').hidden = true;
        $('vault-open').hidden = false;
        return;
      }
    }
    // 잠긴 상태: 비공개 내용을 화면에서도 지운다
    $('vaultItems').replaceChildren();
    $('vault-open').hidden = true;
    $('vault-locked').hidden = false;

    const fp = $('firstPasskey');
    const free = (me.data && me.data.allowFirstPasskey) ? me.data.demoAccounts.filter((a) => !a.hasPasskey) : [];
    fp.hidden = free.length === 0;
    const sel = $('firstAccount');
    sel.replaceChildren(...free.map((a) => { const o = document.createElement('option'); o.value = a.username; o.textContent = a.username; return o; }));
  }

  document.addEventListener('DOMContentLoaded', () => {
    if (!$('vault')) return;
    if (!T08.supported()) {
      msg('이 브라우저는 패스키(WebAuthn)를 지원하지 않습니다. 최신 Chrome·Edge·Safari에서 열어 주세요.', 'error');
    }

    $('loginBtn').addEventListener('click', async () => {
      msg('기기에서 패스키를 확인하는 중…');
      const r = await T08.login();
      if (r.ok) { msg(`들어왔습니다 (${r.data.passkey}).`, 'ok'); await refresh(); }
      else msg(r.data ? r.data.message : '로그인 실패', 'error');
    });

    $('firstRegisterBtn').addEventListener('click', async () => {
      msg('기기에서 패스키를 만드는 중…');
      const r = await T08.register({ account: $('firstAccount').value, name: $('firstName').value });
      if (r.ok) msg(`패스키 "${r.data.stored.name}"를 만들었습니다. ${r.data.next}`, 'ok');
      else msg(r.data ? r.data.message : '등록 실패', 'error');
      await refresh();
    });

    $('logoutBtn').addEventListener('click', async () => {
      await T08.api('/api/logout', { method: 'POST', body: {} });
      msg('로그아웃했습니다. 비공개 자리가 다시 잠겼습니다.', 'ok');
      await refresh();
    });

    refresh();
  });
})();
