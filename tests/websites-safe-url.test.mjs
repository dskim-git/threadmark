/**
 * 밖에서 받아올 주소 검사. (설계 문서 11.3절)
 *
 * 이 검사가 지키는 것은 **SSRF 방어**다. 사용자가 준 주소로 우리 서버가
 * 대신 요청을 보내는 기능이라, 막지 않으면 그 요청이 밖이 아니라 안쪽으로
 * 간다. 우리 서버는 사용자의 브라우저가 못 가는 곳에 닿을 수 있다.
 *
 * 그래서 여기서는 **막는 것과 여는 것을 모두** 확인한다. (보안 원칙 6)
 * 막는 것만 보면 멀쩡한 주소까지 막는 것을 놓치고, 그러면 기능이 되지
 * 않는다는 신고가 들어온다.
 *
 * 가장 빠뜨리기 쉬운 자리를 따로 검사한다.
 *   - `::ffff:127.0.0.1` 처럼 IPv4를 품은 IPv6
 *   - `LOCALHOST.` 처럼 끝에 점을 붙여 목록을 피하는 것
 *   - 포트를 붙여 웹이 아닌 것에 닿는 것
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  checkWebsiteUrl,
  describeRejection,
  isBlockedAddress,
  isBlockedHostname,
  normalizeHostname,
} from "../src/lib/websites/safe-url.ts";

/** 통과해야 하는 주소인지 확인하고 다듬어진 값을 돌려준다. */
function pass(input) {
  const result = checkWebsiteUrl(input);

  assert.equal(result.ok, true, `막히면 안 되는 주소: ${input}`);

  return result;
}

/** 막혀야 하는 주소인지 확인한다. */
function blocked(input, reason) {
  const result = checkWebsiteUrl(input);

  assert.equal(result.ok, false, `막아야 하는 주소: ${input}`);

  if (reason) {
    assert.equal(result.reason, reason, input);
  }

  assert.ok(result.message.length > 0, `${input}: 이유를 말해야 한다`);

  return result;
}

// -----------------------------------------------------------------------------
// 여는 것
// -----------------------------------------------------------------------------

test("보통의 웹 주소는 통과한다", () => {
  pass("https://example.com");
  pass("https://example.com/path/to/page?q=1");
  pass("http://example.com");
  pass("https://blog.example.co.kr/2026/09/글.html");
});

test("스킴이 없으면 https를 붙여준다", () => {
  // 주소창에서 복사하면 스킴이 빠져 온다. 그때마다 거절하면 붙여넣기가
  // 두 번 일이 된다.
  const result = pass("example.com/article");

  assert.ok(result.url.startsWith("https://example.com/article"));
});

test("기본 포트를 적어도 통과한다", () => {
  pass("https://example.com:443/page");
  pass("http://example.com:80/page");
});

test("바깥 번호로 적은 주소는 통과한다", () => {
  // 번호로 적었다고 다 막지 않는다. 공개된 번호는 멀쩡한 주소다.
  pass("http://8.8.8.8/");
  pass("https://1.1.1.1/");
});

test("조각(#)은 떼어낸다", () => {
  // 서버에 보내지 않는 값이다. 들고 다닐 이유가 없다.
  const result = pass("https://example.com/page#section");

  assert.ok(!result.url.includes("#"));
});

// -----------------------------------------------------------------------------
// 스킴과 모양
// -----------------------------------------------------------------------------

test("http와 https가 아니면 막는다", () => {
  for (const input of [
    "file:///etc/passwd",
    "ftp://example.com/",
    "gopher://example.com/",
    "data:text/html,<h1>x</h1>",
    "javascript:alert(1)",
  ]) {
    blocked(input, "protocol");
  }
});

test("빈 값과 글자가 아닌 값을 막는다", () => {
  blocked("", "empty");
  blocked("   ", "empty");
  blocked(undefined, "empty");
  blocked(null, "empty");
  blocked(123, "empty");
});

test("주소로 읽을 수 없는 값을 막는다", () => {
  blocked("https://", "malformed");
  blocked("h t t p", "malformed");
});

test("아이디와 비밀번호가 든 주소를 막는다", () => {
  // 주소에 담긴 자격 증명은 로그와 화면에 그대로 남는다.
  blocked("https://user:secret@example.com/", "credentials");
  blocked("https://user@example.com/", "credentials");
});

test("기본이 아닌 포트를 막는다", () => {
  /*
    열어두면 같은 기계의 데이터베이스나 관리 화면처럼 웹이 아닌 것들이
    전부 사정권에 들어온다. 이름이 바깥을 가리키더라도 그렇다.
  */
  for (const input of [
    "http://example.com:3001/",
    "http://example.com:5432/",
    "http://example.com:6379/",
    "http://example.com:22/",
    "http://example.com:8080/",
  ]) {
    blocked(input, "port");
  }
});

// -----------------------------------------------------------------------------
// 이름으로 막는 것
// -----------------------------------------------------------------------------

test("내 기계를 가리키는 이름을 막는다", () => {
  blocked("http://localhost/", "hostname");
  blocked("http://localhost/admin", "hostname");
  blocked("http://app.localhost/", "hostname");
});

test("끝에 점을 붙여 피해 갈 수 없다", () => {
  // `localhost.`는 `localhost`와 같은 곳인데 글자로는 다르다.
  blocked("http://localhost./", "hostname");
  blocked("http://LOCALHOST/", "hostname");
  blocked("http://LocalHost./", "hostname");
});

test("사내망 이름을 막는다", () => {
  for (const input of [
    "http://printer.local/",
    "http://wiki.internal/",
    "http://git.corp/",
    "http://nas.lan/",
    "http://something.home/",
    "http://db.private/",
  ]) {
    blocked(input, "hostname");
  }
});

test("클라우드 메타데이터 이름을 막는다", () => {
  // 이것 하나로 계정이 통째로 넘어간다.
  blocked("http://metadata.google.internal/", "hostname");
  blocked("http://metadata.goog/", "hostname");
});

test("비슷하지만 다른 이름은 막지 않는다", () => {
  // 과잉 차단을 놓치지 않는다. (보안 원칙 6)
  pass("https://localhost.example.com/");
  pass("https://mylocal.com/");
  pass("https://internal-affairs.org/");
  pass("https://lanparty.net/");
});

// -----------------------------------------------------------------------------
// 번호로 막는 것 (IPv4)
// -----------------------------------------------------------------------------

test("자기 자신과 사설 번호를 막는다", () => {
  for (const input of [
    "http://127.0.0.1/",
    "http://127.1.2.3/",
    "http://0.0.0.0/",
    "http://10.0.0.5/",
    "http://172.16.0.1/",
    "http://172.31.255.255/",
    "http://192.168.1.1/",
  ]) {
    blocked(input, "address");
  }
});

test("클라우드 메타데이터 번호를 막는다", () => {
  // 169.254.169.254. SSRF로 가장 먼저 노리는 곳이다.
  blocked("http://169.254.169.254/latest/meta-data/", "address");
  blocked("http://169.254.0.1/", "address");
});

test("그 밖의 특수 대역을 막는다", () => {
  for (const input of [
    "http://100.64.0.1/", // 통신사 내부
    "http://192.0.0.1/", // 프로토콜 할당
    "http://198.18.0.1/", // 성능 시험용
    "http://224.0.0.1/", // 멀티캐스트
    "http://255.255.255.255/", // 브로드캐스트
  ]) {
    blocked(input, "address");
  }
});

test("사설 대역 바로 바깥은 막지 않는다", () => {
  // 경계를 한 칸씩 넘겨본다. 넓게 잡으면 멀쩡한 사이트가 막힌다.
  pass("http://11.0.0.1/");
  pass("http://172.15.0.1/");
  pass("http://172.32.0.1/");
  pass("http://192.167.0.1/");
  pass("http://100.63.0.1/");
  pass("http://100.128.0.1/");
  pass("http://223.255.255.255/");
});

// -----------------------------------------------------------------------------
// 번호로 막는 것 (IPv6)
// -----------------------------------------------------------------------------

test("IPv6 자기 자신과 사설 번호를 막는다", () => {
  for (const input of [
    "http://[::1]/",
    "http://[::]/",
    "http://[fc00::1]/",
    "http://[fd12:3456::1]/",
    "http://[fe80::1]/",
    "http://[ff02::1]/",
  ]) {
    blocked(input, "address");
  }
});

test("IPv4를 품은 IPv6를 막는다", () => {
  /*
    여기가 가장 빠뜨리기 쉽다. IPv6로 적었지만 닿는 곳은 IPv4의 자기
    자신이다. 벗겨내지 않으면 IPv4 규칙을 통째로 피해 간다.
  */
  blocked("http://[::ffff:127.0.0.1]/", "address");
  blocked("http://[::ffff:169.254.169.254]/", "address");
  blocked("http://[::ffff:10.0.0.1]/", "address");
  blocked("http://[::127.0.0.1]/", "address");
});

test("16진수로 바뀐 IPv4-mapped 주소도 막는다", () => {
  /*
    브라우저와 Node는 `::ffff:127.0.0.1`을 `::ffff:7f00:1`로 바꿔 돌려준다.
    점으로 적힌 모양만 찾으면 여기서 빠뜨린다. 실제로 이 검사가 그 구멍을
    붙잡았고, 그래서 여덟 조각으로 펼친 뒤 숫자로 보게 고쳤다.
  */
  assert.equal(isBlockedAddress("::ffff:7f00:1"), true); // 127.0.0.1
  assert.equal(isBlockedAddress("::ffff:a9fe:a9fe"), true); // 169.254.169.254
  assert.equal(isBlockedAddress("::ffff:a00:1"), true); // 10.0.0.1
  assert.equal(isBlockedAddress("::7f00:1"), true); // 옛 방식

  // 바깥 번호를 품은 것은 막지 않는다.
  assert.equal(isBlockedAddress("::ffff:5db8:d822"), false); // 93.184.216.34
});

test("펼칠 수 없는 값은 번호로 보지 않는다", () => {
  // 이름일 수 있다. 이름이라면 풀어본 번호를 다시 이 규칙이 본다.
  assert.equal(isBlockedAddress("::ffff:zzzz:1"), false);
  assert.equal(isBlockedAddress("1:2:3::4::5"), false);
  assert.equal(isBlockedAddress("1:2:3:4:5:6:7"), false);
});

test("통로 대역을 막는다", () => {
  blocked("http://[64:ff9b::7f00:1]/", "address");
  blocked("http://[100::1]/", "address");
  blocked("http://[2002:7f00:1::]/", "address");
});

test("보통의 IPv6는 막지 않는다", () => {
  pass("http://[2606:4700:4700::1111]/");
  pass("http://[2001:4860:4860::8888]/");
});

// -----------------------------------------------------------------------------
// 이름을 풀어 얻은 번호를 다시 본다
// -----------------------------------------------------------------------------

test("풀어낸 번호를 그대로 판정할 수 있다", () => {
  /*
    `내도메인.example`이 127.0.0.1을 가리키게 해두면 이름만 봐서는 알 수
    없다. 그래서 이름을 풀어 얻은 번호마다 이 함수를 다시 통과시킨다.
  */
  assert.equal(isBlockedAddress("127.0.0.1"), true);
  assert.equal(isBlockedAddress("169.254.169.254"), true);
  assert.equal(isBlockedAddress("::1"), true);
  assert.equal(isBlockedAddress("::ffff:10.1.2.3"), true);

  assert.equal(isBlockedAddress("93.184.216.34"), false);
  assert.equal(isBlockedAddress("2606:4700::1"), false);
});

test("다르게 적은 번호는 이름으로 넘긴다", () => {
  /*
    `2130706433`이나 `0x7f.1`도 같은 곳을 가리키지만, 적는 방법마다 규칙을
    흉내 내다 보면 하나를 빠뜨린다. 여기서는 번호로 읽지 않고 이름으로
    넘긴다. 풀어보는 단계에서 진짜 번호가 나오고 그 번호를 다시 본다.
  */
  assert.equal(isBlockedAddress("2130706433"), false);
  assert.equal(isBlockedAddress("0x7f000001"), false);
});

test("이름 다듬기는 대문자와 끝점과 대괄호를 정리한다", () => {
  assert.equal(normalizeHostname("EXAMPLE.COM."), "example.com");
  assert.equal(normalizeHostname("[::1]"), "::1");
  assert.equal(normalizeHostname("  Example.Com  "), "example.com");
});

test("막는 이유마다 사람이 읽을 말이 있다", () => {
  for (const reason of [
    "empty",
    "malformed",
    "protocol",
    "credentials",
    "port",
    "hostname",
    "address",
  ]) {
    assert.ok(describeRejection(reason).length > 0, reason);
  }
});

test("이름 판정은 이름만 본다", () => {
  assert.equal(isBlockedHostname("localhost"), true);
  assert.equal(isBlockedHostname("a.b.internal"), true);
  assert.equal(isBlockedHostname("example.com"), false);
});
