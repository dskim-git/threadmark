"use client";

import { useState } from "react";

import { Panel } from "@/app/(app)/panel";
import { WITHHELD_NOTICE } from "@/lib/sharing/public-payload";

import { publishProject, unpublishProject } from "./share-actions";

/**
 * 프로젝트를 링크로 공개하는 칸. (설계 문서 16-B절)
 *
 * **무엇이 나가는지를 켜기 전에 보여준다.** 공개 단추만 있으면 누르는
 * 사람은 "프로젝트가 공개된다"고만 알고, 원문이 함께 나가는지는 모른 채
 * 누른다. 되돌릴 수 없는 일이라 **누르기 전에 알아야 한다.**
 *
 * 켜져 있을 때 보여주는 것
 *   주소 한 줄과 복사 단추, 그리고 끄는 단추다. 주소를 글자로 보여주는
 *   까닭은, 복사가 안 되는 상황(권한, 구형 브라우저)에서도 손으로 옮겨
 *   적을 수 있어야 하기 때문이다.
 *
 * **끈 뒤에도 내역을 보여준다.** 언제 켜고 껐는지가 16-B.6절이 남기기로
 * 정한 것이고, 남겨도 읽을 수 없으면 남긴 것이 아니다.
 *
 * 클라이언트 컴포넌트인 까닭은 복사 하나뿐이다. 켜고 끄는 일은 Server
 * Action이 한다.
 */
export function SharePanel({
  projectId,
  /** 지금 켜져 있는 링크 주소. 없으면 꺼져 있다. */
  liveUrl,
  /** 공개를 켠 적이 있는 횟수. 꺼진 것까지 센다. */
  historyCount,
}: {
  projectId: string;
  liveUrl: string | null;
  historyCount: number;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (liveUrl === null) {
      return;
    }

    /*
      복사가 안 되더라도 멈추지 않는다. 주소는 화면에 글자로 나와 있어서
      손으로 옮겨 적을 수 있다. (`search-links.tsx`와 같은 판단)
    */
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Panel
      title="링크로 공개하기"
      help="sharing"
      hint={
        liveUrl === null
          ? "이 프로젝트를 링크로 공개할 수 있습니다. 공개되는 것은 직접 쓴 글과 자료 제목뿐입니다."
          : "지금 공개되어 있습니다. 이 링크를 아는 사람은 로그인하지 않아도 볼 수 있습니다."
      }
    >
      {/*
        **켜기 전에 무엇이 나가고 무엇이 안 나가는지 적는다.**
        켜져 있을 때도 그대로 둔다. 공개한 사람이 나중에 "무엇이 나갔나"를
        다시 확인하는 자리가 된다.
      */}
      <div className="flex flex-col gap-1 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/40">
        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-200">
          나가는 것 — 직접 쓴 메모, 뼈대와 원고, 자료 제목
        </p>
        {WITHHELD_NOTICE.map((line) => (
          <p
            key={line}
            className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400"
          >
            나가지 않는 것 — {line}
          </p>
        ))}
        <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          나가지 않는 것 — AI가 쓴 메모와 지운 것은 공개되지 않습니다.
        </p>
      </div>

      {liveUrl === null ? (
        <form action={publishProject}>
          <input type="hidden" name="projectId" value={projectId} />
          <button
            type="submit"
            className="rounded-full bg-black px-4 py-2 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-black dark:hover:bg-zinc-200"
          >
            링크 만들기
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="break-all rounded-xl border border-zinc-200 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:text-zinc-200">
            {liveUrl}
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={copy}
              className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
            >
              {copied ? "복사했습니다" : "링크 복사"}
            </button>

            <form action={unpublishProject}>
              <input type="hidden" name="projectId" value={projectId} />
              <button
                type="submit"
                className="rounded-full border border-red-200 px-4 py-2 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
              >
                공개 끄기
              </button>
            </form>
          </div>

          {/*
            **다시 켜면 주소가 바뀐다는 것을 미리 알린다.** (16-B.6절)
            모르고 끄면 이미 보낸 링크를 되살릴 수 있다고 생각한다.
          */}
          <p className="text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
            공개를 끄면 이 링크는 그 자리에서 열리지 않습니다. 다시 켜면{" "}
            <strong className="font-medium">새 주소</strong>가 나오고, 전에
            보낸 링크는 되살아나지 않습니다.
          </p>
        </div>
      )}

      {historyCount > 0 ? (
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          지금까지 {historyCount}번 공개했습니다. 언제 켜고 껐는지는 기록으로
          남습니다.
        </p>
      ) : null}
    </Panel>
  );
}
