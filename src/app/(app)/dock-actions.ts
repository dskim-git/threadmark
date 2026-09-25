"use server";

import { requireActiveAccount } from "@/lib/auth/account";
import { normalizeSearchTerm } from "@/lib/search/query";
import { search } from "@/lib/search/queries";

import { DOCK_LIMIT, type DockState } from "./dock-state";

/**
 * 떠다니는 창에서 찾는다. (사용자 요청, 2026-09-25)
 *
 * **찾는 코드를 새로 쓰지 않는다.** `/search` 화면과 같은 `search()`를
 * 부른다. 두 벌이 되면 한쪽만 고쳐졌을 때 같은 검색어에 다른 결과가 나오고,
 * 어느 쪽이 맞는지 알 수 없다.
 *
 * 다른 것은 **몇 개를 보여주느냐**뿐이고 그것은 화면 쪽 사정이라 여기서
 * 자른다. 질의는 그대로 둔다.
 */
export async function searchFromDock(
  _previous: DockState,
  formData: FormData,
): Promise<DockState> {
  await requireActiveAccount();

  const raw = formData.get("term");
  const typed = typeof raw === "string" ? raw : "";
  const term = normalizeSearchTerm(typed);

  if (term === null) {
    return {
      term: typed,
      sources: null,
      captures: null,
      error: "찾을 낱말을 적어 주세요.",
    };
  }

  const results = await search(term);

  return {
    term,
    sources: results.sources.slice(0, DOCK_LIMIT),
    captures: results.captures.slice(0, DOCK_LIMIT),
    error: null,
  };
}
