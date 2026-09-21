/**
 * 비밀값 암호화 단위 테스트.
 *
 * 여기 담기는 값은 사용자의 Google Drive에 접근할 수 있는 refresh token이다.
 * 데이터베이스가 통째로 유출되더라도 키 없이는 쓸 수 없어야 한다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import test from "node:test";

import {
  decryptSecret,
  encryptSecret,
  parseEncryptionKey,
} from "../src/lib/crypto/secret-box.ts";

const key = randomBytes(32);
const otherKey = randomBytes(32);

test("암호화한 값을 되돌릴 수 있다", () => {
  const secret = "1//0eXaMpLe-refresh-token";
  const sealed = encryptSecret(secret, key);

  assert.notEqual(sealed, secret);
  assert.equal(decryptSecret(sealed, key), secret);
});

test("같은 값을 두 번 암호화하면 결과가 다르다", () => {
  // 결과가 같으면 데이터베이스를 본 사람이 두 사용자가 같은 토큰을 쓴다는
  // 사실을 알 수 있다. 매번 새 IV를 쓰는 이유다.
  const secret = "same-token";

  assert.notEqual(encryptSecret(secret, key), encryptSecret(secret, key));
});

test("다른 키로는 열 수 없다", () => {
  const sealed = encryptSecret("secret", key);

  assert.throws(() => decryptSecret(sealed, otherKey));
});

test("한 글자라도 고치면 열리지 않는다", () => {
  // 인증 태그가 붙어 있어 암호문만 바꿔치기하는 공격이 통하지 않는다.
  const sealed = encryptSecret("secret", key);
  const parts = sealed.split(".");
  const ciphertext = Buffer.from(parts[3], "base64");

  ciphertext[0] = ciphertext[0] ^ 0x01;
  parts[3] = ciphertext.toString("base64");

  assert.throws(() => decryptSecret(parts.join("."), key));
});

test("인증 태그를 바꾸면 열리지 않는다", () => {
  const sealed = encryptSecret("secret", key);
  const parts = sealed.split(".");
  const tag = Buffer.from(parts[2], "base64");

  tag[0] = tag[0] ^ 0x01;
  parts[2] = tag.toString("base64");

  assert.throws(() => decryptSecret(parts.join("."), key));
});

test("형식이 다른 값은 거부한다", () => {
  for (const payload of [
    "",
    "plain-text",
    "v1.only.three",
    "v2.aaaa.bbbb.cccc",
    "v1.aaaa.bbbb.cccc.dddd",
  ]) {
    assert.throws(
      () => decryptSecret(payload, key),
      `${payload}는 거부되어야 한다`,
    );
  }
});

test("빈 문자열도 암호화하고 되돌릴 수 있다", () => {
  // 토큰이 빈 값으로 오는 경우를 조용히 넘기지 않기 위해 동작을 고정한다.
  const sealed = encryptSecret("", key);

  assert.equal(decryptSecret(sealed, key), "");
});

test("긴 값과 한글도 그대로 보존한다", () => {
  const secret = `${"가".repeat(1000)} token ${"9".repeat(500)}`;
  const sealed = encryptSecret(secret, key);

  assert.equal(decryptSecret(sealed, key), secret);
});

test("base64 키를 받아들인다", () => {
  const raw = randomBytes(32).toString("base64");

  assert.equal(parseEncryptionKey(raw).length, 32);
});

test("hex 키를 받아들인다", () => {
  const raw = randomBytes(32).toString("hex");

  assert.equal(parseEncryptionKey(raw).length, 32);
});

test("앞뒤 공백이 있어도 키를 읽는다", () => {
  const raw = randomBytes(32).toString("base64");

  assert.equal(parseEncryptionKey(`  ${raw}\n`).length, 32);
});

test("길이가 모자란 키는 거부한다", () => {
  // 짧은 키를 조용히 늘려 쓰면 암호화가 걸린 것처럼 보이지만
  // 실제 강도는 그만큼 낮아진다.
  for (const raw of [
    "",
    "   ",
    "short",
    randomBytes(16).toString("base64"),
    randomBytes(31).toString("hex"),
    randomBytes(64).toString("base64"),
  ]) {
    assert.throws(() => parseEncryptionKey(raw), `${raw}는 거부되어야 한다`);
  }
});

test("키 오류 메시지에 키 값이 들어가지 않는다", () => {
  const raw = "this-is-a-secret-looking-value";

  try {
    parseEncryptionKey(raw);
    assert.fail("거부되어야 한다");
  } catch (error) {
    assert.ok(!String(error.message).includes(raw));
  }
});
