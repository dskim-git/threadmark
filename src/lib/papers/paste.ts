/**
 * 붙여넣은 글에서 서지 정보를 읽는다. (설계 문서 8.5절)
 *
 * BibTeX인지 RIS인지 가려서 알맞은 쪽에 넘긴다. 사용자가 "이건 BibTeX입니다"를
 * 고르게 하지 않는다. 글만 보면 알 수 있는 것을 왜 묻느냐는 말을 듣게 된다.
 *
 * 밖으로 나가는 요청이 없다. 브라우저에서 바로 읽는다. 공짜이고 즉시 된다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

// Node의 테스트 러너가 이 모듈을 직접 읽을 수 있도록 확장자를 명시한다.
import { looksLikeBibtex, parseBibtex } from "./bibtex.ts";
import type { ImportedPaper } from "./crossref.ts";
import { looksLikeRis, parseRis } from "./ris.ts";

/** 붙여넣을 수 있는 글의 길이 상한. 이보다 길면 목록을 통째로 붙인 것이다. */
export const MAX_PASTE_LENGTH = 50_000;

export type PasteResult =
  | { ok: true; paper: ImportedPaper }
  | { ok: false; message: string };

export function parsePastedCitation(text: string): PasteResult {
  const trimmed = text.trim();

  if (trimmed.length === 0) {
    return { ok: false, message: "붙여넣을 글이 없습니다." };
  }

  if (trimmed.length > MAX_PASTE_LENGTH) {
    return {
      ok: false,
      message: `한 번에 ${MAX_PASTE_LENGTH}자까지 읽을 수 있습니다. 논문 한 편의 것만 붙여넣어 주세요.`,
    };
  }

  /*
    RIS를 먼저 본다. BibTeX 판별은 `@무엇 {` 하나만 보므로, RIS 안에 그런
    글자가 섞여 있으면 BibTeX로 잘못 볼 수 있다. RIS 판별은 줄 맨 앞의
    `TY -`를 보는 것이라 더 좁다. 좁은 쪽을 먼저 본다.
  */
  if (looksLikeRis(trimmed)) {
    const paper = parseRis(trimmed);

    return paper === null
      ? {
          ok: false,
          message: "RIS처럼 보이는데 제목도 DOI도 찾지 못했습니다.",
        }
      : { ok: true, paper };
  }

  if (looksLikeBibtex(trimmed)) {
    const paper = parseBibtex(trimmed);

    return paper === null
      ? {
          ok: false,
          message: "BibTeX처럼 보이는데 제목도 DOI도 찾지 못했습니다.",
        }
      : { ok: true, paper };
  }

  return {
    ok: false,
    message:
      "BibTeX도 RIS도 아닌 것 같습니다. 학술지 사이트의 `인용 내보내기`에서 받은 글을 그대로 붙여넣어 주세요.",
  };
}
