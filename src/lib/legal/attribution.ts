/**
 * 밖의 서비스가 요구하는 출처 표기. (설계 문서 15.1절)
 *
 * **이것은 코드가 아니라 약속이다.** TMDB API를 쓰는 조건으로 표기하기로
 * 한 것이며, 지키지 않으면 쓸 자격이 없어진다.
 *
 * 그래서 사용법·개인정보 처리방침과 같은 방식으로 다룬다. 글을 저장소 안에
 * 두고 **검사가 붙잡는다.** (`tests/attribution-coverage.test.mjs`)
 *
 * 말로만 적은 약속은 잊힌다. 화면을 고치다가 문구를 다듬고 싶어지거나,
 * 로고가 눈에 거슬려 지우고 싶어지는 순간이 온다. 그때 검사가 막는다.
 *
 * **고지 문구는 번역하거나 고치지 않는다.** 15.1절이 "다음 공식 고지
 * 문구를 번역하거나 수정하지 않고 그대로 표시한다"고 못 박았다. 이
 * 저장소의 글이 전부 한글이라 이 한 줄만 영문으로 남는 것이 어색해
 * 보이는데, **어색함이 지켜야 할 모양이다.**
 *
 * 이 파일에 다른 것을 import하지 않는다. 검사가 이 값만 따로 들여다볼 수
 * 있어야 한다.
 */

export type Attribution = {
  /** 어느 서비스인가. */
  id: string;
  /** 화면에 보이는 이름. */
  name: string;
  /** 그 서비스가 우리에게 해주는 일. 왜 이 표기가 있는지 설명한다. */
  role: string;
  /** 공식 사이트. 15.1절 2번이 요구하는 링크다. */
  siteUrl: string;
  /**
   * 공식 로고 파일. `public/` 아래의 주소다.
   *
   * **공식 승인 로고 파일만 쓴다.** 색·비율·방향을 바꾸지 않는다.
   * (15.1절 표시 원칙)
   */
  logoSrc: string;
  logoAlt: string;
  /**
   * 고치지 않고 그대로 보여야 하는 문구.
   *
   * **번역하지 않는다.** 검사가 글자 그대로 견준다.
   */
  notice: string;
  /** 표기 조건이 적힌 곳. 나중에 조건이 바뀌었는지 볼 수 있어야 한다. */
  termsUrl: string;
};

export const ATTRIBUTIONS: readonly Attribution[] = [
  {
    id: "tmdb",
    name: "TMDB",
    role: "영화와 드라마의 정보와 포스터를 가져옵니다.",
    siteUrl: "https://www.themoviedb.org",
    logoSrc: "/tmdb.svg",
    logoAlt: "TMDB 로고",
    /*
      15.1절 3번의 문구다. **한 글자도 바꾸지 않는다.**
      검사가 이 값과 화면에 그려지는 값을 함께 본다.
    */
    notice:
      "This product uses the TMDB API but is not endorsed or certified by TMDB.",
    termsUrl: "https://www.themoviedb.org/about/logos-attribution",
  },
];

/**
 * 로고를 우리 이름보다 덜 두드러지게 놓는 크기.
 *
 * 15.1절: "TMDB 로고는 ThreadMark의 이름이나 로고보다 덜 두드러지게
 * 표시한다." 화면 여러 곳에서 이 값을 쓰게 될 때 제각각이 되지 않도록
 * 여기 둔다.
 */
export const ATTRIBUTION_LOGO_HEIGHT = 20;
