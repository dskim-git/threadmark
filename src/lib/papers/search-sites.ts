/**
 * 논문 검색 사이트 바로가기. (설계 문서 8.5절)
 *
 * 8.5절: "MVP는 사이트 검색 바로가기를 제공한다. Google Scholar 비공식
 * 스크래핑에 의존하지 않는다."
 *
 * 그래서 이 파일에는 검색 결과를 가져오는 코드가 없다. **주소만 만든다.**
 * 검색은 그 사이트에서 이루어지고, 우리는 새 탭을 열어줄 뿐이다.
 *
 * 왜 이것이 쓸모가 있는가
 *   한글 제목으로 논문을 찾을 길이 지금 우리에게 없다. Crossref에는 한글
 *   제목 데이터가 아예 없다. (블루프린트 8.5-1절) 그러니 찾는 일은 국내
 *   사이트에서 하고, 찾은 뒤 DOI나 RIS를 가져와 붙여넣는 것이 지금 가능한
 *   가장 빠른 길이다. 이 화면이 그 첫 걸음을 짧게 만든다.
 *
 * 검색어를 주소로 넘길 수 있는 곳과 아닌 곳이 있다 (2026-09-23 확인)
 *
 *   되는 곳   DBpia, Google Scholar, ERIC, OpenAlex
 *   안 되는 곳 KCI, RISS, Crossref, ScienceON
 *
 *   안 되는 곳은 검색어를 **클립보드에 복사해 두고** 검색 화면만 연다.
 *   붙여넣기 한 번이 더 들지만, 되는 척하는 것보다 낫다. 검색어를 주소에
 *   실어 보내놓고 빈 화면이 뜨면 사용자는 우리 기능이 고장 난 줄 안다.
 *
 * 밖에서는 확인할 수 없다
 *   처음에는 응답이 200인지만 보고 다 된다고 여겼다. 틀렸다. 검색어를
 *   무시하고 빈 화면을 200으로 주면 똑같아 보인다.
 *
 *   그다음에는 검색어가 응답 안에 몇 번 나오는지를 셌다. 이것도 틀렸다.
 *   RISS는 여섯 번 나와서 된다고 판단했는데 실제로는 검색되지 않았다.
 *   페이지 장식에 섞여 있던 것이다.
 *
 *   **요즘 사이트는 화면을 자바스크립트로 그린다.** 서버는 껍데기만 주고
 *   검색도 판정도 브라우저에서 일어난다. ScienceON은 서버 응답에 실패
 *   신호가 없는데 화면에는 "검색 키워드가 존재하지 않습니다"가 뜬다.
 *
 *   그래서 이 목록은 **브라우저에서 사람이 눌러보고** 정한 것이다.
 *   주소를 고치거나 더할 때도 그렇게 확인한다. 서버에서 받아본 것으로
 *   판단하지 않는다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

export type SearchSite = {
  id: string;
  name: string;
  /** 무엇을 찾기 좋은 곳인지. 고르는 데 도움이 된다. */
  note: string;
  /** 한국어 자료를 주로 다루는 곳인지. 화면에서 묶어 보여준다. */
  korean: boolean;
  /** 검색어를 넣을 자리. `{q}`가 검색어로 바뀐다. */
  template: string;
  /**
   * 검색어를 주소로 넘길 수 있는지.
   *
   *   link  주소에 넣으면 그 검색어로 검색된 화면이 열린다
   *   copy  넘길 수 없다. 검색어를 복사해 두고 검색 화면만 연다
   *
   * `copy`인 곳의 template에는 `{q}`가 없다. 검색 화면 주소일 뿐이다.
   */
  query: "link" | "copy";
};

/**
 * 설계 문서 8.5절이 지목한 여덟 곳.
 *
 * 국내를 앞에 둔다. 한글 제목으로 찾을 수 있는 곳이 국내 사이트뿐이고,
 * 그것이 이 화면이 필요한 이유이기 때문이다.
 */
export const SEARCH_SITES: readonly SearchSite[] = [
  {
    id: "kci",
    name: "KCI",
    note: "한국학술지인용색인. 국내 등재지 논문",
    korean: true,
    /*
      KCI는 검색을 POST로 한다. 주소에 검색어를 붙이면 200이 돌아오지만
      검색어가 결과에 한 번도 나오지 않는다. 네 가지 주소를 시도해 확인했다.
      그래서 검색어를 복사해 두고 검색 화면만 연다.
    */
    query: "copy",
    template: "https://www.kci.go.kr/kciportal/po/search/poArtiSear.kci",
  },
  {
    id: "riss",
    name: "RISS",
    note: "학위논문과 단행본까지 폭넓게",
    korean: true,
    /*
      주소에 검색어를 실어도 검색되지 않는다. 2026-09-23에 브라우저에서 확인했다.
      서버 응답만 보면 검색어가 여섯 번 나와 되는 것처럼 보인다. 속지 않는다.
    */
    query: "copy",
    template: "https://www.riss.kr/",
  },
  {
    id: "dbpia",
    name: "DBpia",
    note: "원문 내려받기. RIS 내보내기가 편하다",
    korean: true,
    query: "link",
    template: "https://www.dbpia.co.kr/search/topSearch?query={q}",
  },
  {
    id: "scienceon",
    name: "ScienceON",
    note: "KISTI. 과학기술 분야가 강하다",
    korean: true,
    /*
      주소로 검색어를 받지 않는다. 화면에 "검색 키워드가 존재하지 않습니다"가 뜬다.
      서버 응답에는 그 신호가 없다. 브라우저에서만 드러난다.
    */
    query: "copy",
    template: "https://scienceon.kisti.re.kr/",
  },
  {
    id: "scholar",
    name: "Google Scholar",
    note: "가장 넓다. BibTeX 내보내기가 있다",
    korean: false,
    query: "link",
    template: "https://scholar.google.com/scholar?q={q}",
  },
  {
    id: "eric",
    name: "ERIC",
    note: "교육학 전문. 초록이 충실하다",
    korean: false,
    query: "link",
    template: "https://eric.ed.gov/?q={q}",
  },
  {
    id: "crossref",
    name: "Crossref",
    note: "DOI를 찾는 곳. 찾으면 여기서 바로 가져올 수 있다",
    korean: false,
    /*
      주소에 검색어를 실어도 빈 검색 화면이 열린다. 2026-09-23에 브라우저에서 확인했다.
      다만 이 사이트는 없어도 된다. 앱이 이미 Crossref API로 직접 묻는다.
    */
    query: "copy",
    template: "https://search.crossref.org/",
  },
  {
    id: "openalex",
    name: "OpenAlex",
    note: "인용 관계를 함께 본다",
    korean: false,
    query: "link",
    template: "https://openalex.org/works?search={q}",
  },
];

/**
 * 검색어를 넣은 주소를 만든다.
 *
 * 검색어를 인코딩한다. 한글과 공백이 그대로 들어가면 주소가 깨진다.
 * `encodeURIComponent`를 쓰는 이유는, 검색어에 `&`나 `=`가 들어와도
 * 주소의 다른 부분으로 읽히지 않게 하려는 것이다.
 */
export function buildSearchUrl(site: SearchSite, query: string): string {
  return site.template.replace("{q}", encodeURIComponent(query.trim()));
}

/**
 * 검색어가 쓸 만한지.
 *
 * 비어 있으면 링크를 잠근다. 검색어 없이 열어봐야 그 사이트의 빈 검색
 * 화면이 뜰 뿐이고, 사용자는 여기서 한 일이 없는 셈이 된다.
 */
export function isUsableQuery(query: string): boolean {
  return query.trim().length >= 2;
}

/**
 * 검색어를 클립보드에 복사해야 하는 곳인지.
 *
 * 주소로 넘길 수 없는 곳이다. 그 사이트의 검색 화면을 열고 검색어는
 * 복사해 둔다. 사용자는 붙여넣기만 하면 된다.
 *
 * 되는 척하지 않는 것이 요점이다. 검색어를 주소에 붙여 보내놓고 빈 화면이
 * 뜨면, 사용자는 우리 기능이 고장 난 줄 안다. 사실은 그 사이트가 주소로
 * 검색어를 받지 않는 것인데, 화면에서는 구분할 방법이 없다.
 */
export function needsClipboard(site: SearchSite): boolean {
  return site.query === "copy";
}
