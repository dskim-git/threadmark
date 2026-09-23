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
  title: "ThreadMark",
  description:
    "자료와 그때 떠오른 생각을 출처와 함께 남기고, 프로젝트로 이어 쓰는 개인 지식 작업 공간입니다.",
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
