/**
 * `/shared`가 **지금 열려 있는 것만** 보여주는지 본다. (19-G)
 *
 * 무엇이 조용히 깨지는가
 *   `listLiveShares`에서 `revoked_at is null`이 빠지면 **꺼진 링크가 켜진
 *   것처럼 목록에 선다.** 그리고 그 줄의 `공개 끄기`를 누르면 아무 일도
 *   일어나지 않는다. 끄는 질의도 살아 있는 줄만 고치기 때문이다.
 *   0줄을 고친 것은 오류가 아니므로 **화면은 "껐습니다"라고 말한다.**
 *
 *   그러면 이 화면이 하려던 일의 반대가 된다. 안 열려 있는 것을 열려
 *   있다고 하고, 껐다고 하고, 그래도 목록에 그대로 남는다.
 *
 * 왜 글로 보는가
 *   이 함수는 Supabase 클라이언트를 물고 있어 단위 검사로 부를 수 없다.
 *   **부를 수 없다고 안 보는 것보다, 글로라도 보는 편이 낫다.**
 *   `sharing-public-reader.test.mjs`가 같은 방식으로 공개 문의 SQL을 본다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

const source = readFileSync(
  path.join(repoRoot, "src", "lib", "sharing", "queries.ts"),
  "utf8",
);

/**
 * `listLiveShares`의 **몸통만** 떼어낸다.
 *
 * 파일 전체에서 찾으면 `liveLink`가 `revokedAt === null`을 보는 것에 걸려
 * **이 함수에서 거르기가 빠져도 통과한다.** 이 저장소가 같은 함정에 여러 번
 * 걸렸다. (AGENTS.md 6절)
 */
function liveSharesBody() {
  const start = source.indexOf("export async function listLiveShares");

  if (start < 0) {
    return null;
  }

  const rest = source.slice(start);
  const end = rest.indexOf("\n}");

  return end < 0 ? rest : rest.slice(0, end);
}

test("공개 목록을 읽는 함수를 떼어낼 수 있다", () => {
  /*
    **목록이 비는 날을 생각해 둔다.** (AGENTS.md 6절) 함수 이름이 바뀌면
    아래 검사가 **아무것도 보지 않으면서** 통과한다.
  */
  const body = liveSharesBody();

  assert.ok(body, "listLiveShares를 찾지 못했다. 아래 검사가 헛돌고 있다.");
  assert.match(
    body,
    /project_public_links/,
    "listLiveShares가 공개 열쇠 표를 읽지 않는다. 몸통을 잘못 떼어냈다.",
  );
});

test("꺼진 공개는 목록에 넣지 않는다", () => {
  const body = liveSharesBody();

  assert.match(
    body,
    /\.is\(\s*"revoked_at"\s*,\s*null\s*\)/,
    "listLiveShares가 꺼진 줄을 거르지 않는다. 끝난 링크가 열려 있는 것처럼 보이고, 그 줄의 `공개 끄기`는 아무 일도 하지 않으면서 껐다고 말한다.",
  );
});

test("공개 목록은 열쇠를 돌려준다", () => {
  /*
    주소를 만들려면 열쇠가 있어야 한다. **열쇠 없이 목록만 보여주면**
    무엇이 열려 있는지는 알아도 그 주소를 확인할 수 없고, 보낸 링크와
    같은 것인지 견줄 수 없다.
  */
  assert.match(
    selectedColumns(),
    /\btoken\b/,
    "고르는 칸에 token이 없다. 주소를 만들 수 없다.",
  );
});

test("공개 목록이 프로젝트 이름을 함께 읽는다", () => {
  /*
    **이름 없이 주소만 보여주면 무엇을 끄는지 모른다.** 열쇠는 사람이
    읽을 수 없는 긴 글자다.
  */
  assert.match(
    selectedColumns(),
    /projects\s*\(\s*name\s*\)/,
    "고르는 칸에 프로젝트 이름이 없다.",
  );
});

/**
 * 고르는 칸 목록만 떼어낸다. `.select("…")`의 괄호 안이다.
 *
 * **몸통 전체에서 찾으면 안 된다.** 2026-10-07에 그렇게 썼다가 망가뜨려
 * 보고 알았다. 고르는 칸에서 `token`을 빼도 **돌려주는 쪽의
 * `token: row.token`에 걸려 통과했다.** 이 저장소가 네 번 걸린 바로 그
 * 함정이다. (AGENTS.md 6절)
 */
function selectedColumns() {
  const body = liveSharesBody();
  const match = body?.match(/\.select\(\s*"([^"]+)"/);

  return match?.[1] ?? null;
}

test("고르는 칸 목록을 떼어낼 수 있다", () => {
  assert.ok(
    selectedColumns(),
    "`.select(…)`를 찾지 못했다. 위 두 검사가 헛돌고 있다.",
  );
});
