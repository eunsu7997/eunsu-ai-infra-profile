'use strict';
// 아주 단순한 JSON 파일 저장소. 저장 내용: 계정, 패스키(공개키), 비공개 자료(만들어 넣은 내용)
// 비밀번호 칸은 어디에도 없다.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, '..', 'data', 'db.json');

// 데모 계정 2개. 비공개 자리에 넣은 내용은 전부 만들어 넣은 것(실제 개인정보 아님).
const SEED_USERS = [
  {
    username: 'demo-a',
    displayName: '은수 A (데모)',
    privateItems: [
      { title: '준비 중인 프로젝트 메모', body: 'KubeLLM-Ops: GPU 노드 장애 주입 시나리오 3개 정리하기 (만들어 넣은 메모)' },
      { title: '지원하려는 곳 목록', body: '가상회사 A 인프라팀 · 가상회사 B 플랫폼팀 · 가상회사 C MLOps팀 (예시)' },
      { title: '이번 주 회고', body: '패스키는 비밀번호 대신 "기기가 가진 개인키로 서명"하는 방식이라는 걸 직접 붙여 보며 이해함.' },
    ],
  },
  {
    username: 'demo-b',
    displayName: '은수 B (데모)',
    privateItems: [
      { title: 'B 계정 전용 메모', body: '이 내용은 B 계정으로 들어왔을 때만 보여야 한다 (만들어 넣은 내용)' },
      { title: 'B 계정 공부 계획', body: '다음 주: Prometheus 알람 규칙 직접 써 보기 (예시)' },
      { title: 'B 계정 회고', body: 'A 계정 세션으로 이 자료를 요청하면 403이 나와야 한다.' },
    ],
  },
];

let db = null;

function load() {
  if (db) return db;
  try {
    db = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    db = { users: [], passkeys: [] };
  }
  // 데모 계정이 없으면 만든다
  for (const s of SEED_USERS) {
    if (!db.users.find((u) => u.username === s.username)) {
      db.users.push({
        id: crypto.randomBytes(16).toString('base64url'), // WebAuthn user.id (이름과 무관한 무작위 값)
        username: s.username,
        displayName: s.displayName,
        privateItems: s.privateItems,
        createdAt: new Date().toISOString(),
      });
    }
  }
  // 선택: 재시작 때 사라지는 무료 호스팅을 위해, 환경변수로 공개키 기록을 다시 넣을 수 있다
  // SEED_PASSKEYS='[{"username":"demo-a","credentialID":"...","publicKey":"...","alg":-7,"name":"...","createdAt":"..."}]'
  if (process.env.SEED_PASSKEYS) {
    try {
      for (const p of JSON.parse(process.env.SEED_PASSKEYS)) {
        const user = db.users.find((u) => u.username === p.username);
        if (!user || db.passkeys.find((k) => k.credentialID === p.credentialID)) continue;
        db.passkeys.push({
          credentialID: p.credentialID, userId: user.id, publicKey: p.publicKey, alg: p.alg,
          counter: 0, transports: p.transports || [], name: p.name || '복원한 패스키',
          createdAt: p.createdAt || new Date().toISOString(), backedUp: !!p.backedUp, lastUsedAt: null,
          restoredFromEnv: true,
        });
      }
    } catch (e) {
      console.error('[store] SEED_PASSKEYS를 읽지 못했습니다:', e.message);
    }
  }
  save();
  return db;
}

function save() {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

const users = {
  byUsername: (name) => load().users.find((u) => u.username === name) || null,
  byId: (id) => load().users.find((u) => u.id === id) || null,
  list: () => load().users.map((u) => u.username),
};

const passkeys = {
  forUser: (userId) => load().passkeys.filter((p) => p.userId === userId),
  byCredentialId: (cid) => load().passkeys.find((p) => p.credentialID === cid) || null,
  add(rec) { load().passkeys.push(rec); save(); return rec; },
  update(cid, fields) {
    const p = passkeys.byCredentialId(cid);
    if (p) { Object.assign(p, fields); save(); }
    return p;
  },
  remove(cid) {
    const d = load();
    const before = d.passkeys.length;
    d.passkeys = d.passkeys.filter((p) => p.credentialID !== cid);
    save();
    return d.passkeys.length < before;
  },
};

module.exports = { users, passkeys, load };
