/**
 * 서버 전용 비밀값 암호화.
 *
 * Google refresh token처럼 데이터베이스에 남겨야 하는 비밀값을 감싼다.
 * 설계 문서 10.5절: refresh token은 서버 전용으로 암호화 저장한다.
 *
 * AES-256-GCM을 쓴다. 인증 태그가 함께 들어가므로, 저장된 값이 조금이라도
 * 바뀌면 복호화 단계에서 드러난다. 암호문만 바꿔치기하는 공격이 통하지 않는다.
 *
 * 매번 새 IV를 만든다. 같은 값을 두 번 암호화해도 결과가 달라야,
 * 데이터베이스를 들여다본 사람이 "두 사용자가 같은 토큰을 쓴다"는 것조차 알 수 없다.
 *
 * 순수 모듈이라 단위 테스트로 검증한다. 환경변수를 직접 읽지 않는다.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;

/** 저장 형식의 판. 나중에 방식을 바꿀 때 옛 값을 구분할 수 있게 한다. */
const FORMAT_VERSION = "v1";

/**
 * 환경변수의 키 문자열을 32바이트 키로 바꾼다.
 *
 * base64와 hex를 모두 받는다. 어느 쪽으로 만들었든 동작하게 하되,
 * 길이가 맞지 않으면 분명하게 거부한다. 짧은 키를 조용히 늘려 쓰면
 * 암호화가 걸린 것처럼 보이지만 실제 강도는 그만큼 낮아진다.
 *
 * 오류 메시지에 키 값을 넣지 않는다.
 */
export function parseEncryptionKey(raw: string): Buffer {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    throw new Error(
      "[ThreadMark] 암호화 키가 비어 있습니다. TOKEN_ENCRYPTION_KEY를 확인하세요.",
    );
  }

  const candidates: Buffer[] = [];

  if (/^[0-9a-fA-F]+$/.test(trimmed) && trimmed.length === KEY_BYTES * 2) {
    candidates.push(Buffer.from(trimmed, "hex"));
  }

  try {
    candidates.push(Buffer.from(trimmed, "base64"));
  } catch {
    // base64가 아니면 아래에서 길이 검사에 걸린다.
  }

  const key = candidates.find((candidate) => candidate.length === KEY_BYTES);

  if (!key) {
    throw new Error(
      `[ThreadMark] 암호화 키는 ${KEY_BYTES}바이트여야 합니다. ` +
        "base64 또는 hex로 인코딩된 256비트 키를 사용하세요.",
    );
  }

  return key;
}

/**
 * 비밀값을 암호화한다.
 *
 * 결과는 "v1.<iv>.<tag>.<ciphertext>" 형태의 문자열이며 전부 base64다.
 * 한 컬럼에 담아 옮길 수 있도록 하나로 합친다.
 */
export function encryptSecret(plaintext: string, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new Error("[ThreadMark] 암호화 키 길이가 올바르지 않습니다.");
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [
    FORMAT_VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(".");
}

/**
 * 암호화된 비밀값을 되돌린다.
 *
 * 값이 손상되었거나 다른 키로 암호화된 경우 예외를 던진다.
 * 조용히 빈 값을 돌려주면 "토큰이 없다"와 "토큰이 손상되었다"를 구분할 수 없다.
 */
export function decryptSecret(payload: string, key: Buffer): string {
  if (key.length !== KEY_BYTES) {
    throw new Error("[ThreadMark] 암호화 키 길이가 올바르지 않습니다.");
  }

  const parts = payload.split(".");

  if (parts.length !== 4 || parts[0] !== FORMAT_VERSION) {
    throw new Error("[ThreadMark] 저장된 비밀값의 형식을 알 수 없습니다.");
  }

  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ciphertext = Buffer.from(parts[3], "base64");

  if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) {
    throw new Error("[ThreadMark] 저장된 비밀값이 손상되었습니다.");
  }

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ]).toString("utf8");
}
