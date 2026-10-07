import type { Metadata } from "next";
import {
  Gothic_A1,
  Gowun_Batang,
  IBM_Plex_Sans_KR,
  Noto_Sans_KR,
  Noto_Serif_KR,
} from "next/font/google";
import "./globals.css";

import { DEFAULT_APPEARANCE } from "@/lib/appearance/theme";
import { getAccount } from "@/lib/auth/account";

/**
 * 글꼴.
 *
 * 다섯 벌을 불러두고 사용자가 고른 것만 쓴다. 고르는 값은 두 가지 중 하나이므로
 * 실제로 그려지는 것은 늘 한두 벌뿐이다.
 *
 * `preload: false`인 이유가 여기 있다. 한글 글꼴은 글자 수가 많아 조각 수백 개로
 * 쪼개져 있는데, 다섯 벌을 모두 미리 받게 하면 쓰지도 않을 파일을 잔뜩 내려받는다.
 * 브라우저는 화면에 실제로 나온 글자의 조각만 가져간다.
 *
 * 굵기도 화면에서 쓰는 것만 받는다. 굵기 하나가 곧 파일 한 벌이다.
 */
const notoSansKr = Noto_Sans_KR({
  variable: "--font-noto-sans-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
});

const notoSerifKr = Noto_Serif_KR({
  variable: "--font-noto-serif-kr",
  subsets: ["latin"],
  weight: ["400", "600"],
  display: "swap",
  preload: false,
});

const plexSansKr = IBM_Plex_Sans_KR({
  variable: "--font-plex-kr",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
});

const gowunBatang = Gowun_Batang({
  variable: "--font-gowun-batang",
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  preload: false,
});

const gothicA1 = Gothic_A1({
  variable: "--font-gothic-a1",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
  preload: false,
});

const fontVariables = [
  notoSansKr.variable,
  notoSerifKr.variable,
  plexSansKr.variable,
  gowunBatang.variable,
  gothicA1.variable,
].join(" ");

export const metadata: Metadata = {
  /*
    탭에 보이는 제목. (2026-10-05, 사용자 요청)

    > "(페이지 이름)·ThreadMark" 의 형식으로 나오는데 이를
    > "ThreadMark·(페이지 이름)"의 형식으로 나오게 바꾸어줘.

    **틀을 한 곳에 둔다.** 그전에는 화면마다 `"홈 · ThreadMark"`처럼 통째로
    적었다. 서른여섯 곳이었고, 차례를 바꾸려면 서른여섯 곳을 고쳐야 했다.
    **그리고 한 곳만 빠뜨려도 그 탭만 다른 모양이 되는데 아무도 모른다.**

    이제 화면은 자기 이름만 적는다. `%s` 자리에 그 이름이 들어간다.
    `default`는 이름을 적지 않은 화면이 쓴다.

    가운데 글자는 가운뎃점(·)이다. 붙임표가 아니다. 그전에 쓰던 것과 같은
    글자를 쓴다.
  */
  title: {
    default: "ThreadMark",
    template: "ThreadMark · %s",
  },
  description:
    "자료와 그때 떠오른 생각을 출처와 함께 남기고, 프로젝트로 이어 쓰는 개인 지식 작업 공간입니다.",

  /*
    Google Search Console이 "이 주소의 임자가 맞다"를 확인하는 표식.
    (2026-10-07)

    **감출 값이 아니다.** 사이트를 여는 누구나 소스에서 그대로 읽는다.
    환경변수로 뺄 까닭이 없고, 빼면 오히려 배포마다 비어 있을 수 있는 자리가
    하나 는다. `.env.local`에 두는 열쇠들과 성격이 다르다.

    **왜 필요한가.** Google OAuth 동의 화면에 앱 로고를 띄우려면 브랜딩 인증을
    통과해야 하고, 그 인증이 홈페이지 주소의 소유 확인을 요구한다. 2026-10-07에
    브랜딩이 거절됐고 Google이 짚은 것이 이것 하나였다.

      홈페이지 URL("https://thread-mark.vercel.app")의 웹사이트가
      나에게 등록되어 있지 않습니다.

    **지우면 조용히 풀린다.** Google은 이 표식을 한 번만 보지 않고 가끔 다시
    본다. 사라져 있으면 소유 확인이 취소되고, 그러면 브랜딩도 함께 막힌다.
    그때 아무 오류도 나지 않는다. 앱은 멀쩡히 돌고 동의 화면에서 로고만
    사라진다. **그래서 눈에 띄는 자리에 까닭과 함께 적어 둔다.**

    검사로 묶지 않았다. 묶을 만한 모양이 아니다. 값이 이 한 곳에만 있어서
    서로 어긋날 짝이 없고, 진짜 위험은 `이 줄이 지워지는 것`인데 그것을
    잡으려면 결국 파일에서 글자를 찾는 검사가 된다. 그 길은 이 저장소가
    다섯 번 걸린 함정이다. (AGENTS.md 6절)
  */
  verification: {
    google: "IS0VoJxh7ld21B9NurFi2w-PhxCOg01-V45BHT6zf5Y",
  },
};

/**
 * 뿌리 레이아웃.
 *
 * 화면 취향을 여기서 붙인다. `<html>`에 붙이는 이유는 body의 바탕색까지
 * 그 값을 따라야 하기 때문이다. 안쪽 칸에 붙이면 끝까지 스크롤해 튕길 때
 * 드러나는 바탕만 다른 색으로 남는다.
 *
 * 서버에서 붙이므로 화면이 한 번 깜빡였다가 바뀌는 일이 없다. 브라우저에서
 * 정하면 첫 그림은 기본 색으로 그려지고 그다음에 바뀐다.
 *
 * 로그인하지 않았으면 기본값이다. `getAccount`는 요청 한 번에 한 번만
 * 조회하므로, 앱 화면에서 레이아웃이 다시 불러도 왕복이 늘지 않는다.
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const account = await getAccount();
  const appearance = account?.appearance ?? DEFAULT_APPEARANCE;

  return (
    <html
      // 화면의 글이 모두 한국어다. 읽어주는 도구가 영어로 읽지 않게 한다.
      lang="ko"
      data-mode={appearance.mode}
      data-palette={appearance.palette}
      data-fonts={appearance.fonts}
      className={`${fontVariables} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
