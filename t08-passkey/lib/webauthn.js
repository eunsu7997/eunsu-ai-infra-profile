'use strict';
// 외부 라이브러리 없이 Node 내장 crypto로 구현한 WebAuthn(패스키) 서버 검증
// 범위: attestation "none" 등록 + 로그인 서명 검증. (기기 제조사 인증서 검증은 하지 않음)
const crypto = require('crypto');
const { decodeFirst } = require('./cbor');

const b64url = {
  encode: (buf) => Buffer.from(buf).toString('base64url'),
  decode: (str) => {
    if (typeof str !== 'string' || !/^[A-Za-z0-9_-]*$/.test(str)) throw new WebAuthnError('bad_base64url', 'base64url 형식이 아닙니다');
    return Buffer.from(str, 'base64url');
  },
};

class WebAuthnError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

const sha256 = (data) => crypto.createHash('sha256').update(data).digest();

function newChallenge() {
  return b64url.encode(crypto.randomBytes(32));
}

// 지원 알고리즘: ES256(-7), EdDSA(-8), RS256(-257)
const PUB_KEY_CRED_PARAMS = [
  { type: 'public-key', alg: -7 },
  { type: 'public-key', alg: -8 },
  { type: 'public-key', alg: -257 },
];

function parseClientData(clientDataB64, expectedType, expectedChallenge, expectedOrigin) {
  const raw = b64url.decode(clientDataB64);
  let cd;
  try { cd = JSON.parse(raw.toString('utf8')); } catch { throw new WebAuthnError('bad_client_data', 'clientDataJSON을 읽을 수 없습니다'); }
  if (cd.type !== expectedType) throw new WebAuthnError('wrong_type', `type이 ${expectedType}이 아닙니다`);
  if (cd.challenge !== expectedChallenge) throw new WebAuthnError('challenge_mismatch', '서버가 보낸 질문(challenge)과 다릅니다');
  if (cd.origin !== expectedOrigin) throw new WebAuthnError('origin_mismatch', `origin이 다릅니다: ${cd.origin}`);
  if (cd.crossOrigin === true) throw new WebAuthnError('cross_origin', 'cross-origin 요청은 받지 않습니다');
  return { raw, data: cd };
}

// authenticatorData 구조: rpIdHash(32) | flags(1) | signCount(4) | [attestedCredentialData] | [extensions]
function parseAuthData(authData) {
  if (authData.length < 37) throw new WebAuthnError('bad_auth_data', 'authenticatorData가 너무 짧습니다');
  const rpIdHash = authData.subarray(0, 32);
  const flagsByte = authData[32];
  const flags = {
    up: !!(flagsByte & 0x01), // 사용자가 있었음(User Present)
    uv: !!(flagsByte & 0x04), // 사용자 확인(지문/PIN 등, User Verified)
    be: !!(flagsByte & 0x08), // 백업 가능(동기화 패스키일 수 있음)
    bs: !!(flagsByte & 0x10), // 실제로 백업(동기화)됨
    at: !!(flagsByte & 0x40), // 공개키 정보 포함
    ed: !!(flagsByte & 0x80),
  };
  const signCount = authData.readUInt32BE(33);
  const out = { rpIdHash, flags, signCount };
  if (flags.at) {
    let p = 37;
    out.aaguid = authData.subarray(p, p + 16); p += 16;
    const idLen = authData.readUInt16BE(p); p += 2;
    out.credentialId = authData.subarray(p, p + idLen); p += idLen;
    const cose = decodeFirst(authData.subarray(p));
    out.cosePublicKey = authData.subarray(p, p + cose.offset);
    out.coseMap = cose.value;
  }
  return out;
}

// COSE 공개키 → Node KeyObject
function coseToKey(coseBytes) {
  const { value: m } = decodeFirst(coseBytes);
  if (!(m instanceof Map)) throw new WebAuthnError('bad_cose', 'COSE 키 형식이 아닙니다');
  const kty = m.get(1);
  const alg = m.get(3);
  if (kty === 2 && alg === -7) { // EC2 P-256
    if (m.get(-1) !== 1) throw new WebAuthnError('bad_cose', 'P-256 곡선만 지원합니다');
    const jwk = { kty: 'EC', crv: 'P-256', x: b64url.encode(m.get(-2)), y: b64url.encode(m.get(-3)) };
    return { alg, key: crypto.createPublicKey({ key: jwk, format: 'jwk' }) };
  }
  if (kty === 1 && alg === -8) { // OKP Ed25519
    if (m.get(-1) !== 6) throw new WebAuthnError('bad_cose', 'Ed25519만 지원합니다');
    const jwk = { kty: 'OKP', crv: 'Ed25519', x: b64url.encode(m.get(-2)) };
    return { alg, key: crypto.createPublicKey({ key: jwk, format: 'jwk' }) };
  }
  if (kty === 3 && alg === -257) { // RSA
    const jwk = { kty: 'RSA', n: b64url.encode(m.get(-1)), e: b64url.encode(m.get(-2)) };
    return { alg, key: crypto.createPublicKey({ key: jwk, format: 'jwk' }) };
  }
  throw new WebAuthnError('unsupported_alg', `지원하지 않는 키 형식 kty=${kty} alg=${alg}`);
}

function verifySignature(coseBytes, data, signature) {
  const { alg, key } = coseToKey(coseBytes);
  try {
    if (alg === -7) return crypto.verify('sha256', data, { key, dsaEncoding: 'der' }, signature);
    if (alg === -8) return crypto.verify(null, data, key, signature);
    if (alg === -257) return crypto.verify('sha256', data, key, signature);
  } catch {
    return false;
  }
  return false;
}

/**
 * 등록 응답 검증
 * response: { id, rawId, type, response: { clientDataJSON, attestationObject, transports? } }
 */
function verifyRegistration({ response, expectedChallenge, expectedOrigin, rpID }) {
  if (!response || response.type !== 'public-key' || !response.response) throw new WebAuthnError('bad_request', '등록 응답 형식이 아닙니다');
  const { response: r } = response;
  parseClientData(r.clientDataJSON, 'webauthn.create', expectedChallenge, expectedOrigin);

  const { value: att } = decodeFirst(b64url.decode(r.attestationObject));
  if (!(att instanceof Map)) throw new WebAuthnError('bad_attestation', 'attestationObject 형식이 아닙니다');
  const fmt = att.get('fmt');
  const authData = att.get('authData');
  if (!Buffer.isBuffer(authData)) throw new WebAuthnError('bad_attestation', 'authData가 없습니다');

  const parsed = parseAuthData(authData);
  if (!parsed.rpIdHash.equals(sha256(Buffer.from(rpID)))) throw new WebAuthnError('rp_id_mismatch', 'rpID가 이 사이트와 다릅니다');
  if (!parsed.flags.up) throw new WebAuthnError('no_user_presence', '사용자 확인(UP) 플래그가 없습니다');
  if (!parsed.flags.at || !parsed.credentialId) throw new WebAuthnError('no_credential', '공개키 정보가 없습니다');

  const credentialID = b64url.encode(parsed.credentialId);
  if (response.id !== credentialID) throw new WebAuthnError('id_mismatch', 'credential id가 일치하지 않습니다');

  // 공개키를 실제로 읽을 수 있는지 미리 확인 (못 읽으면 저장하지 않음)
  const { alg } = coseToKey(parsed.cosePublicKey);

  return {
    fmt,
    credentialID,
    publicKey: b64url.encode(parsed.cosePublicKey), // COSE 형식 "공개키" — 비밀번호도 개인키도 아님
    alg,
    counter: parsed.signCount,
    userVerified: parsed.flags.uv,
    backupEligible: parsed.flags.be,
    backedUp: parsed.flags.bs,
    aaguid: parsed.aaguid.toString('hex'),
    transports: Array.isArray(r.transports) ? r.transports.filter((t) => typeof t === 'string').slice(0, 6) : [],
  };
}

/**
 * 로그인 응답 검증
 * response: { id, type, response: { clientDataJSON, authenticatorData, signature, userHandle? } }
 * credential: 저장된 { publicKey, counter }
 */
function verifyAuthentication({ response, expectedChallenge, expectedOrigin, rpID, credential }) {
  if (!response || response.type !== 'public-key' || !response.response) throw new WebAuthnError('bad_request', '로그인 응답 형식이 아닙니다');
  const { response: r } = response;
  const { raw: clientDataRaw } = parseClientData(r.clientDataJSON, 'webauthn.get', expectedChallenge, expectedOrigin);

  const authData = b64url.decode(r.authenticatorData);
  const parsed = parseAuthData(authData);
  if (!parsed.rpIdHash.equals(sha256(Buffer.from(rpID)))) throw new WebAuthnError('rp_id_mismatch', 'rpID가 이 사이트와 다릅니다');
  if (!parsed.flags.up) throw new WebAuthnError('no_user_presence', '사용자 확인(UP) 플래그가 없습니다');

  // 서명 대상 = authenticatorData || SHA-256(clientDataJSON)
  const signedData = Buffer.concat([authData, sha256(clientDataRaw)]);
  const ok = verifySignature(b64url.decode(credential.publicKey), signedData, b64url.decode(r.signature));
  if (!ok) throw new WebAuthnError('signature_invalid', '서명이 저장된 공개키와 맞지 않습니다');

  // 서명 카운터: 둘 중 하나라도 0이 아니면 반드시 증가해야 함 (복제 기기 의심)
  if ((parsed.signCount > 0 || credential.counter > 0) && parsed.signCount <= credential.counter) {
    throw new WebAuthnError('counter_not_increased', '서명 카운터가 증가하지 않았습니다(복제 의심)');
  }
  return { newCounter: parsed.signCount, userVerified: parsed.flags.uv, backedUp: parsed.flags.bs };
}

module.exports = {
  b64url, sha256, newChallenge, PUB_KEY_CRED_PARAMS,
  verifyRegistration, verifyAuthentication, WebAuthnError,
};
