/**
 * 음악 서비스 링크. (설계 문서 13.2절, 13.3절, 13.6절)
 *
 * 13.6절이 정하고 있다. **음원 파일을 우리가 갖지 않는다.** 공식 서비스의
 * 링크만 담는다. 그래서 이 모듈이 하는 일은 "이 주소가 어느 서비스인가"를
 * 알아보는 것뿐이다.
 *
 * **서비스 이름을 따로 담지 않는다.** 주소에서 알아본다.
 *
 * 담게 하면 `spotify`와 `Spotify`와 `스포티파이`가 섞이고, 고른 것과 붙여넣은
 * 주소가 어긋나는 일이 생긴다. 스포티파이를 고르고 유튜브 주소를 넣어도
 * 아무도 막지 못한다. 주소가 곧 답이라 물을 필요가 없다.
 *
 * 모르는 곳이면 **그 주소의 이름을 그대로 보여준다.** 목록에 없다고 담지
 * 못하게 하지 않는다. 13.3절이 "특정 상용 서비스 하나에 종속되지 않게 한다"고
 * 하고, 국내 서비스는 이 목록보다 자주 바뀐다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/**
 * 아는 서비스.
 *
 * 13.2절이 Spotify·Apple Music·YouTube Music을 들고, 13.3절이 국내 사정도
 * 보라고 한다. 국내에서 실제로 쓰는 곳을 함께 둔다.
 *
 * 이름은 **그 서비스가 자기를 부르는 대로** 적는다. 우리가 번역하지 않는다.
 */
const KNOWN_PROVIDERS: readonly { suffix: string; label: string }[] = [
  { suffix: "open.spotify.com", label: "Spotify" },
  { suffix: "spotify.com", label: "Spotify" },
  { suffix: "music.apple.com", label: "Apple Music" },
  { suffix: "music.youtube.com", label: "YouTube Music" },
  { suffix: "youtube.com", label: "YouTube" },
  { suffix: "youtu.be", label: "YouTube" },
  { suffix: "soundcloud.com", label: "SoundCloud" },
  { suffix: "bandcamp.com", label: "Bandcamp" },
  { suffix: "music.bugs.co.kr", label: "벅스" },
  { suffix: "bugs.co.kr", label: "벅스" },
  { suffix: "melon.com", label: "멜론" },
  { suffix: "genie.co.kr", label: "지니뮤직" },
  { suffix: "music.naver.com", label: "바이브" },
  { suffix: "vibe.naver.com", label: "바이브" },
  { suffix: "flo.co.kr", label: "FLO" },
  { suffix: "tidal.com", label: "TIDAL" },
  { suffix: "deezer.com", label: "Deezer" },
  { suffix: "musicbrainz.org", label: "MusicBrainz" },
];

export type ProviderLinkCheck =
  | { ok: true; url: string; label: string }
  | { ok: false; message: string };

/**
 * 붙여넣은 주소를 확인하고 어느 서비스인지 알아본다.
 *
 * **http와 https만 받는다.** 화면의 링크에 들어갈 값이고, `javascript:`가
 * 거기 들어가면 누르는 순간 실행된다. 웹사이트 자료에서와 같은 이유다.
 * (설계 문서 11.3절)
 *
 * 여기서는 안쪽 주소(localhost 등)를 막지 않는다. 이 값으로 **우리 서버가
 * 요청을 보내지 않기** 때문이다. 사용자가 자기 화면에서 누르는 링크일
 * 뿐이라, 막을 이유가 웹사이트 자료와 다르다.
 */
export function checkProviderLink(input: unknown): ProviderLinkCheck {
  if (typeof input !== "string") {
    return { ok: false, message: "주소를 적어 주세요." };
  }

  const trimmed = input.trim();

  if (trimmed.length === 0) {
    return { ok: false, message: "주소를 적어 주세요." };
  }

  // 스킴이 없으면 https를 붙여본다. 주소창에서 복사하면 빠져 온다.
  const withScheme = /^[a-z][a-z0-9+.-]*:/iu.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let url: URL;

  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, message: "주소를 알아볼 수 없습니다." };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, message: "http와 https 주소만 담을 수 있습니다." };
  }

  if (url.hostname.length === 0) {
    return { ok: false, message: "주소를 알아볼 수 없습니다." };
  }

  if (url.toString().length > 2000) {
    return { ok: false, message: "주소가 너무 깁니다." };
  }

  return { ok: true, url: url.toString(), label: describeProvider(url.toString()) };
}

/**
 * 이 주소가 어느 서비스인지.
 *
 * 아는 곳이면 그 이름, 모르는 곳이면 주소의 이름을 그대로 돌려준다.
 * `www.`는 뗀다. 그것은 이름이 아니라 관습이다.
 */
export function describeProvider(url: string): string {
  let hostname: string;

  try {
    hostname = new URL(url).hostname.toLowerCase().replace(/\.+$/u, "");
  } catch {
    return "링크";
  }

  for (const provider of KNOWN_PROVIDERS) {
    /*
      끝이 맞는지 본다. 앞에 점을 붙여 견주는 것이 중요하다. 그러지 않으면
      `notmelon.com`이 `melon.com`으로 읽힌다. 남이 만든 주소가 우리 이름표를
      달고 화면에 뜨면 안 된다.
    */
    if (
      hostname === provider.suffix ||
      hostname.endsWith(`.${provider.suffix}`)
    ) {
      return provider.label;
    }
  }

  return hostname.replace(/^www\./u, "");
}
