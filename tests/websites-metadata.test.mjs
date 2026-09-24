/**
 * 웹페이지 메타데이터 읽기 단위 검사. (설계 문서 11.1절)
 *
 * 여기서 꺼내는 값은 **남이 쓴 글**이다. 우리가 모양을 정할 수 없고,
 * 잘못 적힌 HTML도 온다. 그래서 두 가지를 확인한다.
 *
 *   1. 흔한 모양에서 값을 제대로 찾는가
 *   2. 이상한 값이 와도 위험해지지 않는가
 *
 * 2번이 특히 중요하다. favicon 자리에 `javascript:`가 오는 일이 실제로
 * 있고, 그것을 화면의 링크에 그대로 넣으면 누르는 순간 실행된다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_META_TEXT_LENGTH,
  readWebsiteMetadata,
} from "../src/lib/websites/metadata.ts";

const BASE = "https://example.com/articles/one";

// -----------------------------------------------------------------------------
// 흔한 모양
// -----------------------------------------------------------------------------

test("Open Graph 값을 읽는다", () => {
  const meta = readWebsiteMetadata(
    `<html><head>
      <meta property="og:title" content="수학적 증명과 생성형 AI">
      <meta property="og:site_name" content="교육연구소">
      <meta property="og:description" content="학생이 증명을 검증하는 절차">
      <meta property="og:image" content="https://cdn.example.com/cover.png">
      <meta property="og:url" content="https://example.com/canonical">
    </head><body>본문은 읽지 않는다</body></html>`,
    BASE,
  );

  assert.equal(meta.title, "수학적 증명과 생성형 AI");
  assert.equal(meta.siteName, "교육연구소");
  assert.equal(meta.description, "학생이 증명을 검증하는 절차");
  assert.equal(meta.imageUrl, "https://cdn.example.com/cover.png");
  assert.equal(meta.canonicalUrl, "https://example.com/canonical");
});

test("Open Graph가 없으면 title과 description을 쓴다", () => {
  const meta = readWebsiteMetadata(
    `<html><head>
      <title>평범한 제목</title>
      <meta name="description" content="평범한 설명">
      <meta name="author" content="김대수">
    </head></html>`,
    BASE,
  );

  assert.equal(meta.title, "평범한 제목");
  assert.equal(meta.description, "평범한 설명");
  assert.equal(meta.author, "김대수");
});

test("일부러 적은 값을 먼저 믿는다", () => {
  // og:는 남에게 보여주려고 일부러 적은 값이고 title은 탭에 쓰려고 적은 값이다.
  const meta = readWebsiteMetadata(
    `<head><title>탭에 쓰는 제목</title>
     <meta property="og:title" content="보여주려는 제목"></head>`,
    BASE,
  );

  assert.equal(meta.title, "보여주려는 제목");
});

test("twitter 값도 받는다", () => {
  const meta = readWebsiteMetadata(
    `<head><meta name="twitter:title" content="트위터 제목">
     <meta name="twitter:description" content="트위터 설명"></head>`,
    BASE,
  );

  assert.equal(meta.title, "트위터 제목");
  assert.equal(meta.description, "트위터 설명");
});

test("canonical 링크를 읽는다", () => {
  const meta = readWebsiteMetadata(
    `<head><link rel="canonical" href="/articles/one-true"></head>`,
    BASE,
  );

  assert.equal(meta.canonicalUrl, "https://example.com/articles/one-true");
});

test("게시일을 적힌 그대로 담는다", () => {
  // 모양이 제각각이라 우리가 고치지 않는다.
  const meta = readWebsiteMetadata(
    `<head><meta property="article:published_time" content="2026-09-23T10:00:00Z"></head>`,
    BASE,
  );

  assert.equal(meta.publishedAt, "2026-09-23T10:00:00Z");
});

// -----------------------------------------------------------------------------
// favicon
// -----------------------------------------------------------------------------

test("favicon을 찾고 상대 주소를 푼다", () => {
  const meta = readWebsiteMetadata(
    `<head><link rel="icon" href="/favicon.ico"></head>`,
    BASE,
  );

  assert.equal(meta.faviconUrl, "https://example.com/favicon.ico");
});

test("rel에 값이 여럿이어도 찾는다", () => {
  // `rel="shortcut icon"`이 흔하다. 통째로 견주면 놓친다.
  const meta = readWebsiteMetadata(
    `<head><link rel="shortcut icon" href="/f.png"></head>`,
    BASE,
  );

  assert.equal(meta.faviconUrl, "https://example.com/f.png");
});

test("앞에 적힌 rel을 먼저 쓴다", () => {
  const meta = readWebsiteMetadata(
    `<head>
      <link rel="apple-touch-icon" href="/apple.png">
      <link rel="icon" href="/icon.png">
    </head>`,
    BASE,
  );

  assert.equal(meta.faviconUrl, "https://example.com/icon.png");
});

// -----------------------------------------------------------------------------
// 이상한 값이 와도 위험해지지 않는다
// -----------------------------------------------------------------------------

test("http가 아닌 주소는 담지 않는다", () => {
  /*
    favicon 자리에 data:가 오는 일이 흔하다. 그대로 담으면 그림 한 장이
    통째로 행에 들어간다. javascript:는 화면의 링크에 들어가면 실행된다.
  */
  for (const href of [
    "javascript:alert(1)",
    "data:image/png;base64,iVBORw0KGgo=",
    "file:///etc/passwd",
  ]) {
    const meta = readWebsiteMetadata(
      `<head><link rel="icon" href="${href}"></head>`,
      BASE,
    );

    assert.equal(meta.faviconUrl, null, href);
  }
});

test("그림 주소도 http만 받는다", () => {
  const meta = readWebsiteMetadata(
    `<head><meta property="og:image" content="javascript:alert(1)"></head>`,
    BASE,
  );

  assert.equal(meta.imageUrl, null);
});

test("너무 긴 글은 잘라 담는다", () => {
  const long = "가".repeat(MAX_META_TEXT_LENGTH + 100);
  const meta = readWebsiteMetadata(
    `<head><meta name="description" content="${long}"></head>`,
    BASE,
  );

  assert.equal(meta.description.length, MAX_META_TEXT_LENGTH);
});

test("본문은 읽지 않는다", () => {
  // 11.3절: 웹페이지 전체를 복제·보관하지 않는다.
  const meta = readWebsiteMetadata(
    `<head><title>머리말 제목</title></head>
     <body><meta property="og:title" content="본문에 숨긴 제목"></body>`,
    BASE,
  );

  assert.equal(meta.title, "머리말 제목");
});

test("HTML이 아니거나 비어 있으면 빈 값이다", () => {
  for (const input of ["", "   ", "{}", undefined, null, 123]) {
    const meta = readWebsiteMetadata(input, BASE);

    assert.equal(meta.title, null);
    assert.equal(meta.faviconUrl, null);
  }
});

test("값이 하나도 없어도 터지지 않는다", () => {
  const meta = readWebsiteMetadata("<html><head></head><body>x</body></html>", BASE);

  assert.deepEqual(
    { ...meta },
    {
      title: null,
      siteName: null,
      description: null,
      author: null,
      publishedAt: null,
      canonicalUrl: null,
      imageUrl: null,
      faviconUrl: null,
    },
  );
});

// -----------------------------------------------------------------------------
// 잘못 적힌 HTML
// -----------------------------------------------------------------------------

test("따옴표를 어떻게 적어도 읽는다", () => {
  // 하나라도 빠뜨리면 그 모양으로 적은 사이트에서만 값을 못 찾는다.
  for (const tag of [
    `<meta name="description" content="설명입니다">`,
    `<meta name='description' content='설명입니다'>`,
    `<meta name=description content=설명입니다>`,
  ]) {
    const meta = readWebsiteMetadata(`<head>${tag}</head>`, BASE);

    assert.equal(meta.description, "설명입니다", tag);
  }
});

test("대문자로 적은 태그도 읽는다", () => {
  const meta = readWebsiteMetadata(
    `<HEAD><META PROPERTY="OG:TITLE" CONTENT="큰 글씨 제목"></HEAD>`,
    BASE,
  );

  assert.equal(meta.title, "큰 글씨 제목");
});

test("줄바꿈과 이어진 공백을 정리한다", () => {
  const meta = readWebsiteMetadata(
    `<head><title>
       여러 줄에   걸친
       제목
     </title></head>`,
    BASE,
  );

  assert.equal(meta.title, "여러 줄에 걸친 제목");
});

test("같은 이름이 여러 번 적혀 있으면 먼저 나온 것을 쓴다", () => {
  const meta = readWebsiteMetadata(
    `<head>
      <meta property="og:title" content="첫째">
      <meta property="og:title" content="둘째">
    </head>`,
    BASE,
  );

  assert.equal(meta.title, "첫째");
});

// -----------------------------------------------------------------------------
// 글자 표기 되돌리기
// -----------------------------------------------------------------------------

test("흔한 글자 표기를 되돌린다", () => {
  const meta = readWebsiteMetadata(
    `<head><title>A &amp; B &lt;태그&gt; &quot;따옴표&quot;</title></head>`,
    BASE,
  );

  assert.equal(meta.title, 'A & B <태그> "따옴표"');
});

test("번호로 적은 글자를 되돌린다", () => {
  const meta = readWebsiteMetadata(
    `<head><title>&#54620;&#44544; &#x2014; 대시</title></head>`,
    BASE,
  );

  assert.equal(meta.title, "한글 — 대시");
});

test("&amp;를 마지막에 되돌린다", () => {
  // 먼저 되돌리면 `&amp;lt;`가 `<`가 되어 글에 적힌 것과 달라진다.
  const meta = readWebsiteMetadata(
    `<head><title>&amp;lt;는 글자다</title></head>`,
    BASE,
  );

  assert.equal(meta.title, "&lt;는 글자다");
});

test("쓸 수 없는 번호는 버리고 나머지를 살린다", () => {
  // 여기서 던지면 페이지 하나가 통째로 막힌다.
  const meta = readWebsiteMetadata(
    `<head><title>앞&#1114112;뒤</title></head>`,
    BASE,
  );

  assert.equal(meta.title, "앞뒤");
});
