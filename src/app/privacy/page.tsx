import type { Metadata } from "next";
import Link from "next/link";

import { PolicyDocument } from "@/app/policy-document";
import { contactEmail } from "@/lib/legal/contact";
import { PRIVACY_SECTIONS, SERVICE_URL } from "@/lib/legal/content";

export const metadata: Metadata = {
  title: "개인정보 처리방침 · ThreadMark",
  description:
    "ThreadMark가 무엇을 가지고 있고, 어디에 맡기고, 어떻게 지우는지 적어둔 글입니다.",
};

/**
 * 개인정보 처리방침. (17-B)
 *
 * **로그인 없이 볼 수 있다.** Google OAuth 동의 화면에 등록할 주소이고,
 * 가입을 망설이는 사람이 가입 전에 읽어야 하는 글이다. 로그인 뒤에 두면
 * 둘 다 못 한다.
 *
 * 글은 `src/lib/legal/content.ts` 한 곳에 있다. `tests/legal-coverage.test.mjs`가
 * 그 글과 실제 코드가 어긋나지 않는지 본다. 특히 밖으로 요청을 보내는 곳이
 * 늘어나면 이 방침의 표에도 있어야 검사가 통과한다.
 */
export default function PrivacyPage() {
  const contact = contactEmail();

  return (
    <PolicyDocument
      title="개인정보 처리방침"
      intro="ThreadMark가 무엇을 가지고 있고, 어디에 맡기고, 어떻게 지우는지 적어둔 글입니다. 어려운 말을 쓰지 않으려고 했습니다."
      sections={PRIVACY_SECTIONS}
      footer={
        <div className="flex flex-col gap-2">
          {contact ? (
            <p>
              문의:{" "}
              <a
                href={`mailto:${contact}`}
                className="underline underline-offset-2 hover:text-black dark:hover:text-zinc-300"
              >
                {contact}
              </a>
            </p>
          ) : null}
          <p>서비스 주소: {SERVICE_URL}</p>
          <p>
            지우는 방법은{" "}
            <Link
              href="/data-deletion"
              className="underline underline-offset-2 hover:text-black dark:hover:text-zinc-300"
            >
              계정·자료 삭제 안내
            </Link>
            에 더 자세히 적어두었습니다. 이 앱을 어떻게 쓰는지는{" "}
            <Link
              href="/guide"
              className="underline underline-offset-2 hover:text-black dark:hover:text-zinc-300"
            >
              사용법
            </Link>
            에 있습니다.
          </p>
        </div>
      }
    />
  );
}
