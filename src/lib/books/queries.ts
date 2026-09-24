import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import { isHolding, isReadingStatus } from "./reading";
import type { Holding, ReadingStatus } from "./reading";

/**
 * 책 자료 조회. (설계 문서 12절)
 *
 * sources가 담지 않는 것만 여기 있다. 제목·부제·소개·표지·상품 주소는
 * 자료 자체가 들고 있다.
 */

export type BookProfile = {
  /** 밖에서 가져오는 값. 후보를 고르면 덮어도 된다. */
  authors: string[];
  translators: string[];
  publisher: string | null;
  /** 아는 만큼만 적힌 출판일. 날짜로 바꾸지 않는다. */
  publishedOn: string | null;
  isbn10: string | null;
  isbn13: string | null;
  /** 어디서 가져온 값인지. 화면이 출처를 밝히는 데 쓴다. */
  metadataSource: string | null;
  fetchedAt: string | null;

  /** 사용자가 적는 값. 밖에서 가져온 것으로 덮지 않는다. */
  holding: Holding | null;
  readingStatus: ReadingStatus;
  totalPages: number | null;
  currentPage: number | null;
  startedOn: string | null;
  finishedOn: string | null;
  whyChosen: string | null;
  verdict: string | null;
};

export async function getBookProfile(
  sourceId: string,
): Promise<BookProfile | null> {
  await requireActiveAccount();

  const supabase = await createClient();

  /*
    고르는 칸 목록을 변수로 빼지 않는다.

    Supabase 타입은 이 글자를 **그대로 읽어** 돌아올 모양을 정한다. 변수에
    담으면 그냥 `string`이 되고, 돌아온 값의 타입이 통째로 무너진다.
    실제로 그렇게 만들었다가 `GenericStringError`가 열여섯 줄 쏟아졌다.
  */
  const { data, error } = await supabase
    .from("book_profiles")
    .select(
      "authors, translators, publisher, published_on, isbn10, isbn13, metadata_source, fetched_at, holding, reading_status, total_pages, current_page, started_on, finished_on, why_chosen, verdict",
    )
    .eq("source_id", sourceId)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 책 정보 조회 실패:", error.message);

    return null;
  }

  if (!data) {
    return null;
  }

  return {
    authors: data.authors ?? [],
    translators: data.translators ?? [],
    publisher: data.publisher,
    publishedOn: data.published_on,
    isbn10: data.isbn10,
    isbn13: data.isbn13,
    metadataSource: data.metadata_source,
    fetchedAt: data.fetched_at,
    holding: isHolding(data.holding) ? data.holding : null,
    /*
      모르는 값이 오면 `unread`로 본다.

      데이터베이스가 열거형으로 막고 있어 그럴 일이 없지만, 나중에 값이
      늘어났는데 화면이 아직 모를 수 있다. 그때 화면이 비어 보이는 것보다
      "아직 안 읽음"으로 보이는 편이 덜 놀랍다. 이 값으로 무엇을 막거나
      열지 않으므로 여기서는 닫아걸 이유가 없다.
    */
    readingStatus: isReadingStatus(data.reading_status)
      ? data.reading_status
      : "unread",
    totalPages: data.total_pages,
    currentPage: data.current_page,
    startedOn: data.started_on,
    finishedOn: data.finished_on,
    whyChosen: data.why_chosen,
    verdict: data.verdict,
  };
}
