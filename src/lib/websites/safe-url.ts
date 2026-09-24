/**
 * 밖에서 받아올 주소가 안전한지 판정한다. (설계 문서 11.3절)
 *
 * 이 모듈이 막는 것은 **SSRF**다. 사용자가 준 주소로 우리 서버가 대신
 * 요청을 보내는 기능이라, 막지 않으면 그 요청이 밖이 아니라 **안쪽**으로 간다.
 *
 *   http://localhost:3001/...        우리 앱 자신
 *   http://169.254.169.254/...       클라우드가 자격 증명을 내주는 주소
 *   http://10.0.0.5/...              같은 망 안의 다른 기계
 *
 * 사용자는 주소를 붙여넣기만 하면 되므로 이것을 시도하는 값이 싸다.
 * 그리고 우리 서버는 그 안쪽에 닿을 수 있다. 사용자의 브라우저는 못 하는 일이다.
 *
 * **두 겹으로 막는다.**
 *
 *   1. 주소의 모양   스킴, 사용자 정보, 포트, 이름
 *   2. 실제 주소     이름을 번호로 풀어본 뒤 그 번호가 안쪽인지
 *
 * 1번만으로는 부족하다. `http://내도메인.example`이 `127.0.0.1`을 가리키게
 * 해두면 이름만 봐서는 알 수 없다. 그래서 번호를 풀어보고 다시 본다.
 * 2번만으로도 부족하다. `file:`이나 `gopher:` 같은 스킴은 번호를 풀기 전에
 * 이미 다른 일을 한다.
 *
 * **따라가는 주소마다 다시 본다.** 처음 주소가 멀쩡해도 302로 안쪽을
 * 가리킬 수 있다. 그것이 이 방어를 우회하는 가장 쉬운 길이다.
 *
 * 남는 구멍 하나를 적어둔다. 번호를 풀어 확인한 뒤 실제로 연결하기까지
 * 짧은 틈이 있고, 그 사이에 이름이 다른 번호를 가리키게 바뀔 수 있다.
 * (DNS 재바인딩) 완전히 막으려면 풀어낸 번호로 직접 연결해야 하는데,
 * 그러면 TLS 인증서 확인이 어긋난다. 지금은 틈을 남겨두고, 대신 받아오는
 * 것을 **공개 메타데이터로만** 한정한다. 받아온 글을 명령으로 읽지 않고
 * (보안 원칙 10), 응답을 사용자에게 그대로 보여주지도 않는다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/** 받아들이는 스킴. 나머지는 전부 거절한다. */
const ALLOWED_PROTOCOLS = ["http:", "https:"];

/**
 * 받아들이는 포트.
 *
 * 기본 포트만 허용한다. 웹페이지를 저장하는 기능이라 다른 포트를 쓸 일이
 * 거의 없는데, 열어두면 같은 기계의 데이터베이스나 관리 화면처럼 **웹이
 * 아닌 것들**이 전부 사정권에 들어온다. 이름이 바깥을 가리키더라도 그렇다.
 */
const ALLOWED_PORTS = ["", "80", "443"];

/**
 * 이름만으로 막는 것.
 *
 * 번호로 풀어봐도 걸리겠지만, 풀어보기 전에 막는 편이 낫다. 풀어보는 일
 * 자체가 밖으로 나가는 요청이고, 그 이름이 어떤 번호를 받는지는 그때그때
 * 다르다. 클라우드의 메타데이터 이름은 특히 그렇다.
 */
const BLOCKED_HOST_SUFFIXES = [
  "localhost",
  // 사내망에서 쓰는 이름들. 밖에서는 뜻이 없다.
  ".local",
  ".localdomain",
  ".internal",
  ".intranet",
  ".lan",
  ".home",
  ".corp",
  ".private",
];

/** 클라우드가 자격 증명을 내주는 이름. 이것 하나로 계정이 통째로 넘어간다. */
const BLOCKED_HOSTS = [
  "localhost",
  "metadata.google.internal",
  "metadata.goog",
];

export type UrlRejection =
  | "empty"
  | "malformed"
  | "protocol"
  | "credentials"
  | "port"
  | "hostname"
  | "address";

export type UrlCheck =
  | { ok: true; url: string; hostname: string }
  | { ok: false; reason: UrlRejection; message: string };

/** 사람에게 보여줄 말. 무엇이 걸렸는지 알려주되 안쪽 사정은 말하지 않는다. */
const REJECTION_MESSAGES: Record<UrlRejection, string> = {
  empty: "주소를 적어 주세요.",
  malformed: "주소를 알아볼 수 없습니다. http:// 또는 https://로 시작해야 합니다.",
  protocol: "http와 https 주소만 담을 수 있습니다.",
  credentials: "아이디와 비밀번호가 들어간 주소는 담을 수 없습니다.",
  port: "일반 웹 주소만 담을 수 있습니다. 포트 번호를 붙인 주소는 받지 않습니다.",
  hostname: "이 주소는 바깥 웹사이트가 아니라 내부 주소입니다.",
  address: "이 주소는 바깥 웹사이트가 아니라 내부 주소입니다.",
};

export function describeRejection(reason: UrlRejection): string {
  return REJECTION_MESSAGES[reason];
}

/**
 * 주소의 모양을 본다. 첫 번째 겹이다.
 *
 * 스킴이 없으면 `https://`를 붙여본다. 사람은 주소창에서 복사할 때 스킴을
 * 빼고 오는 일이 잦고, 그때마다 거절하면 붙여넣기가 두 번 일이 된다.
 * 붙여본 결과가 여전히 이상하면 그때 거절한다.
 */
export function checkWebsiteUrl(input: unknown): UrlCheck {
  if (typeof input !== "string") {
    return reject("empty");
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return reject("empty");
  }

  /*
    스킴이 없어 보이면 https를 붙인다. `//`로 시작하는 것도 스킴이 빠진
    모양이지만, 그 경우 원래 무엇이었는지 알 수 없으므로 붙이지 않는다.
  */
  const withScheme = /^[a-z][a-z0-9+.-]*:/iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;

  try {
    url = new URL(withScheme);
  } catch {
    return reject("malformed");
  }

  if (!ALLOWED_PROTOCOLS.includes(url.protocol)) {
    return reject("protocol");
  }

  // 주소에 담긴 아이디·비밀번호는 로그와 화면에 그대로 남는다.
  if (url.username.length > 0 || url.password.length > 0) {
    return reject("credentials");
  }

  if (!ALLOWED_PORTS.includes(url.port)) {
    return reject("port");
  }

  const hostname = normalizeHostname(url.hostname);

  if (hostname.length === 0 || isBlockedHostname(hostname)) {
    return reject("hostname");
  }

  /*
    이름 자리에 번호가 그대로 온 경우다. 풀어볼 것이 없으니 지금 본다.
    `http://127.0.0.1`과 `http://[::1]`이 그렇다.
  */
  if (isBlockedAddress(hostname)) {
    return reject("address");
  }

  // 조각(#...)은 서버에 보내지 않는 값이다. 들고 다닐 이유가 없다.
  url.hash = "";

  return { ok: true, url: url.toString(), hostname };
}

/**
 * 이름을 견주기 좋은 모양으로 만든다.
 *
 * 소문자로 내리고, 끝의 점을 뗀다. `LOCALHOST.`은 `localhost`와 같은 곳인데
 * 글자로는 다르다. 뿌리를 가리키는 점을 붙여 목록을 피해 가는 방법이 있다.
 *
 * `[::1]`처럼 대괄호에 싸인 IPv6는 껍질을 벗긴다. URL의 hostname은 대괄호를
 * 붙여 돌려주는데, 번호로 견줄 때는 없어야 한다.
 */
export function normalizeHostname(value: string): string {
  const lowered = value.trim().toLowerCase().replace(/\.+$/u, "");

  return lowered.startsWith("[") && lowered.endsWith("]")
    ? lowered.slice(1, -1)
    : lowered;
}

/** 이름만으로 막을 것인가. */
export function isBlockedHostname(hostname: string): boolean {
  if (BLOCKED_HOSTS.includes(hostname)) {
    return true;
  }

  return BLOCKED_HOST_SUFFIXES.some(
    (suffix) =>
      hostname === suffix ||
      hostname.endsWith(suffix.startsWith(".") ? suffix : `.${suffix}`),
  );
}

/**
 * 이 번호가 안쪽을 가리키는가. 두 번째 겹이다.
 *
 * 이름을 풀어 얻은 번호마다 이것을 통과해야 한다. 하나라도 걸리면 그 이름은
 * 쓰지 않는다. **여러 번호 중 하나만 안쪽이어도 막는다.** 어느 번호로
 * 연결될지 우리가 고르지 못하기 때문이다.
 */
export function isBlockedAddress(value: string): boolean {
  const address = normalizeHostname(value);

  if (address.includes(":")) {
    return isBlockedIpv6(address);
  }

  const octets = parseIpv4(address);

  return octets === null ? false : isBlockedIpv4(octets);
}

/**
 * 점 넷으로 적은 IPv4만 번호로 본다.
 *
 * `0x7f.1`이나 `2130706433`처럼 다르게 적은 것도 브라우저와 일부
 * 라이브러리는 같은 곳으로 읽는다. 그런 값은 여기서 번호로 읽지 않고
 * **이름으로 넘긴다.** 이름을 풀어보는 단계에서 진짜 번호가 나오고,
 * 그 번호를 다시 이 함수가 본다. 적는 방법마다 규칙을 흉내 내다 하나를
 * 빠뜨리는 것보다, 풀어본 결과를 믿는 편이 빠뜨릴 곳이 없다.
 */
function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");

  if (parts.length !== 4) {
    return null;
  }

  const octets: number[] = [];

  for (const part of parts) {
    if (!/^\d{1,3}$/u.test(part)) {
      return null;
    }

    const octet = Number(part);

    if (octet > 255) {
      return null;
    }

    octets.push(octet);
  }

  return octets;
}

function isBlockedIpv4(octets: number[]): boolean {
  const [a, b] = octets;

  // 0.0.0.0/8 — "이 망". 0.0.0.0은 곧 자기 자신이다.
  if (a === 0) return true;
  // 10.0.0.0/8 — 사설
  if (a === 10) return true;
  // 127.0.0.0/8 — 자기 자신
  if (a === 127) return true;
  // 169.254.0.0/16 — link-local. 클라우드 메타데이터가 여기 있다.
  if (a === 169 && b === 254) return true;
  // 172.16.0.0/12 — 사설
  if (a === 172 && b >= 16 && b <= 31) return true;
  // 192.168.0.0/16 — 사설
  if (a === 192 && b === 168) return true;
  // 100.64.0.0/10 — 통신사 내부(CGNAT)
  if (a === 100 && b >= 64 && b <= 127) return true;
  // 192.0.0.0/24 — 프로토콜 할당
  if (a === 192 && b === 0 && octets[2] === 0) return true;
  // 192.0.2.0/24, 198.51.100.0/24, 203.0.113.0/24 — 문서용
  if (a === 192 && b === 0 && octets[2] === 2) return true;
  if (a === 198 && b === 51 && octets[2] === 100) return true;
  if (a === 203 && b === 0 && octets[2] === 113) return true;
  // 198.18.0.0/15 — 성능 시험용
  if (a === 198 && (b === 18 || b === 19)) return true;
  // 224.0.0.0/4 멀티캐스트, 240.0.0.0/4 예약. 웹서버가 있을 수 없다.
  if (a >= 224) return true;

  return false;
}

/**
 * IPv6를 여덟 조각으로 펼친다. 펼칠 수 없으면 null이다.
 *
 * `::`은 0이 이어지는 자리를 줄여 적은 것이라, 몇 개가 생략되었는지는
 * 나머지를 세어봐야 안다. 끝에 IPv4를 점으로 적은 모양(`::ffff:1.2.3.4`)도
 * 두 조각으로 바꿔 넣는다.
 *
 * 펼쳐 두면 그다음 판정이 단순해진다. 줄여 적은 모양 그대로 앞글자를
 * 견주면, 같은 곳을 가리키는 다른 표기를 하나씩 빠뜨리게 된다.
 */
function expandIpv6(value: string): number[] | null {
  const address = value.split("%")[0].replace(/^\[|\]$/gu, "");

  if (address.length === 0) {
    return null;
  }

  // 끝에 점으로 적은 IPv4가 있으면 두 조각으로 바꾼다.
  const dotted = address.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/u);
  let head = address;

  if (dotted) {
    const octets = parseIpv4(dotted[2]);

    if (octets === null) {
      return null;
    }

    head = `${dotted[1]}${toHex(octets[0], octets[1])}:${toHex(octets[2], octets[3])}`;
  }

  const halves = head.split("::");

  if (halves.length > 2) {
    return null;
  }

  const left = halves[0].length > 0 ? halves[0].split(":") : [];
  const right =
    halves.length === 2 && halves[1].length > 0 ? halves[1].split(":") : [];

  // `::`이 없으면 여덟 조각이 그대로 있어야 한다.
  if (halves.length === 1 && left.length !== 8) {
    return null;
  }

  const missing = 8 - left.length - right.length;

  if (halves.length === 2 && missing < 1) {
    return null;
  }

  const groups = [
    ...left,
    ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => "0"),
    ...right,
  ];

  if (groups.length !== 8) {
    return null;
  }

  const parsed: number[] = [];

  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/iu.test(group)) {
      return null;
    }

    parsed.push(Number.parseInt(group, 16));
  }

  return parsed;
}

function toHex(high: number, low: number): string {
  return ((high << 8) | low).toString(16);
}

/**
 * IPv6가 안쪽을 가리키는가.
 *
 * **IPv4를 품은 모양을 먼저 벗긴다.** `::ffff:127.0.0.1`은 IPv6로 적었지만
 * 닿는 곳은 IPv4의 자기 자신이다. 벗기지 않으면 IPv4 규칙을 통째로 피해 간다.
 *
 * 그리고 브라우저와 Node는 그것을 `::ffff:7f00:1`처럼 **16진수로 바꿔서**
 * 돌려준다. 점으로 적힌 모양만 찾으면 빠뜨린다. 실제로 검사가 그것을
 * 붙잡았다. 그래서 여덟 조각으로 펼친 뒤 숫자로 본다.
 *
 * 펼칠 수 없는 값은 막지 않는다. 이름일 수 있고, 이름이라면 풀어본 번호를
 * 다시 이 규칙이 본다.
 */
function isBlockedIpv6(value: string): boolean {
  const groups = expandIpv6(value);

  if (groups === null) {
    return false;
  }

  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  const zeroHead = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;

  // ::ffff:a.b.c.d — IPv4를 그대로 품은 모양
  if (zeroHead && g5 === 0xffff) {
    return isBlockedIpv4(toOctets(g6, g7));
  }

  // ::a.b.c.d — 옛 방식으로 IPv4를 품은 모양
  if (zeroHead && g5 === 0) {
    // :: 는 아직 정해지지 않음, ::1 은 자기 자신.
    if (g6 === 0 && g7 <= 1) {
      return true;
    }

    return isBlockedIpv4(toOctets(g6, g7));
  }

  // 64:ff9b::/96 — IPv4를 IPv6로 옮기는 통로. 안쪽 번호를 실어 나른다.
  if (g0 === 0x64 && g1 === 0xff9b) {
    return true;
  }

  // 2002::/16 — 6to4. 둘째·셋째 조각이 곧 IPv4다.
  if (g0 === 0x2002) {
    return true;
  }

  // 100::/64 — 버리는 주소
  if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) {
    return true;
  }

  // fc00::/7 — 사설(ULA)
  if ((g0 & 0xfe00) === 0xfc00) {
    return true;
  }

  // fe80::/10 — link-local
  if ((g0 & 0xffc0) === 0xfe80) {
    return true;
  }

  // ff00::/8 — 멀티캐스트
  if ((g0 & 0xff00) === 0xff00) {
    return true;
  }

  return false;
}

function toOctets(high: number, low: number): number[] {
  return [high >> 8, high & 0xff, low >> 8, low & 0xff];
}

function reject(reason: UrlRejection): UrlCheck {
  return { ok: false, reason, message: REJECTION_MESSAGES[reason] };
}
