/**
 * 음악 서비스 검색 바로가기. (설계 문서 13.3절, 13.6절)
 *
 * **여기서 만드는 것은 "이 곡의 링크"가 아니라 "검색 화면 주소"다.**
 * 그 구분이 이 파일에서 가장 중요하다.
 *
 * 왜 필요한가
 *   찾아오기로 얻는 재생 링크는 Apple Music 하나뿐이다. MusicBrainz는 한국
 *   곡에 서비스 링크가 거의 채워져 있지 않다. 녹음과 판 양쪽에 물어봤고 둘 다
 *   0개였다. (13.3-1절) 나머지 서비스는 사용자가 직접 찾아 주소를 가져와야
 *   하는데, 그 첫 걸음을 짧게 만든다. 논문 검색 허브(8.5절)와 같은 생각이다.
 *
 * **검색 주소를 `들을 수 있는 곳`에 담지 않는다.**
 *   담으면 목록에 `YouTube`라고 뜨는데 눌러보면 검색 결과 화면이다.
 *   그 곡이 아니다. 사용자는 담아둔 링크가 그 곡을 가리킨다고 믿는다.
 *   이 주소들은 **새 탭으로 열기만** 하고, 사용자가 거기서 곡을 찾아 진짜
 *   주소를 복사해 손으로 담는다.
 *
 * 밖에서는 확인할 수 없다
 *   8.5절에서 두 번 틀렸다. 응답이 200인지 보는 것도, 검색어가 응답에
 *   나오는지 세는 것도 틀렸다. 요즘 사이트는 화면을 자바스크립트로 그려서
 *   서버 응답만으로는 알 수 없다.
 *
 *   그래서 **처음에는 전부 `copy`로 두었다.** 검색어를 클립보드에 복사해 두고
 *   검색 화면만 연다. 붙여넣기 한 번이 더 들지만 **어느 사이트에서도
 *   틀리지 않는다.** 주소에 검색어를 실어 보내놓고 빈 화면이 뜨면 사용자는
 *   우리 기능이 고장 난 줄 안다.
 *
 *   브라우저에서 사람이 눌러보고 "이 주소는 검색어를 받는다"를 확인한 것만
 *   `link`로 바꾼다. 서버에서 받아본 것으로 바꾸지 않는다.
 *
 *   **2026-09-24에 사용자가 일곱 곳을 모두 눌러보고 `밤편지 아이유`로 실제
 *   검색되는 것을 확인했다.** 그래서 지금은 전부 `link`다. 붙여넣기 없이
 *   바로 검색된다.
 *
 *   `copy`를 없애지 않는다. **새로 더하는 곳의 안전한 출발점**이기 때문이다.
 *   지금 쓰는 곳이 없다고 지우면, 다음에 사이트를 더할 때 확인도 하기 전에
 *   `link`로 적게 된다. 쓰지 않을 값을 미리 만들지 않는다는 원칙과 다르다.
 *   이것은 쓰지 않을 값이 아니라 **다음 사람이 반드시 거쳐야 할 자리**다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

export type MusicSearchSite = {
  id: string;
  name: string;
  /**
   * 검색어를 주소로 넘길 수 있는지.
   *
   *   link  주소에 넣으면 그 검색어로 검색된 화면이 열린다
   *   copy  아직 확인하지 않았거나 넘길 수 없다. 복사해 두고 화면만 연다
   *
   * **사람이 브라우저에서 눌러본 것만 `link`다.**
   */
  mode: "link" | "copy";
  /** `link`일 때 쓰는 주소. `{q}`가 검색어로 바뀐다. */
  queryTemplate?: string;
  /** `copy`일 때 여는 검색 화면. 검색어가 들어가지 않는다. */
  searchUrl: string;
  /** 국내 서비스인지. 화면에서 묶어 보여준다. */
  korean: boolean;
};

export const MUSIC_SEARCH_SITES: readonly MusicSearchSite[] = [
  {
    id: "youtube-music",
    name: "YouTube Music",
    mode: "link",
    queryTemplate: "https://music.youtube.com/search?q={q}",
    searchUrl: "https://music.youtube.com/",
    korean: false,
  },
  {
    id: "youtube",
    name: "YouTube",
    mode: "link",
    queryTemplate: "https://www.youtube.com/results?search_query={q}",
    searchUrl: "https://www.youtube.com/",
    korean: false,
  },
  {
    id: "spotify",
    name: "Spotify",
    mode: "link",
    queryTemplate: "https://open.spotify.com/search/{q}",
    searchUrl: "https://open.spotify.com/search",
    korean: false,
  },
  {
    id: "melon",
    name: "멜론",
    mode: "link",
    queryTemplate: "https://www.melon.com/search/total/index.htm?q={q}",
    searchUrl: "https://www.melon.com/",
    korean: true,
  },
  {
    id: "bugs",
    name: "벅스",
    mode: "link",
    queryTemplate: "https://music.bugs.co.kr/search/integrated?q={q}",
    searchUrl: "https://music.bugs.co.kr/",
    korean: true,
  },
  {
    id: "genie",
    name: "지니뮤직",
    mode: "link",
    queryTemplate: "https://www.genie.co.kr/search/searchMain?query={q}",
    searchUrl: "https://www.genie.co.kr/",
    korean: true,
  },
  {
    id: "vibe",
    name: "바이브",
    mode: "link",
    queryTemplate: "https://vibe.naver.com/search?query={q}",
    searchUrl: "https://vibe.naver.com/today",
    korean: true,
  },
];

/** 곡 이름과 아티스트를 붙인 검색어. 둘을 함께 넣어야 같은 제목이 안 섞인다. */
export function buildSearchTerm(title: string, artist: string | null): string {
  return [title, artist]
    .filter((part): part is string => Boolean(part && part.trim()))
    .map((part) => part.trim())
    .join(" ");
}

/**
 * 열 주소를 만든다.
 *
 * `link`이면 검색어를 넣은 주소를, `copy`이면 검색 화면 주소를 돌려준다.
 * 부르는 쪽은 `mode`를 보고 클립보드에 복사할지 정한다.
 *
 * `encodeURIComponent`로 감싼다. 한글과 공백과 `&`가 그대로 들어가면 주소가
 * 깨지거나 검색어가 잘린다. 8.5절에서 같은 이유로 겪었다.
 */
export function buildSearchUrl(
  site: MusicSearchSite,
  title: string,
  artist: string | null,
): string {
  if (site.mode !== "link" || !site.queryTemplate) {
    return site.searchUrl;
  }

  return site.queryTemplate.replace(
    "{q}",
    encodeURIComponent(buildSearchTerm(title, artist)),
  );
}
