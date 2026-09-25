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
 * 표를 새로 만들면 여기에 더한다. 장소(`place_profiles`)가 2026-09-25에
 * 그렇게 들어왔다. 그때는 이 줄이 "곧 그렇게 된다"라고만 적혀 있었다.
 * **적어두는 것만으로는 모자라고, 표를 만드는 그 커밋에서 함께 고쳐야 한다.**
 * 설계 문서 17-1.6절이 다섯 곳을 한자리에 모아 둔 것이 그래서다.
 *
 * 이 목록을 두 검색이 함께 쓴다 (2026-09-26)
 *   만들 때는 `AI에게 물어보기`만 썼다. 그래서 이 파일이 `lib/ai/` 아래
 *   있는데, **`글자로 찾기`도 같은 목록을 본다.**
 *
 *   2026-09-26에 그것을 고쳤다. 그전까지 두 검색이 서로 다른 곳을 뒤지고
 *   있었다. AI에게 물으면 가수 이름으로 찾아주는데 `글자로 찾기`는 못
 *   찾았다. **같은 앱 안에서 찾는 힘이 둘로 갈려 있었고**, 사용법은 오히려
 *   글자로 찾기가 "빠르고 돈이 들지 않는다"고 권하고 있었다.
 *
 *   9월 25일에 찾은 것과 같은 고장이 **한쪽에만 남아 있던 것**이다.
 *   고칠 곳이 여럿일 때 한 곳만 고치면 이렇게 된다.
 *
 * 데이터베이스를 무는 쪽은 둘이다. AI 쪽은 `candidates.ts`, 글자로 찾기
 * 쪽은 `search/queries.ts`다. 이 파일은 **무엇을 뒤질지 적은 목록**뿐이라
 * 검사가 따로 들여다볼 수 있다.
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
    | "media_profiles"
    | "place_profiles";
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
  {
    /*
      장소. (17-1)

      **여기서만 주소가 찾는 값이 된다.** 위에서 주소를 뺐다고 적은 것은
      웹 주소(`url`, `favicon_url`)를 말한 것이다. 사람이 `https://`로
      시작하는 글자를 외워서 찾지는 않는다.

      장소의 주소는 반대다. **`성수동`이나 `세종대로`가 그 장소를 떠올리는
      말 그 자체다.** 가게 이름은 잊어도 어디쯤이었는지는 남는다.

      `category`도 같다. `카페`, `관광명소`처럼 정해진 말이고, 사람은 가게
      이름보다 무엇하는 곳이었는지를 먼저 떠올린다.

      **`phone`과 `place_url`은 넣지 않는다.** 전화번호는 숫자가 우연히
      걸리고, 상세 화면 주소는 웹 주소라 위의 판단이 그대로 적용된다.
    */
    table: "place_profiles",
    text: ["road_address", "address", "category"],
    arrays: [],
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

/**
 * 찾는 말이 실제로 걸린 값만 골라 한 줄로. (2026-09-26)
 *
 * **왜 걸렸는지 보여주려고 만든다.** `성수동`으로 찾았는데 `블루보틀`이
 * 나오면, 왜 나왔는지 알 수 없다. 담아둔 적 없는 것이 섞였다고 여기거나
 * 검색이 고장 났다고 생각한다.
 *
 * `summarizeProfile`과 다르다. 그쪽은 AI에게 넘길 재료라 **가진 것을 다**
 * 적고, 이쪽은 사람에게 보여줄 까닭이라 **걸린 것만** 적는다.
 *
 * 배열 칸도 같은 방식으로 본다. 찾는 쪽이 통째로 같은지로 걸렀으므로,
 * 그 항목은 찾는 말을 담고 있다.
 *
 * 걸린 것이 없으면 `null`이다. **지어내지 않는다.** 대소문자만 다르거나
 * 데이터베이스와 여기의 견주는 방식이 어긋나면 그럴 수 있는데, 그때
 * 아무 값이나 골라 보여주면 엉뚱한 까닭을 말하게 된다.
 */
export function matchedProfileText(
  row: Record<string, unknown>,
  term: string,
): string | null {
  const needle = term.trim().toLowerCase();

  if (needle.length === 0) {
    return null;
  }

  const hits: string[] = [];

  const take = (value: unknown) => {
    if (typeof value !== "string") {
      return;
    }

    const text = value.trim();

    if (text.length > 0 && text.toLowerCase().includes(needle)) {
      hits.push(text);
    }
  };

  for (const [key, value] of Object.entries(row)) {
    if (key === "source_id") {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        take(item);
      }

      continue;
    }

    take(value);
  }

  return hits.length === 0 ? null : hits.join(" · ");
}
