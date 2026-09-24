import type { Metadata } from "next";
import Link from "next/link";

import { PolicyDocument } from "@/app/policy-document";
import { contactEmail } from "@/lib/legal/contact";
import { DELETION_SECTIONS } from "@/lib/legal/content";

export const metadata: Metadata = {
  title: "계정·자료 삭제 안내 · ThreadMark",
  description: "ThreadMark 계정과 담아둔 자료를 지우는 방법입니다.",
};

/**
 * 계정·자료 삭제 안내. (17-B)
 *
 * **따로 화면을 두는 이유가 둘이다.**
 *
 * 하나는 Google이 OAuth 동의 화면에 삭제 안내 주소를 등록하라고 요구하기
 * 때문이고, 다른 하나는 **지우는 방법만 찾아온 사람에게 긴 방침을 읽히지
 * 않기 위해서다.** 나가려는 사람을 붙잡는 가장 흔한 방법이 "어디서 지우는지
 * 못 찾게 하는 것"인데, 그 반대로 둔다.
 *
 * 글은 방침과 같은 파일에 있다. 두 곳에 적으면 한쪽만 갱신된다.
 */
export default function DataDeletionPage() {
  const contact = contactEmail();

  return (
    <PolicyDocument
      title="계정·자료 삭제 안내"
      intro="ThreadMark 계정과 담아둔 자료를 지우는 방법입니다. 앱 안에서 직접 지울 수 있고, 되돌릴 수 없습니다."
      sections={DELETION_SECTIONS}
      footer={
        <div className="flex flex-col gap-2">
          {contact ? (
            <p>
              삭제 요청:{" "}
              <a
                href={`mailto:${contact}?subject=${encodeURIComponent(
                  "ThreadMark 계정 삭제 요청",
                )}`}
                className="underline underline-offset-2 hover:text-black dark:hover:text-zinc-300"
              >
                {contact}
              </a>
            </p>
          ) : null}
          <p>
            무엇을 가지고 있는지는{" "}
            <Link
              href="/privacy"
              className="underline underline-offset-2 hover:text-black dark:hover:text-zinc-300"
            >
              개인정보 처리방침
            </Link>
            에 적어두었습니다. 로그인한 상태라면{" "}
            <Link
              href="/account/delete"
              className="underline underline-offset-2 hover:text-black dark:hover:text-zinc-300"
            >
              계정 지우기
            </Link>
            로 바로 갈 수 있습니다.
          </p>
        </div>
      }
    />
  );
}
