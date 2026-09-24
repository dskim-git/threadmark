import type { Metadata } from "next";
import Link from "next/link";

import { PolicyDocument } from "@/app/policy-document";
import { contactEmail } from "@/lib/legal/contact";
import { SERVICE_URL, TERMS_SECTIONS } from "@/lib/legal/content";

export const metadata: Metadata = {
  title: "서비스 약관 · ThreadMark",
  description:
    "ThreadMark가 무엇을 해드리고 무엇은 약속드리지 못하는지 적어둔 글입니다.",
};

/**
 * 서비스 약관. (18단계)
 *
 * **로그인 없이 볼 수 있다.** 가입을 망설이는 사람이 가입 전에 읽어야 하는
 * 글이다. 개인정보 처리방침과 같은 자리에 둔다.
 *
 * 방침이 "우리가 무엇을 가지고 있나"라면 이 글은 **"우리가 무엇을 해주고
 * 무엇은 해주지 않나"**다. 둘을 한 화면에 몰아넣지 않는 이유는, 읽는 사람이
 * 궁금해하는 때가 다르기 때문이다. 방침은 가입할 때, 약관은 문제가 생겼을
 * 때 찾는다.
 *
 * 글은 `src/lib/legal/content.ts` 한 곳에 있다.
 */
export default function TermsPage() {
  const contact = contactEmail();

  return (
    <PolicyDocument
      title="서비스 약관"
      intro="ThreadMark 이용에 적용되는 약관입니다. 개인이 운영하는 서비스이므로, 제공하는 것과 보증하지 않는 것을 함께 밝힙니다."
      sections={TERMS_SECTIONS}
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

          <p>
            함께 읽어 주세요:{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-2 hover:text-black dark:hover:text-zinc-300"
            >
              개인정보 처리방침
            </Link>
            {" · "}
            <Link
              href="/data-deletion"
              className="underline underline-offset-2 hover:text-black dark:hover:text-zinc-300"
            >
              계정·자료 삭제 안내
            </Link>
            {" · "}
            <Link
              href="/credits"
              className="underline underline-offset-2 hover:text-black dark:hover:text-zinc-300"
            >
              출처 표기
            </Link>
          </p>

          <p>{SERVICE_URL}</p>
        </div>
      }
    />
  );
}
