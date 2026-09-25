/**
 * 자료에 딸린 정보 표에서도 찾는다. (2026-09-25, 사용자가 찾음)
 *
 * 무엇이 빠져 있었나
 *   지금까지 뒤지는 곳은 `sources`의 제목·부제·설명과 `captures`의 글뿐이었다.
 *   그런데 담아둔 것의 절반쯤은 **딸린 정보 표**에 있다.
 *
 *   | 못 찾던 것 | 어디에 있나 |
 *   | --- | --- |
 *   | 가수 이름, 앨범 이름 | `music_profiles.artist` |
 *   | 장르 (`스릴러`) | `media_profiles.genres` |
 *   | 배우 이름 | `media_profiles.cast_names` |
 *   | 학술지 이름, 초록 | `paper_profiles` |
 *   | **왜 이 책을 골랐는지** | `book_profiles.why_chosen` |
 *   | 채널 이름 | `youtube_profiles.channel_name` |
 *
 *   마지막 둘이 특히 아팠다. `why_chosen`과 `verdict`는 **사용자가 직접 쓴
 *   글**인데 검색이 한 번도 본 적이 없었다.
 *
 * 왜 표마다 따로 묻는가
 *   한 번에 묻는 길이 둘 있었다.
 *
 *   **뷰를 만드는 것.** 자료마다 딸린 글을 한 칸으로 이어붙인 뷰를 만들면
 *   질의 하나로 끝난다. 그러나 뷰는 **RLS가 새로 걸리는 자리**다.
 *   `security_invoker`를 빠뜨리면 뷰가 주인 권한으로 돌아 남의 것이 샌다.
 *   이 저장소가 지켜온 방식은 "새 자리를 만들면 003에 검사를 붙인다"인데,
 *   그만한 값인지 아직 모른다. **빠른 것보다 새는 구멍이 없는 쪽을 골랐다.**
 *
 *   **글자를 이어 붙여 한 질의로 만드는 것.** 배열 칸에 `cs.{...}`를 섞으면
 *   중괄호와 따옴표를 손으로 막아야 한다. 이 저장소는 그런 자리에서
 *   **오류 없이 결과만 틀리는 일**을 이미 겪었다. (`search/query.ts`)
 *
 *   그래서 표마다 따로 묻고 결과를 합친다. 질의가 열 개쯤 늘지만 전부
 *   나란히 돌고, 하나하나는 RLS가 본인 것만 돌려주는 작은 질의다.
 *   느려지면 그때 뷰를 생각한다.
 *
 * 배열 칸은 통째로 맞는 것만 찾는다
 *   `genres`나 `cast_names`는 글자 포함이 아니라 **낱말이 통째로 같은지**로
 *   찾는다. 장르 이름은 정해진 말이라 그것으로 충분하고, 배열 안의 글자를
 *   부분 일치로 뒤지는 길은 안전하게 만들기 어렵다.
 *
 *   그래서 `스릴러`는 찾고 `스릴`은 못 찾는다. **적어두고 넘어간다.**
 *
 * 표를 새로 만들면 여기에 더한다. 장소(`place_profiles`)가 곧 그렇게 된다.
 *
 * 데이터베이스를 무는 쪽은 `candidates.ts`에 있다. 이 파일은 **무엇을
 * 뒤질지 적은 목록**뿐이라 검사가 따로 들여다볼 수 있다.
 */

/** 딸린 정보 표 하나를 어떻게 뒤질지. */
export type ProfileSearchTarget = {
  /** 표 이름. */
  table:
    | "paper_profiles"
    | "book_profiles"
    | "website_profiles"
    | "music_profiles"
    | "youtube_profiles"
    | "media_profiles";
  /** 글자 포함으로 뒤질 칸. */
  text: readonly string[];
  /** 낱말이 통째로 같은지로 뒤질 칸. */
  arrays: readonly string[];
};

/**
 * 뒤질 곳 목록.
 *
 * **담긴 것을 다 넣지 않는다.** 날짜, 쪽수, 식별자(ISBN, DOI 일부), 주소는
 * 뺐다. 사람이 그 값으로 찾지 않거나, 찾더라도 숫자가 우연히 걸려 엉뚱한
 * 것이 딸려 오기 때문이다.
 *
 * 넣은 것의 기준은 **사람이 그 말로 기억하는가**다. 가수 이름, 장르,
 * 배우, 학술지, 채널, 그리고 자기가 쓴 글.
 */
export const PROFILE_SEARCH_TARGETS: readonly ProfileSearchTarget[] = [
  {
    table: "paper_profiles",
    // 초록은 길지만 그 논문이 무엇에 대한 것인지가 거기 있다.
    text: ["journal_name", "abstract"],
    arrays: ["keywords"],
  },
  {
    table: "book_profiles",
    // why_chosen과 verdict는 **사용자가 직접 쓴 글**이다.
    text: ["publisher", "why_chosen", "verdict"],
    arrays: ["authors", "translators"],
  },
  {
    table: "website_profiles",
    text: ["site_name", "author"],
    arrays: [],
  },
  {
    table: "music_profiles",
    text: [
      "artist",
      "album_artist",
      "album_name",
      "composer",
      "lyricist",
      "genre",
    ],
    arrays: [],
  },
  {
    table: "youtube_profiles",
    text: ["channel_name"],
    arrays: [],
  },
  {
    table: "media_profiles",
    text: ["original_title"],
    arrays: ["genres", "cast_names"],
  },
];

/**
 * 딸린 정보에서 찾은 값들을 한 줄로 만든다.
 *
 * **왜 값을 함께 넘기는가.** 자료를 후보에 넣기만 하고 왜 걸렸는지 넘기지
 * 않으면, AI가 `밤편지`라는 제목만 보고 그것이 아이유의 곡인지 알 수 없다.
 * 걸린 값 자체가 판단의 근거다.
 *
 * 빈 값과 날짜처럼 보이는 것은 뺀다. 배열은 펼쳐서 잇는다.
 */
export function summarizeProfile(row: Record<string, unknown>): string {
  const parts: string[] = [];

  for (const [key, value] of Object.entries(row)) {
    if (key === "source_id") {
      continue;
    }

    if (typeof value === "string") {
      const text = value.trim();

      if (text.length > 0) {
        parts.push(text);
      }

      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && item.trim().length > 0) {
          parts.push(item.trim());
        }
      }
    }
  }

  return parts.join(" · ");
}
