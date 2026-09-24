/**
 * 받아온 HTML에서 공개 메타데이터만 꺼낸다. (설계 문서 11.1절)
 *
 * **페이지를 복제하지 않는다.** 11.3절이 그렇게 정하고 있다. 여기서 꺼내는
 * 것은 그 페이지가 스스로 "나는 이런 글이다"라고 머리에 적어둔 값뿐이다.
 * 본문은 읽지 않는다.
 *
 * 왜 HTML 라이브러리를 쓰지 않는가
 *   필요한 것이 `<head>` 안의 `meta`와 `link`와 `title` 몇 개뿐이다.
 *   문서 전체를 트리로 세우는 라이브러리는 이 일에 비해 무겁고, 그 무게를
 *   서버가 요청마다 치른다. 잘못 적힌 HTML을 만나도 우리는 값을 못 찾을
 *   뿐이고, 못 찾으면 사용자가 손으로 적는다.
 *
 * **여기서 나온 값은 남이 쓴 글이다.** 화면에 그대로 보여주되 명령으로 읽지
 * 않고(보안 원칙 10), 주소 자리에 들어갈 값은 http·https만 받는다.
 * `javascript:`나 `data:`가 favicon 자리에 오는 일이 실제로 있다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/** 담을 수 있는 길이. 데이터베이스 제약조건과 같아야 한다. */
export const MAX_META_TEXT_LENGTH = 500;
export const MAX_META_URL_LENGTH = 2000;

/**
 * 머리말만 훑는다.
 *
 * `</head>`를 만나면 멈춘다. 만나지 못하면 앞부분만 본다. 본문이 아무리
 * 길어도 훑는 양이 이 값을 넘지 않는다.
 */
const HEAD_SCAN_LENGTH = 200000;

export type WebsiteMetadata = {
  /** 페이지가 스스로 밝힌 제목. 없으면 null이다. */
  title: string | null;
  siteName: string | null;
  description: string | null;
  author: string | null;
  /** 게시일. 적혀 있는 그대로 담는다. 모양이 제각각이라 우리가 고치지 않는다. */
  publishedAt: string | null;
  canonicalUrl: string | null;
  imageUrl: string | null;
  faviconUrl: string | null;
};

const EMPTY: WebsiteMetadata = {
  title: null,
  siteName: null,
  description: null,
  author: null,
  publishedAt: null,
  canonicalUrl: null,
  imageUrl: null,
  faviconUrl: null,
};

/**
 * HTML에서 메타데이터를 꺼낸다.
 *
 * @param html 받아온 글. 머리말만 훑는다.
 * @param baseUrl 따라간 끝의 주소. 상대 주소를 풀 기준이다.
 *
 * 값을 고르는 순서는 **페이지가 의도한 순서**다. `og:`는 남에게 보여주려고
 * 일부러 적은 값이고, `<title>`은 브라우저 탭에 쓰려고 적은 값이다.
 * 같은 뜻이면 일부러 적은 쪽을 믿는다.
 */
export function readWebsiteMetadata(
  html: string,
  baseUrl: string,
): WebsiteMetadata {
  if (typeof html !== "string" || html.length === 0) {
    return EMPTY;
  }

  const head = cutHead(html);
  const meta = collectMeta(head);

  const pick = (...keys: string[]): string | null => {
    for (const key of keys) {
      const value = meta.get(key);

      if (value) {
        return value;
      }
    }

    return null;
  };

  return {
    title: text(pick("og:title", "twitter:title") ?? readTitleTag(head)),
    siteName: text(pick("og:site_name", "application-name")),
    description: text(
      pick("og:description", "twitter:description", "description"),
    ),
    author: text(pick("author", "article:author")),
    publishedAt: text(
      pick("article:published_time", "datepublished", "date"),
    ),
    canonicalUrl: link(pick("og:url") ?? readLinkHref(head, ["canonical"]), baseUrl),
    imageUrl: link(pick("og:image", "og:image:url", "twitter:image"), baseUrl),
    faviconUrl: link(
      readLinkHref(head, ["icon", "shortcut icon", "apple-touch-icon"]),
      baseUrl,
    ),
  };
}

/** `</head>`까지, 없으면 앞부분만. */
function cutHead(html: string): string {
  const scanned = html.slice(0, HEAD_SCAN_LENGTH);
  const end = scanned.search(/<\/head\s*>/iu);

  return end === -1 ? scanned : scanned.slice(0, end);
}

/**
 * `<meta>` 태그를 모두 모아 이름으로 찾을 수 있게 한다.
 *
 * `name`과 `property`를 같은 자리에 담는다. 둘은 규격이 다르지만 쓰는
 * 쪽에서는 같은 일을 하고, 한 페이지가 둘을 섞어 쓰는 일도 흔하다.
 *
 * **먼저 나온 것을 남긴다.** 같은 이름이 여러 번 적힌 페이지가 있는데,
 * 대개 앞엣것이 그 페이지가 의도한 값이다.
 */
function collectMeta(head: string): Map<string, string> {
  const found = new Map<string, string>();

  for (const tag of head.matchAll(/<meta\b[^>]*>/giu)) {
    const attributes = tag[0];
    const key =
      readAttribute(attributes, "property") ?? readAttribute(attributes, "name");
    const value = readAttribute(attributes, "content");

    if (!key || value === null) {
      continue;
    }

    const lowered = key.trim().toLowerCase();

    if (!found.has(lowered)) {
      found.set(lowered, value);
    }
  }

  return found;
}

/** `<link rel="...">`의 href. 앞에 적힌 rel부터 찾는다. */
function readLinkHref(head: string, rels: string[]): string | null {
  const links = [...head.matchAll(/<link\b[^>]*>/giu)].map((tag) => tag[0]);

  for (const wanted of rels) {
    for (const tag of links) {
      const rel = readAttribute(tag, "rel");

      if (!rel) {
        continue;
      }

      /*
        rel에는 값이 여러 개 들어갈 수 있다. `rel="shortcut icon"`이 그렇고,
        `rel="icon alternate"`처럼 쓰는 곳도 있다. 통째로 견주면 놓친다.
      */
      const values = rel.trim().toLowerCase().split(/\s+/u);
      const matches =
        wanted.includes(" ")
          ? wanted.split(" ").every((part) => values.includes(part))
          : values.includes(wanted);

      if (matches) {
        const href = readAttribute(tag, "href");

        if (href) {
          return href;
        }
      }
    }
  }

  return null;
}

function readTitleTag(head: string): string | null {
  const match = head.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/iu);

  /*
    여기서도 글자 표기를 되돌린다. 속성 값만 되돌리고 `<title>`을 빼먹었더니
    `A &amp; B`가 화면에 그대로 나왔다. 검사가 붙잡았다.
  */
  return match ? decodeEntities(match[1]) : null;
}

/**
 * 태그에서 속성 값을 꺼낸다.
 *
 * 따옴표는 큰따옴표·작은따옴표·없음 셋 다 쓰인다. 셋을 모두 받는다.
 * 하나라도 빠뜨리면 그 모양으로 적은 사이트에서만 값을 못 찾는데,
 * 그런 실패는 "이 사이트는 정보가 없나 보다"로 잘못 읽히기 쉽다.
 */
function readAttribute(tag: string, name: string): string | null {
  const pattern = new RegExp(
    `\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`,
    "iu",
  );
  const match = tag.match(pattern);

  if (!match) {
    return null;
  }

  return decodeEntities(match[1] ?? match[2] ?? match[3] ?? "");
}

/**
 * HTML에서 쓰는 글자 표기를 되돌린다.
 *
 * 제목에 `&amp;`가 그대로 남으면 화면에 `&amp;`로 보인다. 자주 쓰이는
 * 몇 개와 번호로 적은 것을 되돌린다. 전부 다루려 들지 않는다.
 *
 * `&amp;`를 **마지막에** 되돌린다. 먼저 되돌리면 `&amp;lt;`가 `<`가 되어,
 * 글에 적힌 것과 다른 결과가 나온다.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&apos;/giu, "'")
    .replace(/&nbsp;/giu, " ")
    .replace(/&#(\d{1,7});/gu, (_, code: string) => fromCode(Number(code)))
    .replace(/&#x([0-9a-f]{1,6});/giu, (_, code: string) =>
      fromCode(Number.parseInt(code, 16)),
    )
    .replace(/&amp;/giu, "&");
}

function fromCode(code: number): string {
  // 쓸 수 없는 번호는 그냥 버린다. 여기서 던지면 페이지 하나가 통째로 막힌다.
  if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) {
    return "";
  }

  try {
    return String.fromCodePoint(code);
  } catch {
    return "";
  }
}

/** 글 값 다듬기. 줄바꿈과 이어진 공백을 정리하고 길이를 자른다. */
function text(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const cleaned = value.replace(/\s+/gu, " ").trim();

  if (cleaned.length === 0) {
    return null;
  }

  return cleaned.slice(0, MAX_META_TEXT_LENGTH);
}

/**
 * 주소 값 다듬기.
 *
 * 상대 주소를 기준 주소로 푼다. `/favicon.ico`처럼 적힌 것이 그렇다.
 *
 * **http와 https만 받는다.** favicon 자리에 `data:`가 오는 일이 흔한데,
 * 그것을 그대로 담으면 그림 한 장이 통째로 행에 들어간다. `javascript:`가
 * 오는 일도 있고, 그것이 화면의 링크에 들어가면 누르는 순간 실행된다.
 */
function link(value: string | null, baseUrl: string): string | null {
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  let resolved: URL;

  try {
    resolved = new URL(trimmed, baseUrl);
  } catch {
    return null;
  }

  if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
    return null;
  }

  const text = resolved.toString();

  // 길이를 넘는 주소는 잘라 담지 않는다. 잘린 주소는 아무 데도 닿지 못한다.
  return text.length <= MAX_META_URL_LENGTH ? text : null;
}
