import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import {
  DEFAULT_PAPER_SORT,
  type PaperSort,
} from "@/lib/sources/sorting";
import { isReadingCandidate } from "@/lib/sources/types";

import { formatApaCitation, resolveCitation } from "./apa";
import type { PaperAuthor } from "./types";

/**
 * 논문 서지 정보 조회. (설계 문서 8.1절)
 *
 * sources와 같은 원칙을 따른다. 모든 함수가 먼저 승인된 계정인지 확인하고,
 * 화면이 확인했으리라 가정하지 않는다.
 *
 * 참고문헌은 저장된 값이 아니라 여기서 만들어 붙인다. 8.1절이 구조화된
 * 값으로 생성하라고 한 대로다. 사람이 고쳐 쓴 것이 있으면 그것이 이긴다.
 */

const PROFILE_COLUMNS =
  "id, source_id, authors, publication_year, journal_name, volume, issue, page_range, doi, issn, abstract, keywords, original_language, citation_override, created_at, updated_at";

export type PaperProfile = {
  id: string;
  sourceId: string;
  authors: PaperAuthor[];
  publicationYear: number | null;
  journalName: string | null;
  volume: string | null;
  issue: string | null;
  pageRange: string | null;
  doi: string | null;
  issn: string | null;
  abstract: string | null;
  keywords: string[];
  originalLanguage: string | null;
  /** 사람이 고쳐 쓴 참고문헌. 없으면 null. */
  citationOverride: string | null;
};

/** 목록 화면이 쓰는 한 줄. 참고문헌까지 만들어 담는다. */
export type PaperListItem = {
  sourceId: string;
  /** 읽을 후보인지. 참고문헌이 비어 있는 이유가 여기 있다. (설계 문서 8.4절) */
  readingCandidate: boolean;
  title: string;
  publicationYear: number | null;
  /** 보여줄 참고문헌. */
  citation: string;
  /** 사람이 고쳐 쓴 것인지. */
  citationEdited: boolean;
  doi: string | null;
  createdAt: string;
};

type ProfileRow = {
  id: string;
  source_id: string;
  authors: unknown;
  publication_year: number | null;
  journal_name: string | null;
  volume: string | null;
  issue: string | null;
  page_range: string | null;
  doi: string | null;
  issn: string | null;
  abstract: string | null;
  keywords: string[] | null;
  original_language: string | null;
  citation_override: string | null;
};

/**
 * 저장된 저자 목록을 읽는다.
 *
 * 데이터베이스의 열은 jsonb라 무엇이든 들어갈 수 있다. 제약조건이 모양을
 * 지키고 있지만, 읽는 쪽도 확인한다. 모양이 깨진 값 하나가 참고문헌 생성을
 * 통째로 멈추게 두지 않는다. 알아볼 수 없는 항목은 버리고 나머지로 만든다.
 */
function readAuthors(value: unknown): PaperAuthor[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) {
      return [];
    }

    const record = item as Record<string, unknown>;
    const family = typeof record.family === "string" ? record.family.trim() : "";

    if (family.length === 0) {
      return [];
    }

    const given = typeof record.given === "string" ? record.given.trim() : "";

    return [given.length > 0 ? { family, given } : { family }];
  });
}

function toProfile(row: ProfileRow): PaperProfile {
  return {
    id: row.id,
    sourceId: row.source_id,
    authors: readAuthors(row.authors),
    publicationYear: row.publication_year,
    journalName: row.journal_name,
    volume: row.volume,
    issue: row.issue,
    pageRange: row.page_range,
    doi: row.doi,
    issn: row.issn,
    abstract: row.abstract,
    keywords: row.keywords ?? [],
    originalLanguage: row.original_language,
    citationOverride: row.citation_override,
  };
}

/** 자료 하나의 논문 정보. 아직 적지 않았으면 null. */
export async function getPaperProfile(
  sourceId: string,
): Promise<PaperProfile | null> {
  await requireActiveAccount();

  const supabase = await createClient();

  // RLS의 paper_profiles_select_own 정책이 내 것만 돌려준다.
  const { data, error } = await supabase
    .from("paper_profiles")
    .select(PROFILE_COLUMNS)
    .eq("source_id", sourceId)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 논문 정보 조회 실패:", error.message);

    // 모르면 없는 것으로 본다. 화면은 "아직 적지 않았다"를 보여준다.
    return null;
  }

  return data ? toProfile(data as ProfileRow) : null;
}

/**
 * 논문 자료의 참고문헌을 만든다.
 *
 * 제목과 원문 주소는 sources에 있고 나머지는 paper_profiles에 있다.
 * 둘을 합쳐야 한 줄이 나온다. 그 합치는 일을 한 곳에 둔다.
 */
export function buildCitation(
  profile: PaperProfile,
  source: { title: string; originalUrl: string | null },
): { text: string; edited: boolean } {
  return resolveCitation(
    {
      authors: profile.authors,
      year: profile.publicationYear,
      title: source.title,
      journalName: profile.journalName,
      volume: profile.volume,
      issue: profile.issue,
      pageRange: profile.pageRange,
      doi: profile.doi,
      url: source.originalUrl,
      language: profile.originalLanguage,
    },
    profile.citationOverride,
  );
}

/**
 * 내 논문 목록. 발행 연도 내림차순으로 돌려준다.
 *
 * 논문 유형인 자료 전부를 담는다. 아직 서지 정보를 적지 않은 것도 나온다.
 * 적지 않았다고 목록에서 감추면, 적어야 할 논문이 어느 것인지 알 수 없다.
 */
export async function listPapers(
  sort: PaperSort = DEFAULT_PAPER_SORT,
): Promise<PaperListItem[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("sources")
    .select(
      `id, status, title, original_url, created_at, paper_profiles (${PROFILE_COLUMNS})`,
    )
    .eq("type", "paper")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[ThreadMark] 논문 목록 조회 실패:", error.message);

    return [];
  }

  const items = (data ?? []).map((row) => {
    const source = row as unknown as {
      id: string;
      status: string;
      title: string;
      original_url: string | null;
      created_at: string;
      paper_profiles: ProfileRow[] | ProfileRow | null;
    };

    /*
      PostgREST는 관계를 배열로도 객체로도 돌려준다.
      source_id에 unique가 걸려 있어 항상 하나뿐이지만, 어느 모양으로 오든
      같은 결과가 나오게 한다. 모양 하나 때문에 목록이 비는 일은 없어야 한다.
    */
    const related = Array.isArray(source.paper_profiles)
      ? (source.paper_profiles[0] ?? null)
      : source.paper_profiles;

    if (!related) {
      return {
        sourceId: source.id,
        readingCandidate: isReadingCandidate(source.status),
        title: source.title,
        publicationYear: null,
        // 서지 정보가 없으면 제목만으로 만든다. `(n.d.). 제목.`이 나온다.
        citation: formatApaCitation({
          authors: [],
          year: null,
          title: source.title,
          journalName: null,
          volume: null,
          issue: null,
          pageRange: null,
          doi: null,
          url: source.original_url,
          language: null,
        }),
        citationEdited: false,
        doi: null,
        createdAt: source.created_at,
      } satisfies PaperListItem;
    }

    const profile = toProfile(related);
    const citation = buildCitation(profile, {
      title: source.title,
      originalUrl: source.original_url,
    });

    return {
      sourceId: source.id,
      readingCandidate: isReadingCandidate(source.status),
      title: source.title,
      publicationYear: profile.publicationYear,
      citation: citation.text,
      citationEdited: citation.edited,
      doi: profile.doi,
      createdAt: source.created_at,
    } satisfies PaperListItem;
  });

  /*
    데이터베이스에서 정렬하지 않는다. 연도와 참고문헌이 관계 테이블에 있어
    PostgREST로 정렬하려면 질의가 복잡해진다. 한 사람의 논문 목록은 이 방식으로
    감당하기 어려울 만큼 길어지지 않는다.
  */
  return sortPapers(items, sort);
}

/**
 * 논문 목록을 고른 방법으로 늘어놓는다.
 *
 * 연도를 모르는 논문은 **어느 방향으로 정렬하든 뒤로** 보낸다. 오래된 순에서
 * 앞으로 오면, 연도를 모르는 것이 가장 오래된 것처럼 보인다. 모르는 것과
 * 0년은 다르다.
 */
function sortPapers(
  items: PaperListItem[],
  sort: PaperSort,
): PaperListItem[] {
  const byYear = (direction: 1 | -1) => (a: PaperListItem, b: PaperListItem) => {
    if (a.publicationYear === b.publicationYear) {
      return 0;
    }

    if (a.publicationYear === null) {
      return 1;
    }

    if (b.publicationYear === null) {
      return -1;
    }

    return (a.publicationYear - b.publicationYear) * direction;
  };

  switch (sort) {
    case "year_asc":
      return items.sort(byYear(1));

    case "recent":
      return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    case "citation":
      /*
        참고문헌 가나다순. APA 목록이 저자 이름순이라, 원고에 그대로 옮겨
        적을 때 이 순서가 필요하다. 한글과 로마자가 섞이므로 한국어 기준으로
        견준다. 코드 순서로 견주면 한글이 전부 뒤로 밀린다.
      */
      return items.sort((a, b) => a.citation.localeCompare(b.citation, "ko"));

    case "year_desc":
    default:
      return items.sort(byYear(-1));
  }
}
