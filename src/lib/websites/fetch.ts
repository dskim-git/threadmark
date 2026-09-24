import { lookup } from "node:dns/promises";

import {
  checkWebsiteUrl,
  describeRejection,
  isBlockedAddress,
} from "./safe-url";
import { readWebsiteMetadata, type WebsiteMetadata } from "./metadata";
import { WEBSITE_REQUEST_HEADERS } from "./request";

/**
 * 웹페이지의 공개 메타데이터를 받아온다. (설계 문서 11.2절, 11.3절)
 *
 * **서버에서만 돈다.** 브라우저에서 하면 다른 출처라 막히고, 막히지 않더라도
 * 사용자의 망에서 나가는 요청이 된다.
 *
 * 11.3절이 요구하는 것을 하나씩 맡는다.
 *
 *   SSRF 방지        safe-url.ts가 주소를 보고, 여기서 번호를 풀어 다시 본다
 *   리다이렉트 제한  손으로 따라가며 **매 걸음** 다시 본다
 *   응답 크기 제한   조각 단위로 받으면서 넘으면 끊는다
 *   Content-Type     HTML이 아니면 읽지 않는다
 *   timeout          전체에 하나, 걸음마다 하나
 *
 * **따라가는 주소마다 다시 보는 것이 핵심이다.** 처음 주소가 멀쩡해도
 * 302로 `http://169.254.169.254`를 가리키면 그만이다. fetch에게 리다이렉트를
 * 맡기면 그 사이를 볼 수 없어서, `redirect: "manual"`로 직접 따라간다.
 *
 * 받아온 것을 명령으로 읽지 않는다. (보안 원칙 10) 여기서 나오는 값은
 * 글일 뿐이고, 화면은 그것을 글로만 보여준다.
 */

/** 따라갈 수 있는 걸음 수. 넘으면 그만둔다. */
const MAX_REDIRECTS = 3;

/** 받아올 최대 크기. 머리말을 읽기에 넉넉하고, 본문을 통째로 받기에는 모자라다. */
const MAX_BYTES = 512 * 1024;

/** 걸음 하나에 허용하는 시간. */
const STEP_TIMEOUT_MS = 5000;

/** 전체에 허용하는 시간. 리다이렉트를 여러 번 타도 이 안에 끝난다. */
const TOTAL_TIMEOUT_MS = 10000;

export type FetchFailure =
  | "url"
  | "dns"
  | "blocked"
  | "redirect"
  | "timeout"
  | "status"
  | "type"
  | "network";

export type FetchResult =
  | {
      ok: true;
      /** 따라간 끝의 주소. 상대 주소를 푸는 기준이자 저장할 값이다. */
      finalUrl: string;
      metadata: WebsiteMetadata;
    }
  | { ok: false; reason: FetchFailure; message: string };

const FAILURE_MESSAGES: Record<FetchFailure, string> = {
  url: "주소를 확인해 주세요.",
  dns: "그 주소의 서버를 찾지 못했습니다. 주소가 맞는지 확인해 주세요.",
  blocked: "이 주소는 바깥 웹사이트가 아니라 내부 주소입니다.",
  redirect: "주소가 너무 여러 번 옮겨집니다.",
  timeout: "그 사이트가 시간 안에 답하지 않았습니다.",
  status: "그 사이트가 내용을 주지 않았습니다. 로그인이 필요한 쪽일 수 있습니다.",
  type: "웹페이지가 아닙니다. HTML 주소만 읽을 수 있습니다.",
  network: "지금은 그 사이트에 닿지 못했습니다. 잠시 후 다시 시도해 주세요.",
};

/**
 * 주소를 받아 메타데이터를 돌려준다.
 *
 * 실패해도 던지지 않는다. 이 기능이 안 되는 것은 자료를 담지 못할 이유가
 * 아니다. 화면은 실패를 알리고 사용자가 손으로 적게 한다. (11.2절의 미리보기)
 */
export async function fetchWebsiteMetadata(
  input: string,
): Promise<FetchResult> {
  const checked = checkWebsiteUrl(input);

  if (!checked.ok) {
    return { ok: false, reason: "url", message: describeRejection(checked.reason) };
  }

  const deadline = Date.now() + TOTAL_TIMEOUT_MS;
  let current = checked.url;

  for (let step = 0; step <= MAX_REDIRECTS; step += 1) {
    const guarded = await guardAddress(current);

    if (!guarded.ok) {
      return guarded;
    }

    const remaining = deadline - Date.now();

    if (remaining <= 0) {
      return fail("timeout");
    }

    let response: Response;

    try {
      response = await fetch(current, {
        // 손으로 따라간다. 맡기면 중간 주소를 볼 수 없다.
        redirect: "manual",
        signal: AbortSignal.timeout(Math.min(STEP_TIMEOUT_MS, remaining)),
        headers: WEBSITE_REQUEST_HEADERS,
        // 쿠키를 보내지도 받지도 않는다. 로그인을 우회하지 않는다. (11.3절)
        credentials: "omit",
        cache: "no-store",
      });
    } catch (error) {
      /*
        **왜 실패했는지 남긴다.** 처음에는 이유를 뭉개고 `network`로만
        처리했는데, 그래서 한글 헤더 때문에 모든 요청이 던져지던 것을
        `사이트에 닿지 못했다`로 읽었다. 우리 잘못을 남의 잘못으로 보고 있었다.

        주소는 남기지 않는다. 사용자가 무엇을 읽으려 했는지가 기록에 쌓이면
        그 자체가 남의 자료가 된다.
      */
      logFailure("가져오기", error);

      return fail(isTimeout(error) ? "timeout" : "network");
    }

    if (isRedirect(response.status)) {
      const location = response.headers.get("location");

      if (!location) {
        return fail("status");
      }

      let next: URL;

      try {
        next = new URL(location, current);
      } catch {
        return fail("redirect");
      }

      /*
        옮겨 간 주소도 처음 주소와 똑같이 본다. 스킴·포트·이름까지 전부다.
        여기서 느슨해지면 앞의 모든 검사가 뜻이 없어진다.
      */
      const nextCheck = checkWebsiteUrl(next.toString());

      if (!nextCheck.ok) {
        return { ok: false, reason: "blocked", message: FAILURE_MESSAGES.blocked };
      }

      current = nextCheck.url;

      continue;
    }

    if (!response.ok) {
      return fail("status");
    }

    const contentType = response.headers.get("content-type") ?? "";

    if (!isHtml(contentType)) {
      return fail("type");
    }

    let html: string;

    try {
      html = await readCapped(response);
    } catch (error) {
      logFailure("읽기", error);

      return fail(isTimeout(error) ? "timeout" : "network");
    }

    return {
      ok: true,
      finalUrl: current,
      metadata: readWebsiteMetadata(html, current),
    };
  }

  return fail("redirect");
}

/**
 * 이름을 번호로 풀어 안쪽을 가리키는지 본다. 두 번째 겹이다.
 *
 * **번호 하나라도 안쪽이면 막는다.** 한 이름이 여러 번호를 받을 수 있고,
 * 그중 어느 것으로 연결될지 우리가 고르지 못한다. 하나만 통과해도 된다고
 * 하면, 바깥 번호 하나를 섞어두는 것으로 이 검사를 지나갈 수 있다.
 */
async function guardAddress(url: string): Promise<{ ok: true } | FetchResult> {
  let hostname: string;

  try {
    hostname = new URL(url).hostname;
  } catch {
    return fail("url");
  }

  // 번호가 그대로 적힌 주소는 checkWebsiteUrl이 이미 봤다. 풀 것이 없다.
  if (isLiteralAddress(hostname)) {
    return { ok: true };
  }

  let addresses: { address: string }[];

  try {
    addresses = await lookup(hostname, { all: true });
  } catch {
    return fail("dns");
  }

  if (addresses.length === 0) {
    return fail("dns");
  }

  if (addresses.some((entry) => isBlockedAddress(entry.address))) {
    return fail("blocked");
  }

  return { ok: true };
}

/** 이름 자리에 번호가 그대로 적혀 있는가. */
function isLiteralAddress(hostname: string): boolean {
  return (
    /^\d{1,3}(\.\d{1,3}){3}$/u.test(hostname) ||
    (hostname.startsWith("[") && hostname.endsWith("]"))
  );
}

function isRedirect(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function isHtml(contentType: string): boolean {
  const lowered = contentType.toLowerCase();

  return (
    lowered.includes("text/html") || lowered.includes("application/xhtml+xml")
  );
}

/**
 * 크기를 재면서 읽는다.
 *
 * `response.text()`를 그냥 부르면 상대가 보내는 만큼 전부 받는다. 10GB를
 * 흘려보내는 주소 하나면 서버의 메모리가 찬다. `content-length`만 믿을 수도
 * 없다. 없을 수도 있고 거짓일 수도 있다.
 *
 * 그래서 조각 단위로 받으면서 센다. 한도를 넘으면 **거기서 끊고 그때까지
 * 받은 것으로 읽는다.** 우리가 보는 것은 머리말뿐이라 잘려도 대개 충분하다.
 */
async function readCapped(response: Response): Promise<string> {
  const body = response.body;

  if (!body) {
    return "";
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      if (value) {
        chunks.push(value);
        received += value.byteLength;

        if (received >= MAX_BYTES) {
          break;
        }
      }
    }
  } finally {
    // 다 읽지 않고 그만두면 연결을 놓아준다. 놓지 않으면 그대로 매달린다.
    await reader.cancel().catch(() => {});
  }

  const merged = new Uint8Array(received);
  let offset = 0;

  for (const chunk of chunks) {
    const room = Math.min(chunk.byteLength, received - offset);

    merged.set(chunk.subarray(0, room), offset);
    offset += room;
  }

  // 글자 표를 모르면 UTF-8로 읽는다. 아니어도 깨진 글자가 섞일 뿐 터지지 않는다.
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}

function isTimeout(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

/**
 * 실패한 까닭을 서버 기록에 남긴다.
 *
 * `cause`까지 적는다. Node의 네트워크 오류는 겉면이 늘 `TypeError: fetch
 * failed`이고 진짜 까닭은 그 안에 있다. 겉면만 남기면 무엇이 잘못되었는지
 * 알 수 없다.
 */
function logFailure(step: string, error: unknown): void {
  if (!(error instanceof Error)) {
    console.error(`[ThreadMark] 웹사이트 ${step} 실패:`, error);

    return;
  }

  const cause = error.cause;
  const detail =
    cause instanceof Error
      ? `${cause.name}: ${cause.message}`
      : typeof cause === "string"
        ? cause
        : "";

  console.error(
    `[ThreadMark] 웹사이트 ${step} 실패: ${error.name}: ${error.message}${detail ? ` (${detail})` : ""}`,
  );
}

function fail(reason: FetchFailure): FetchResult {
  return { ok: false, reason, message: FAILURE_MESSAGES[reason] };
}
