// 패스키 목록·추가·삭제 (카드 4)
(function () {
  const $ = (id) => document.getElementById(id);
  const fmt = (iso) => (iso ? new Date(iso).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const msg = (text, kind) => { const el = $('pkMsg'); el.textContent = text || ''; el.dataset.kind = kind || ''; };

  async function refresh() {
    const r = await T08.api('/api/passkeys');
    if (r.status === 401) { $('pkLocked').hidden = false; $('pkOpen').hidden = true; return; }
    $('pkLocked').hidden = true; $('pkOpen').hidden = false;
    $('pkOwner').textContent = r.data.owner;
    $('pkCount').textContent = r.data.passkeys.length;
    const tbody = $('pkRows');
    tbody.replaceChildren();
    for (const p of r.data.passkeys) {
      const tr = document.createElement('tr');
      const cells = [p.name + (p.usedForThisSession ? ' (지금 로그인에 사용)' : ''), fmt(p.createdAt), fmt(p.lastUsedAt), p.storedIn];
      for (const c of cells) { const td = document.createElement('td'); td.textContent = c; tr.append(td); }
      const td = document.createElement('td');
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'button secondary danger'; btn.textContent = '삭제';
      btn.setAttribute('aria-label', `${p.name} 패스키 삭제`);
      if (r.data.passkeys.length <= 1) { btn.disabled = true; btn.title = '마지막 패스키는 지울 수 없습니다'; }
      btn.addEventListener('click', async () => {
        const d = await T08.api(`/api/passkeys/${encodeURIComponent(p.credentialID)}`, { method: 'DELETE' });
        msg(d.data ? d.data.message : '삭제 실패', d.ok ? 'ok' : 'error');
        refresh();
      });
      td.append(btn); tr.append(td);
      tbody.append(tr);
    }
    if (r.data.passkeys.length <= 1) msg('패스키가 하나뿐입니다. 기기를 잃어버리면 들어올 수 없으니 하나 더 추가하세요. (마지막 패스키는 삭제할 수 없습니다)', 'warn');
  }

  document.addEventListener('DOMContentLoaded', () => {
    $('pkAddBtn').addEventListener('click', async () => {
      msg('기기에서 새 패스키를 만드는 중…');
      const r = await T08.register({ name: $('pkName').value });
      msg(r.data ? (r.ok ? `패스키 "${r.data.stored.name}"를 추가했습니다.` : r.data.message) : '등록 실패', r.ok ? 'ok' : 'error');
      refresh();
    });
    refresh();
  });
})();
