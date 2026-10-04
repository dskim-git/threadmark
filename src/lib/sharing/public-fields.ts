/**
 * 공개되는 프로젝트에서 **무엇이 나가고 무엇이 안 나가는가.** (16-B.8 2차례)
 *
 * **이 파일에 다른 것을 import하지 않는다.** 데이터베이스를 무는 쪽도, 화면도
 * 여기 없다. 검사가 이 목록만 따로 들여다볼 수 있어야 한다.
 * (AGENTS.md 6절 `검사가 부르는 모듈은 잎사귀로 둔다`)
 *
 * 왜 한 곳에 적는가
 *   **화면마다 손으로 고르면 화면이 하나 늘 때 빠뜨린다.** 이 저장소는 같은
 *   종류의 뒤처짐을 이미 두 번 겪었다. `EXPORTED_TABLES`와
 *   `PROFILE_SEARCH_TARGETS`가 같은 까닭으로 있고, **둘 다 빠뜨린 자리가
 *   생겨 검사로 묶은 뒤에야 멈췄다.**
 *
 *   이 자리는 그 둘보다 무겁다. 그쪽은 빠뜨리면 **덜 나왔다.** 내려받은
 *   파일에 표 하나가 비거나 검색이 못 찾았다. 여기는 반대다. **빠뜨리면 더
 *   나간다.** 남의 글이 나가고, 한 번 나간 것은 되돌릴 수 없다.
 *
 * 무엇을 가리는 목록인가
 *   **보는 사람에게 글자로 나가는 값**이다. 서버가 뼈대를 세우거나 무엇이
 *   이 프로젝트에 속하는지 가리는 데 쓰는 번호는 여기서 "나가는 것"이
 *   아니다. 나가는 것은 세워진 모양이지 번호가 아니다.
 *
 * 이 결정이 쉬운 까닭
 *   이 앱은 처음부터 원문과 내 생각을 다른 칸에 담아 왔다. (설계 문서 2.4절)
 *   그래서 "내 생각만 공유한다"가 **판단이 아니라 칸 고르기**가 된다.
 *   한 칸에 섞어 담았다면 글 안에서 인용 부분만 골라내야 하는데, 그 일은
 *   기계가 못 하고 사람도 틀린다. (16-B.1절)
 *
 * 기준 둘
 *   1. **내가 쓴 글이면 나간다.** 메모, 왜 골랐는지, 읽고 나서, 뼈대와 원고.
 *   2. **참고문헌에 적는 값이면 나간다.** 저자, 학술지, 연도, DOI, 주소.
 *      인용이 아니라 **인용 표시**다.
 *
 *   둘 중 어디에도 안 들어가면 안 나간다. 자세한 것은 설계 문서 16-B.3절.
 *
 * 정하지 않은 것은 안 나간다
 *   16-B.3절이 말하지 않은 칸은 `withhold`에 **까닭과 함께** 둔다.
 *   **까닭 없이 빠지면 그것은 빠뜨린 것이지 정한 것이 아니다.** 공개하기로
 *   정하면 그때 `publish`로 옮긴다.
 *
 *   2026-10-04에 남아 있던 다섯 자리를 **모두 안 나가는 쪽으로 정했다.**
 *   프로젝트의 `무엇을 묻고 있는가`·`무엇을 만들려는가`, 논문 분석, 원고
 *   활용 계획, 태그, 그리고 기록의 종류다. 까닭은 각 자리에 적었다.
 *   공통된 생각은 하나다. **빼도 공개 페이지가 성립한다.** 프로젝트 이름과
 *   설명, 뼈대, 그 자리에 쓴 글, 메모, 서지가 다 나간다.
 *
 * 칸만으로는 모자란 자리가 있다
 *   기계가 쓴 기록이 그렇다. 칸을 안 내보내도 **그 글이 내 생각이라는
 *   얼굴로 나간다.** 줄 자체를 고르지 않아야 한다. 그래서 `PUBLIC_ROW_RULES`가
 *   따로 있다. 아래 `어느 줄이 나가는가`를 본다.
 *
 * 함께 보는 곳
 *   `tests/sharing-public-fields.test.mjs`가 마이그레이션에서 표와 칸을
 *   **직접 뽑아** 이 목록과 견준다. 양쪽에서 조인다. 칸을 새로 만들고 여기에
 *   적지 않아도 실패하고, 없는 칸을 적어도 실패한다.
 */

/** 공개되는 프로젝트에서 무언가 나가는 표. */
export type PublicTable =
  | "projects"
  | "sources"
  | "captures"
  | "project_outline_nodes"
  | "project_node_items"
  | "paper_profiles"
  | "book_profiles"
  | "website_profiles"
  | "youtube_profiles"
  | "music_profiles"
  | "media_profiles";

/** 표 하나에서 무엇이 나가고 무엇이 안 나가는가. */
export type PublicTableFields = {
  table: PublicTable;
  /** 보는 사람에게 나가는 칸. */
  publish: readonly string[];
  /** 나가지 않는 칸과 그 까닭. **까닭 없는 칸을 두지 않는다.** */
  withhold: Readonly<Record<string, string>>;
};

/**
 * 어느 표에서 어느 칸이 나가는가.
 *
 * `publish`와 `withhold`를 합치면 그 표의 칸 **전부**여야 한다. 검사가
 * 그것을 본다. 칸을 새로 만들면 어느 쪽인지 여기서 정해야 하고, 정하지
 * 않으면 `npm test`가 멈춘다.
 */
export const PUBLIC_PROJECT_FIELDS: readonly PublicTableFields[] = [
  {
    /*
      공개하는 단위 그 자체다. (16-B.4절)

      자료 하나나 기록 하나는 열지 않는다. 이 앱에서 남에게 보여줄 만한
      것은 `이 수업 준비` 같은 묶음이고, **한 곳만 열면 새는 구멍도 한
      곳이다.**
    */
    table: "projects",
    publish: ["name", "description", "project_type"],
    withhold: {
      id: "주소에 쓰는 번호다. 공개 주소는 따로 만든 긴 열쇠로 연다. 번호를 그대로 쓰면 바꿔 가며 남의 것을 열어볼 수 있다 (16-B.5절)",
      owner_id: "공개하는 사람이 누구인지는 보는 쪽에 필요하지 않다 (16-B.3절)",
      status: "진행 중인지 끝났는지는 내 작업 상태다",
      visibility: "공개 여부를 정하는 값 자체다. 보는 사람에게 알릴 것이 없다",
      start_date: "언제부터 작업했는지는 내 일정이다",
      end_date: "언제까지 작업했는지는 내 일정이다",
      color: "내 화면에서 프로젝트를 구분하려고 고른 색이다",
      /*
        **2026-10-04에 안 나가는 쪽으로 정했다.** 내가 쓴 글이지만 공개
        페이지는 **지금까지 생각한 것**을 보여주는 자리이고, 무엇을 묻고
        있는지와 무엇을 만들려는지는 **아직 바뀔 수 있는 속내**다.

        빼도 공개 페이지가 성립한다. 프로젝트 이름과 설명, 뼈대, 그 자리에
        쓴 글이 다 나간다. **빼서 읽을 수 없게 되는 값이 아니다.**
      */
      research_question: "무엇을 묻고 있는지는 아직 바뀔 수 있는 속내다. 안 나가는 쪽으로 정했다",
      target_output: "무엇을 만들려는지는 아직 바뀔 수 있는 속내다. 안 나가는 쪽으로 정했다",
      created_at: "언제 만들었는지는 내 작업 기록이다",
      updated_at: "언제 고쳤는지는 내 작업 기록이다",
      deleted_at:
        "지운 것은 공개되지 않는다. 고르는 쪽에서 걸러내고, 이 값 자체가 나갈 자리는 없다",
    },
  },
  {
    /*
      자료. **제목은 인용이 아니라 인용 표시다.** (16-B.3절)

      무엇에 대한 메모인지 알려면 제목이 있어야 한다. 제목 없이 메모만
      늘어놓으면 보는 사람이 읽을 수가 없다.
    */
    table: "sources",
    publish: ["type", "title", "subtitle", "description"],
    withhold: {
      id: "자료를 가리키는 번호다. 나가는 것은 자료의 제목이지 번호가 아니다",
      owner_id: "공개하는 사람이 누구인지는 보는 쪽에 필요하지 않다 (16-B.3절)",
      /*
        **표지와 포스터가 담기는 자리가 여기다.**

        16-B.3절은 이것을 `media_profiles`·`music_profiles`의 표지 그림이라고
        적었는데, 실제로 담기는 칸은 자료의 이 칸 하나다. 영화 포스터,
        앨범 아트, 책 표지가 모두 여기로 들어온다. **세어 보고 적는다.**
      */
      thumbnail_url:
        "표지·포스터·앨범 아트가 담기는 자리다. **남의 그림이다** (16-B.3절)",
      canonical_url:
        "Drive 링크가 들어올 수 있다. 파일은 나가지 않는다 (2.3절, 16-B.3절)",
      original_url:
        "Drive 링크가 들어올 수 있다. 파일은 나가지 않는다 (2.3절, 16-B.3절)",
      /*
        밖에서 받아온 값이 통째로 들어오는 자리다. 무엇이 담겼는지 칸 이름이
        말해주지 않으므로 내보낼 수 없다. **읽어보지 않고 내보내는 칸을
        만들지 않는다.**
      */
      metadata: "밖에서 받아온 값이 통째로 들어 있다. 무엇이 담겼는지 칸 이름이 말해주지 않는다",
      visibility: "공개 여부를 정하는 값 자체다",
      status: "읽을 후보인지 읽는 중인지는 내 상태다",
      starred: "내가 별을 붙였는지는 내 표시다",
      created_at: "언제 담았는지는 내 기록이다",
      updated_at: "언제 고쳤는지는 내 기록이다",
      deleted_at: "지운 것은 공개되지 않는다",
    },
  },
  {
    /*
      기록. **이 표가 16-B 전체의 까닭이다.**

      `content`는 내가 쓴 것이고 `original_text`는 자료가 한 말이다.
      `captures_quote_needs_original` 같은 제약조건이 데이터베이스에서 그
      구분을 지키고 있다. (16-B.1절)
    */
    table: "captures",
    publish: ["content"],
    withhold: {
      id: "기록을 가리키는 번호다",
      owner_id: "공개하는 사람이 누구인지는 보는 쪽에 필요하지 않다 (16-B.3절)",
      source_id: "어느 자료에 달린 메모인지는 서버가 묶는 데 쓴다. 나가는 것은 묶인 모양이지 번호가 아니다",
      /*
        **2026-10-04에 안 나가는 쪽으로 정했다.**

        인용에 붙인 메모인지 그냥 메모인지 알려도 될 것 같았다. 그런데
        **원문이 없는 자리에 `인용`이라고 적으면 인용문이 빠진 것처럼
        보인다.** 보는 사람은 고장이라고 여기거나 원문을 보여달라고 한다.

        없는 것을 없다고 말하지 않는 쪽이 아니라, **처음부터 그 자리를
        만들지 않는 쪽**을 골랐다. 나가는 것은 내가 쓴 글이고, 그 글이
        무엇을 보고 쓴 것인지는 자료 제목이 말한다.
      */
      capture_type: "원문이 나가지 않는 자리에 `인용`이라고 적으면 글이 빠진 것처럼 보인다",
      original_text:
        "**인용한 원문이다. 남의 글이다** (16-B.3절). NEVER_PUBLIC에도 못 박혀 있다",
      translated_text:
        "**기계가 옮긴 글이다. 원문의 파생물이다** (16-B.2절). 다른 말로 옮겼다고 남의 글이 내 글이 되지 않는다. NEVER_PUBLIC에도 못 박혀 있다",
      translation_language: "옮긴 글이 나가지 않으므로 그 글에 딸린 값도 나갈 자리가 없다",
      translation_provider: "옮긴 글이 나가지 않으므로 그 글에 딸린 값도 나갈 자리가 없다",
      translation_model: "옮긴 글이 나가지 않으므로 그 글에 딸린 값도 나갈 자리가 없다",
      translated_at: "옮긴 글이 나가지 않으므로 그 글에 딸린 값도 나갈 자리가 없다",
      /*
        **2026-10-04에 정했다. 기계가 쓴 기록은 아예 공개하지 않는다.**

        칸을 안 내보내는 것으로는 모자랐다. 칸만 빼면 기계가 쓴 글이
        **내 생각이라는 얼굴로** 나간다. 16-B는 "내가 생각한 것"을
        공유하는 기능이고, 그 약속이 깨지는 쪽이 더 나쁘다.

        그래서 줄 자체를 고르지 않는다. 그 일은 칸 목록이 아니라 조회
        조건이 하므로 3차례에서 정책에 넣는다. 이 칸은 공개 여부를 정하는
        값이라 보는 쪽에 알릴 것이 없다. (`PUBLIC_ROW_RULES`)
      */
      ai_generated:
        "기계가 쓴 기록은 줄 자체가 공개되지 않는다. 이 값은 그것을 가리는 데 쓰고 나가지 않는다",
      verification_status: "사람이 쓴 것인지 가리는 값이다. ai_generated와 같은 자리에서 쓰고 나가지 않는다",
      locator:
        "자료 안 어디였는지다. jsonb라 무엇이 담겼는지 칸 이름이 말해주지 않고, 유형마다 모양이 다르다 (6.3절)",
      starred: "내가 별을 붙였는지는 내 표시다",
      created_at: "언제 남겼는지는 내 기록이다",
      updated_at: "언제 고쳤는지는 내 기록이다",
      deleted_at: "지운 것은 공개되지 않는다",
    },
  },
  {
    /*
      프로젝트 뼈대와 그 자리에 쓴 원고. (19-A) **전부 내가 쓴 것이다.**
    */
    table: "project_outline_nodes",
    publish: ["title", "body"],
    withhold: {
      id: "자리를 가리키는 번호다",
      owner_id: "공개하는 사람이 누구인지는 보는 쪽에 필요하지 않다 (16-B.3절)",
      project_id: "어느 프로젝트의 뼈대인지는 서버가 묶는 데 쓴다",
      parent_id:
        "위 자리를 가리키는 번호다. 서버가 뼈대를 세우는 데 쓴다. **나가는 것은 세워진 모양이지 번호가 아니다**",
      position: "형제 사이의 순서다. 나가는 것은 줄 세운 결과지 숫자가 아니다",
      created_at: "언제 만들었는지는 내 작업 기록이다",
      updated_at: "언제 고쳤는지는 내 작업 기록이다",
    },
  },
  {
    /*
      자리에 놓은 재료에 붙인 "이걸로 여기서 할 말". (19-B) 내가 쓴 것이다.
    */
    table: "project_node_items",
    publish: ["note"],
    withhold: {
      id: "놓인 재료를 가리키는 번호다",
      owner_id: "공개하는 사람이 누구인지는 보는 쪽에 필요하지 않다 (16-B.3절)",
      node_id: "어느 자리에 놓였는지는 서버가 묶는 데 쓴다",
      source_id: "어느 자료를 놓았는지는 서버가 묶는 데 쓴다",
      capture_id: "어느 기록을 놓았는지는 서버가 묶는 데 쓴다",
      position: "한 자리 안에서의 순서다. 나가는 것은 줄 세운 결과다",
      created_at: "언제 놓았는지는 내 작업 기록이다",
      updated_at: "언제 고쳤는지는 내 작업 기록이다",
    },
  },
  {
    /*
      논문의 서지. **참고문헌에 적는 값은 공개된 사실이다.**

      `abstract` 하나만 갈라진다. 딸린 정보 표를 통째로 훑어보니 밖에서
      받아온 **긴 글**은 그것 하나였다. (16-B.3절)
    */
    table: "paper_profiles",
    publish: [
      "authors",
      "publication_year",
      "journal_name",
      "volume",
      "issue",
      "page_range",
      "doi",
      "issn",
      "original_language",
      "citation_override",
    ],
    withhold: {
      id: "딸린 정보를 가리키는 번호다",
      owner_id: "공개하는 사람이 누구인지는 보는 쪽에 필요하지 않다 (16-B.3절)",
      source_id: "어느 자료의 서지인지는 서버가 묶는 데 쓴다",
      abstract:
        "**초록이다. 밖에서 받아온 남의 글이고 서지 정보가 아니다** (16-B.3절). NEVER_PUBLIC에도 못 박혀 있다",
      /*
        참고문헌에 적는 값이 아니다. 논문에 실린 저자의 말이라 초록과 같은
        쪽에 둔다. **기준이 `밖에서 왔는가`가 아니라 `참고문헌에 적는가`다.**
      */
      keywords: "참고문헌에 적는 값이 아니다. 논문에 실린 저자의 말이라 초록과 같은 쪽에 둔다",
      created_at: "언제 채웠는지는 내 기록이다",
      updated_at: "언제 고쳤는지는 내 기록이다",
    },
  },
  {
    /*
      책. **서지와 내가 쓴 글이 한 표에 같이 있다.**

      `why_chosen`과 `verdict`는 내가 쓴 글이고, 읽은 데까지와 가진 책인지는
      내 사정이다. 둘을 갈라 둔다.
    */
    table: "book_profiles",
    publish: [
      "authors",
      "translators",
      "publisher",
      "published_on",
      "isbn10",
      "isbn13",
      "total_pages",
      "why_chosen",
      "verdict",
    ],
    withhold: {
      id: "딸린 정보를 가리키는 번호다",
      owner_id: "공개하는 사람이 누구인지는 보는 쪽에 필요하지 않다 (16-B.3절)",
      source_id: "어느 자료의 책 정보인지는 서버가 묶는 데 쓴다",
      holding: "내가 가진 책인지 빌린 책인지다. 책에 대한 사실이 아니라 내 사정이다",
      reading_status: "다 읽었는지 읽는 중인지는 내 독서 기록이다",
      current_page: "어디까지 읽었는지는 내 독서 기록이다",
      started_on: "언제 읽기 시작했는지는 내 독서 기록이다",
      finished_on: "언제 다 읽었는지는 내 독서 기록이다",
      /*
        어디서 값을 받아왔는지다. 공개 화면에 출처를 적어야 하는지는
        **4차례에서 정한다.** Kakao와 TMDB가 정해진 고지 문구를 요구할 수
        있고, 그 판단은 화면을 만들 때 함께 한다. (15.1절, 17-2.4절)
      */
      metadata_source: "어디서 값을 받아왔는지다. 공개 화면의 출처 표기는 4차례에서 정한다",
      fetched_at: "언제 받아왔는지는 운영 기록이다",
      created_at: "언제 채웠는지는 내 기록이다",
      updated_at: "언제 고쳤는지는 내 기록이다",
    },
  },
  {
    /*
      웹사이트. 사이트 이름과 글쓴이는 참고문헌에 적는 값이다.
    */
    table: "website_profiles",
    publish: ["site_name", "author", "published_at"],
    withhold: {
      id: "딸린 정보를 가리키는 번호다",
      owner_id: "공개하는 사람이 누구인지는 보는 쪽에 필요하지 않다 (16-B.3절)",
      source_id: "어느 자료의 사이트 정보인지는 서버가 묶는 데 쓴다",
      favicon_url: "남의 그림이다. **작은 그림도 그림이다**",
      fetched_at: "언제 받아왔는지는 운영 기록이다",
      created_at: "언제 채웠는지는 내 기록이다",
      updated_at: "언제 고쳤는지는 내 기록이다",
    },
  },
  {
    /*
      YouTube. 채널 이름과 길이는 참고문헌에 적는 값이다.

      **영상 번호는 내보내지 않는다.** 그 번호가 있으면 공개 페이지에서
      남의 영상을 틀 수 있게 된다. 재생을 다루는 자리는 13.6절이고,
      공개 페이지에서 할 일이 아니다.
    */
    table: "youtube_profiles",
    publish: ["channel_name", "published_at", "duration_seconds"],
    withhold: {
      id: "딸린 정보를 가리키는 번호다",
      owner_id: "공개하는 사람이 누구인지는 보는 쪽에 필요하지 않다 (16-B.3절)",
      source_id: "어느 자료의 영상 정보인지는 서버가 묶는 데 쓴다",
      video_id:
        "이 번호가 있으면 공개 페이지에서 남의 영상을 틀 수 있게 된다. 재생은 13.6절이 다루는 자리다",
      embeddable: "틀 수 있는 영상인지다. 공개 페이지에서 틀지 않으므로 나갈 자리가 없다",
      fetched_at: "언제 받아왔는지는 운영 기록이다",
      created_at: "언제 채웠는지는 내 기록이다",
      updated_at: "언제 고쳤는지는 내 기록이다",
    },
  },
  {
    /*
      음악. 가수·앨범·작곡가는 참고문헌에 적는 값이다.

      **표지 그림은 이 표에 없다.** `sources.thumbnail_url`에 담긴다.
    */
    table: "music_profiles",
    publish: [
      "artist",
      "album_name",
      "album_artist",
      "released_on",
      "track_number",
      "duration_seconds",
      "genre",
      "language",
      "composer",
      "lyricist",
      "arranger",
    ],
    withhold: {
      id: "딸린 정보를 가리키는 번호다",
      owner_id: "공개하는 사람이 누구인지는 보는 쪽에 필요하지 않다 (16-B.3절)",
      source_id: "어느 자료의 곡 정보인지는 서버가 묶는 데 쓴다",
      created_at: "언제 채웠는지는 내 기록이다",
      updated_at: "언제 고쳤는지는 내 기록이다",
    },
  },
  {
    /*
      영화·드라마. 제목·연도·장르·배우는 참고문헌에 적는 값이다.

      **포스터는 이 표에 없다.** `sources.thumbnail_url`에 담긴다.
    */
    table: "media_profiles",
    publish: [
      "media_kind",
      "original_title",
      "released_on",
      "genres",
      "cast_names",
      "runtime_minutes",
      "season_count",
      "episode_count",
    ],
    withhold: {
      id: "딸린 정보를 가리키는 번호다",
      owner_id: "공개하는 사람이 누구인지는 보는 쪽에 필요하지 않다 (16-B.3절)",
      source_id: "어느 자료의 작품 정보인지는 서버가 묶는 데 쓴다",
      tmdb_id: "TMDB의 번호다. 참고문헌에 적는 값이 아니다",
      watch_link:
        "어디서 볼 수 있는지 링크다. TMDB에서 받아온 값이고 출처 표기 규칙이 함께 걸린다 (15.1절)",
      watch_synced_at: "언제 맞춰봤는지는 운영 기록이다",
      fetched_at: "언제 받아왔는지는 운영 기록이다",
      created_at: "언제 채웠는지는 내 기록이다",
      updated_at: "언제 고쳤는지는 내 기록이다",
    },
  },
];

/**
 * 통째로 나가지 않는 표와 그 까닭.
 *
 * **까닭 없이 빠지면 그것은 빠뜨린 것이지 정한 것이 아니다.**
 * (`EXCLUDED_TABLES`와 같은 생각이다)
 *
 * 여기 이름이 있다는 것은 **이 표에서 글자로 나가는 값이 하나도 없다**는
 * 뜻이다. 서버가 무엇이 프로젝트에 속하는지 가리려고 묶는 표를 읽는 것은
 * 막지 않는다. 그 표에서 나가는 글이 없다는 뜻이다.
 */
export const WITHHELD_TABLES: Readonly<Record<string, string>> = {
  /*
    사람 정보. **공개하는 사람이 누구인지는 필요하지 않다.** (16-B.3절)
  */
  profiles: "이메일과 이름이 들어 있습니다",
  /*
    아래 넷은 이용자의 것이 아니라 운영에 관한 것이다.
  */
  user_roles: "운영자 권한 기록입니다",
  app_settings: "서비스 운영 설정입니다",
  admin_audit_logs: "운영자 활동 기록입니다",
  google_drive_connections: "Google 접근 권한(토큰)입니다. 본인도 읽지 않습니다",
  /*
    **2.3절이 금지한다.** 파일 자리에는 "올린 사람만 볼 수 있습니다"라고
    적는다. (16-B.3절)
  */
  source_files: "올린 파일입니다. 올린 사람만 볼 수 있습니다",
  ai_usage_events: "AI를 언제 얼마나 불렀는지입니다. 내 사용 기록입니다",
  ai_usage_grants: "AI 허용량 기록입니다. 운영과 내 사정입니다",
  /*
    **내가 쓴 글인데 안 나가는 자리다.** 기준이 "내 글인가"만이 아니라
    "16-B.3절이 공개하기로 정했는가"이기 때문이다.

    논문 분석은 서른 칸이 통째로 사적인 독해다. 첫인상, 내 해석, 조심할
    것까지 들어 있다.

    **2026-10-04에 둘 다 안 나가는 쪽으로 정했다.** 읽는 동안의 글과
    작업 계획이라, 보여줄 만해지기 전의 생각이다. 공개 페이지에 내놓는
    것은 `project_outline_nodes`의 원고와 메모다. 그쪽이 **정리해서 쓴
    글**이고 이쪽은 **정리하는 동안의 글**이다.

    나중에 공개하기로 정하더라도 **칸마다 정해서** `PUBLIC_PROJECT_FIELDS`로
    옮긴다. 표를 통째로 옮기지 않는다.
  */
  paper_analyses:
    "논문을 읽고 쓴 분석입니다. 읽는 동안의 사적인 독해라 공개하지 않습니다",
  paper_project_uses:
    "이 논문을 원고 어디에 쓸지 적은 계획입니다. 진행 중인 작업 계획이라 공개하지 않습니다",
  /*
    태그는 내가 붙인 말이지만 **공개 단위를 넘어선다.** 자료를 가로질러
    묶는 말이라, 프로젝트 하나를 여는데 다른 프로젝트까지 가리키는 말이
    따라 나간다. (16-B.4절)

    **2026-10-04에 안 나가는 쪽으로 정했다.** `프로젝트 하나를 연다`가
    16-B.4절이 정한 단위이고, 태그는 그 단위를 지키지 못하는 유일한
    값이었다. `박사논문` 같은 태그 하나가 공개하지 않은 프로젝트의 이름을
    말해버린다.
  */
  tags: "태그는 자료를 가로질러 묶는 말이라 공개하는 프로젝트 하나를 넘어섭니다",
  source_tags: "태그를 묶는 표입니다. 태그가 나가지 않으므로 나갈 글이 없습니다",
  capture_tags: "태그를 묶는 표입니다. 태그가 나가지 않으므로 나갈 글이 없습니다",
  source_relations: "자료 사이의 관계입니다. 공개하는 프로젝트 밖의 자료를 가리킵니다",
  /*
    **장소. 2026-10-04에 공개 목록에서 뺐다.**

    16-B.3절은 주소와 좌표를 `공개된 사실`로 보고 나가는 쪽에 두었다.
    **저작권으로 보면 그 판단이 맞다.** 주소는 누가 지은 글이 아니다.

    그런데 **다른 기준이 하나 더 있었다.** 그 값은 카카오 로컬 API에서
    받아온 것이고, 카카오맵 API 팀이 데브톡에서 여러 차례 이렇게 답했다.

      "로컬API 결과값은 어떠한 형태로든 저장하여 사용할 수 없고
       실시간 호출로만 이용할 수 있습니다"

      "장소ID와 URL은 저장하여 활용 가능하며, 이 외 데이터는
       DB저장이 불가한 점 참고하여 이용 부탁드립니다"

    **한 값이 두 기준에 걸릴 수 있다는 것을 놓쳤다.** 저작권 하나만 보고
    나가는 쪽에 두었다. (VERIFICATION 4-59·4-60절)

    왜 공개만 먼저 막는가
      **저장과 공개를 가를 수 있다.** 저장은 장소 기능의 전제이고
      (17-1.4절이 그렇게 설계했다) 사용자가 정해야 하는 일이라 카카오의
      확정 답을 기다린다. 공개는 저장보다 **한 걸음 더 나간 일**이고,
      빼도 잃는 것이 거의 없다. 공개 페이지에 **장소 이름(자료 제목)과
      내 메모는 그대로 남는다.**

      덜 나오는 쪽을 골랐다. 더 나가는 쪽은 되돌릴 수 없다.

    카카오가 "담아도 된다"고 답하면 그때 다시 `PUBLIC_PROJECT_FIELDS`로
    옮긴다. **칸마다 정해서 옮긴다.** 표를 통째로 옮기지 않는다.
  */
  place_profiles:
    "장소의 주소와 좌표입니다. 지도 제공자의 이용 정책을 확인하는 동안 공개하지 않습니다",
  /*
    묶는 표다. 무엇이 이 프로젝트에 속하는지 가리는 번호뿐이고 **이 표에서
    나가는 글은 없다.** 서버가 읽는 것은 막지 않는다.
  */
  source_projects: "무엇이 이 프로젝트에 속하는지 가리는 번호뿐입니다",
  capture_projects: "무엇이 이 프로젝트에 속하는지 가리는 번호뿐입니다",
  /*
    **열쇠가 담긴 표다. 가장 무거운 자리다.** (16-B)

    여기서 한 칸이라도 공개 쪽으로 넘어가면, 공개 페이지를 본 사람이
    **다른 프로젝트를 여는 열쇠**를 손에 넣는다. 공개한 것 하나가
    공개하지 않은 것 전부를 여는 길이 된다.

    `NEVER_PUBLIC`에 표 전체를 못 박아 두었다.
  */
  project_public_links: "공개 링크의 열쇠와 공개한 내역입니다",
  media_watch_providers:
    "어디서 볼 수 있는지입니다. TMDB에서 받아온 값이고 출처 표기 규칙이 함께 걸립니다 (15.1절)",
  music_provider_links: "듣기 링크입니다. 내 글도 서지도 아닙니다 (13.6절)",
};

/** 어느 줄이 나갈 수 있는지 가리는 조건 하나. */
export type PublicRowRule = {
  table: string;
  /** 이 칸이 */
  column: string;
  /** 이 값일 때만 그 줄이 나간다. */
  mustBe: boolean | null;
  reason: string;
};

/**
 * **어느 줄이 나가는가.** 칸 고르기로는 모자란 자리다. (2026-10-04)
 *
 * `PUBLIC_PROJECT_FIELDS`는 "이 칸이 나가는가"를 정한다. 그것으로 안 되는
 * 것이 둘 있었다.
 *
 * **기계가 쓴 기록.** `ai_generated`를 안 내보내도 그 글은 나간다. 그리고
 * 공개 페이지에 다른 메모들과 나란히 놓이면 **내가 생각한 것이라는 얼굴로**
 * 나간다. 16-B는 "내가 생각한 것"을 공유하는 기능이고, 그 약속이 깨지는
 * 쪽이 글 몇 줄 덜 나오는 쪽보다 나쁘다. **줄 자체를 고르지 않는다.**
 *
 * **지운 것.** 이 앱의 삭제는 표시만 한다. `deleted_at`을 안 내보내는 것은
 * 아무것도 막지 않는다. 지운 글이 공개 페이지에 남아 있으면 **지운 사람은
 * 그것을 모른다.**
 *
 * 이 조건을 실제로 거는 곳은 조회와 정책이다. 여기 적어 두는 까닭은
 * 앞의 목록과 같다. **한 곳에 적혀 있지 않으면 화면이 하나 늘 때
 * 빠뜨린다.** `tests/sharing-public-fields.test.mjs`가 이 조건에 쓰는 칸이
 * 실제로 있는 칸인지, 그리고 그 칸이 공개 목록에 들어 있지 않은지 본다.
 * **가리는 데 쓰는 값은 나가는 값이 아니다.**
 */
export const PUBLIC_ROW_RULES: readonly PublicRowRule[] = [
  {
    table: "captures",
    column: "ai_generated",
    mustBe: false,
    reason: "기계가 쓴 글은 내 생각이 아닙니다",
  },
  {
    table: "captures",
    column: "deleted_at",
    mustBe: null,
    reason: "지운 기록은 공개되지 않습니다",
  },
  {
    table: "sources",
    column: "deleted_at",
    mustBe: null,
    reason: "지운 자료는 공개되지 않습니다",
  },
  {
    table: "projects",
    column: "deleted_at",
    mustBe: null,
    reason: "지운 프로젝트는 공개되지 않습니다",
  },
];

/**
 * 이 줄이 나갈 수 있는가. 걸리는 조건이 없으면 참이다.
 *
 * **마지막 겹이다.** 조건을 거는 자리는 정책과 조회이고, 이 함수는 그 둘이
 * 틀렸을 때 내보내기 전에 한 번 더 본다. `pickPublicFields`와 같은 생각이다.
 *
 * 조건을 보는 칸이 줄에 없으면 **거부한다.** 안 가져온 값으로 "괜찮다"고
 * 판단할 수는 없다. (AGENTS.md 5절 7번 `모르면 거부한다`)
 */
export function rowMayBePublic(
  table: string,
  row: Record<string, unknown>,
): boolean {
  for (const rule of PUBLIC_ROW_RULES) {
    if (rule.table !== table) {
      continue;
    }

    if (!(rule.column in row)) {
      return false;
    }

    const value = row[rule.column];

    if (rule.mustBe === null) {
      if (value !== null && value !== undefined) {
        return false;
      }

      continue;
    }

    if (value !== rule.mustBe) {
      return false;
    }
  }

  return true;
}

/** 절대 나가면 안 되는 자리. `column`이 `*`면 표 전체다. */
export type NeverPublicField = {
  table: string;
  column: string;
  reason: string;
  /**
   * 읽는 문이 이 표를 **보기는 해야** 하는가. (기본값: 아니다)
   *
   * **`나가지 않는다`와 `닿지도 않는다`는 다르다.** 이 구분을 적어두지
   * 않으면 검사가 둘을 같은 것으로 보고, 문이 열쇠 표를 보는 것만으로
   * 실패한다. 실제로 그렇게 한 번 멈췄다.
   *
   * `project_public_links`가 그 경우다. 문은 **열쇠로 프로젝트를 찾아야**
   * 하므로 그 표를 읽는다. 그러나 그 표의 값은 하나도 돌려주지 않는다.
   * 열쇠를 돌려주면 공개 페이지를 본 사람이 열쇠를 손에 넣는다.
   *
   * `source_files`는 반대다. **이름조차 나오면 안 된다.** 파일에 대해
   * 문이 할 일이 없다. 2.3절이 금지한다.
   */
  doorMayRead?: boolean;
};

/**
 * **절대 나가면 안 되는 것.** 사용자가 정한 것이다.
 *
 * > 1차적인 원문이 공개되는 것이 가장 불안정한거잖아.
 *
 * `withhold`와 다르다. 그쪽은 **"지금은 안 나간다"**이고 나중에 정하면
 * `publish`로 옮길 수 있다. 이쪽은 **"옮길 수 없다"**다. 검사가 이 칸이
 * `publish`에 들어오는 순간 멈춘다.
 *
 * 설계 문서 16-B.3절의 `안 나가는 것` 표와 한 줄씩 맞춰 둔다. 그 표가
 * 바뀌면 여기도 바뀐다. **둘이 어긋나면 설계 문서를 따른다.**
 */
export const NEVER_PUBLIC: readonly NeverPublicField[] = [
  {
    table: "captures",
    column: "original_text",
    reason: "인용한 원문입니다. 남의 글입니다",
  },
  {
    table: "captures",
    column: "translated_text",
    reason: "기계가 옮긴 글입니다. 원문의 파생물이라 남의 글입니다",
  },
  {
    table: "paper_profiles",
    column: "abstract",
    reason: "초록입니다. 밖에서 받아온 남의 글이고 서지 정보가 아닙니다",
  },
  {
    /*
      16-B.3절은 표지 그림을 `media_profiles`·`music_profiles`에 적었는데,
      실제로 담기는 칸은 여기 하나다. 영화 포스터, 앨범 아트, 책 표지가
      모두 이 칸으로 들어온다.
    */
    table: "sources",
    column: "thumbnail_url",
    reason: "표지·포스터·앨범 아트입니다. 남의 그림입니다",
  },
  {
    table: "source_files",
    column: "*",
    reason: "올린 파일입니다. 2.3절이 금지합니다",
  },
  {
    /*
      **공개 링크의 열쇠다.** 이것이 나가면 공개한 것 하나가 공개하지 않은
      것 전부를 여는 길이 된다. 블루프린트 16-B.3절의 표에는 없다. 그 표를
      쓸 때는 이 표가 아직 없었다. (3차례에서 만들었다)
    */
    table: "project_public_links",
    column: "*",
    reason: "공개 링크의 열쇠입니다",
    /*
      읽는 문은 **열쇠로 프로젝트를 찾아야** 하므로 이 표를 본다. 그러나
      이 표의 값은 하나도 돌려주지 않는다. 열쇠를 돌려주면 공개 페이지를
      본 사람이 **다른 프로젝트를 여는 열쇠**를 손에 넣는다.
    */
    doorMayRead: true,
  },
  {
    table: "profiles",
    column: "email",
    reason: "이메일입니다",
  },
  {
    table: "profiles",
    column: "display_name",
    reason: "이름입니다",
  },
];

/**
 * 이 표에서 무엇이 나가는가. 나가는 것이 없는 표면 `null`.
 *
 * **모르는 표도 `null`이다.** 모르면 거부한다. (AGENTS.md 5절 7번)
 * 표를 새로 만들고 이 목록에 적지 않으면 아무것도 나가지 않고, 그 상태를
 * `npm test`가 붙잡는다.
 */
export function publicFieldsFor(table: string): PublicTableFields | null {
  return (
    PUBLIC_PROJECT_FIELDS.find((entry) => entry.table === table) ?? null
  );
}

/** 이 칸이 나가는가. 모르는 표와 모르는 칸은 모두 `false`다. */
export function isPublicField(table: string, column: string): boolean {
  return publicFieldsFor(table)?.publish.includes(column) ?? false;
}

/** 이 표가 통째로 안 나가는 까닭. 아니면 `null`. */
export function withheldTableReason(table: string): string | null {
  return WITHHELD_TABLES[table] ?? null;
}

/**
 * 가져온 줄에서 **나가는 칸만** 남긴다.
 *
 * **왜 조회만으로 끝내지 않는가.** 조회에서 고르는 칸은 글자로 적어야
 * 한다. 상수에 담아 넘기면 타입이 통째로 무너지기 때문이다.
 * (AGENTS.md 6절 `Supabase 조회에서 고르는 칸을 변수로 빼지 않는다`)
 *
 * 그래서 조회문은 사람이 적고, **그것이 이 목록과 맞는지는 검사가 본다.**
 * 그리고 혹시 조회가 더 가져왔더라도 내보내기 전에 여기서 떨어진다.
 * 두 겹으로 막는다. 한 겹이 틀렸을 때 남의 글이 나가는 자리라서다.
 *
 * 모르는 표는 빈 객체다. **모르면 거부한다.**
 */
export function pickPublicFields(
  table: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  const fields = publicFieldsFor(table);

  if (fields === null) {
    return {};
  }

  const picked: Record<string, unknown> = {};

  for (const column of fields.publish) {
    if (column in row) {
      picked[column] = row[column];
    }
  }

  return picked;
}
