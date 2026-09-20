/**
 * 인증 리디렉션 URL 유틸리티 단위 테스트.
 *
 * sanitizeNextPath는 오픈 리디렉션을 막는 함수다. 여기가 뚫리면 ThreadMark
 * 로그인 링크가 외부 피싱 사이트로 사용자를 보내는 통로가 되므로,
 * 우회 수법을 하나씩 명시적으로 검증한다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_REDIRECT_PATH,
  originFromHeaders,
  sanitizeNextPath,
} from "../src/lib/auth/request-url.ts";

test("같은 출처의 경로는 그대로 통과한다", () => {
  const allowed = [
    "/",
    "/home",
    "/inbox",
    "/sources/123",
    "/sources/123?tab=notes",
    "/sources/123?tab=notes#top",
    "/library/papers",
  ];

  for (const path of allowed) {
    assert.equal(sanitizeNextPath(path), path, `${path}는 허용되어야 한다`);
  }
});

test("절대 URL은 기본 경로로 대체한다", () => {
  const blocked = [
    "https://evil.example",
    "http://evil.example/login",
    "//evil.example",
    "///evil.example",
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "mailto:someone@example.com",
  ];

  for (const path of blocked) {
    assert.equal(
      sanitizeNextPath(path),
      DEFAULT_REDIRECT_PATH,
      `${path}는 차단되어야 한다`,
    );
  }
});

test("역슬래시를 이용한 우회를 차단한다", () => {
  // 일부 브라우저는 "/\evil.example"을 "//evil.example"처럼 해석한다.
  const blocked = [
    "/\\evil.example",
    "/\\\\evil.example",
    "/path\\..\\..\\evil",
    "\\\\evil.example",
  ];

  for (const path of blocked) {
    assert.equal(
      sanitizeNextPath(path),
      DEFAULT_REDIRECT_PATH,
      `${path}는 차단되어야 한다`,
    );
  }
});

test("제어 문자가 섞인 값을 차단한다", () => {
  const blocked = [
    "/home\nLocation: https://evil.example",
    "/home\r\nSet-Cookie: a=b",
    "/home\tfoo",
    `/home${String.fromCharCode(0)}`,
    `/home${String.fromCharCode(0x7f)}`,
  ];

  for (const path of blocked) {
    assert.equal(
      sanitizeNextPath(path),
      DEFAULT_REDIRECT_PATH,
      `제어 문자가 포함된 값은 차단되어야 한다`,
    );
  }
});

test("공백은 제어 문자가 아니므로 막지 않는다", () => {
  // 과하게 막으면 정상적인 경로가 깨진다. 차단 대상은 제어 문자다.
  assert.equal(sanitizeNextPath("/my notes"), "/my notes");
});

test("문자열이 아니거나 비어 있으면 기본 경로를 쓴다", () => {
  const blocked = [null, undefined, "", 42, {}, [], ["/home"], true];

  for (const value of blocked) {
    assert.equal(sanitizeNextPath(value), DEFAULT_REDIRECT_PATH);
  }
});

test("기본 경로는 루트다", () => {
  assert.equal(DEFAULT_REDIRECT_PATH, "/");
});

test("originFromHeaders: 로컬 개발은 http를 쓴다", () => {
  const headers = new Headers({ host: "localhost:3000" });

  assert.equal(originFromHeaders(headers), "http://localhost:3000");
});

test("originFromHeaders: 배포 환경은 https를 기본으로 쓴다", () => {
  const headers = new Headers({ host: "thread-mark.vercel.app" });

  assert.equal(originFromHeaders(headers), "https://thread-mark.vercel.app");
});

test("originFromHeaders: x-forwarded-host가 host보다 우선한다", () => {
  const headers = new Headers({
    host: "internal.vercel.internal",
    "x-forwarded-host": "thread-mark.vercel.app",
    "x-forwarded-proto": "https",
  });

  assert.equal(originFromHeaders(headers), "https://thread-mark.vercel.app");
});

test("originFromHeaders: 프록시를 여러 번 거친 헤더는 첫 값을 쓴다", () => {
  const headers = new Headers({
    "x-forwarded-host": "thread-mark.vercel.app, internal.example",
    "x-forwarded-proto": "https, http",
  });

  assert.equal(originFromHeaders(headers), "https://thread-mark.vercel.app");
});

test("originFromHeaders: host가 없으면 null을 반환한다", () => {
  assert.equal(originFromHeaders(new Headers()), null);
});
