'use strict';
// WebAuthn에 필요한 만큼만 구현한 최소 CBOR 디코더 (RFC 8949)
// 지원: 정수(0,1), 바이트열(2), 문자열(3), 배열(4), 맵(5), true/false/null(7)

function decodeItem(buf, offset) {
  if (offset >= buf.length) throw new Error('CBOR: 데이터가 끝났습니다');
  const initial = buf[offset];
  const major = initial >> 5;
  const info = initial & 0x1f;
  let pos = offset + 1;

  let len;
  if (info < 24) len = info;
  else if (info === 24) { len = buf.readUInt8(pos); pos += 1; }
  else if (info === 25) { len = buf.readUInt16BE(pos); pos += 2; }
  else if (info === 26) { len = buf.readUInt32BE(pos); pos += 4; }
  else if (info === 27) {
    const big = buf.readBigUInt64BE(pos); pos += 8;
    if (big > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('CBOR: 너무 큰 정수');
    len = Number(big);
  } else throw new Error('CBOR: 지원하지 않는 길이 형식');

  switch (major) {
    case 0: return { value: len, offset: pos };
    case 1: return { value: -1 - len, offset: pos };
    case 2: {
      if (pos + len > buf.length) throw new Error('CBOR: 바이트열 길이 초과');
      return { value: buf.subarray(pos, pos + len), offset: pos + len };
    }
    case 3: {
      if (pos + len > buf.length) throw new Error('CBOR: 문자열 길이 초과');
      return { value: buf.toString('utf8', pos, pos + len), offset: pos + len };
    }
    case 4: {
      const arr = [];
      for (let i = 0; i < len; i++) {
        const r = decodeItem(buf, pos); arr.push(r.value); pos = r.offset;
      }
      return { value: arr, offset: pos };
    }
    case 5: {
      const map = new Map();
      for (let i = 0; i < len; i++) {
        const k = decodeItem(buf, pos); pos = k.offset;
        const v = decodeItem(buf, pos); pos = v.offset;
        map.set(k.value, v.value);
      }
      return { value: map, offset: pos };
    }
    case 7: {
      if (info === 20) return { value: false, offset: pos };
      if (info === 21) return { value: true, offset: pos };
      if (info === 22) return { value: null, offset: pos };
      throw new Error('CBOR: 지원하지 않는 simple 값');
    }
    default:
      throw new Error('CBOR: 지원하지 않는 타입 ' + major);
  }
}

// 버퍼 맨 앞의 CBOR 값 하나를 읽고, 읽은 길이도 돌려준다
function decodeFirst(buf) {
  return decodeItem(Buffer.from(buf), 0);
}

module.exports = { decodeFirst };
