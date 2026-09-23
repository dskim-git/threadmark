import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * 화면마다 제목을 따로 두지만, 그것을 두지 않은 화면은 이 값을 쓴다.
 * 처음 만들 때의 `Create Next App`이 그대로 남아 있었다.
 */
export const metadata: Metadata = {
  title: "ThreadMark",
  description:
    "자료와 그때 떠오른 생각을 출처와 함께 남기고, 프로젝트로 이어 쓰는 개인 지식 작업 공간입니다.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      // 화면의 글이 모두 한국어다. 읽어주는 도구가 영어로 읽지 않게 한다.
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
