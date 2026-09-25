"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Panel } from "@/app/(app)/panel";
import type { WatchProviderRow } from "@/lib/media/queries";
import { OFFER_KINDS, getOfferKindLabel } from "@/lib/media/works";

import { addWatchProvider, removeWatchProvider, syncWatchProviders } from "./media-actions";

/**
 * 볼 수 있는 곳. (설계 문서 15절)
 *
 * **영상 자체는 다루지 않는다.** 15절이 "OTT 영상 자체를 임베드하거나
 * 다운로드하지 않는다"고 못 박았다. 여기 있는 것은 **어디서 볼 수 있는지와
 * 그곳으로 가는 주소**뿐이다.
 *
 * **받아온 것과 직접 적은 것을 눈으로도 갈라 놓는다.** 다시 받아올 때
 * 무엇이 바뀌고 무엇이 남는지가 보여야 `다시 받기`를 누를 수 있다.
 * 보이지 않으면 적어둔 것이 사라질까 봐 누르지 못한다.
 *
 * **언제 받아온 것인지 함께 적는다.** 이 값은 빨리 낡는다. 넷플릭스에서
 * 내려가고 웨이브에 올라오는 일이 흔하다. 그 말이 없으면 오래된 목록을
 * 지금의 사실로 읽고 헛걸음하게 된다.
 *
 * 출처는 JustWatch다. TMDB가 그 자료를 쓸 때 출처를 밝히라고 요구한다.
 * (`/credits`, `src/lib/legal/attribution.ts`)
 */
export function WatchPanel({
  sourceId,
  providers,
  syncedAt,
  watchLink,
  ready,
  returnTo,
}: {
  sourceId: string;
  providers: readonly WatchProviderRow[];
  syncedAt: string | null;
  watchLink: string | null;
  /** 작품을 고르고 저장했는가. 아니면 받아올 대상이 없다. */
  ready: boolean;
  returnTo: string;
}) {
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  function sync() {
    startBusy(async () => {
      const result = await syncWatchProviders(sourceId);

      if (!result.ok) {
        setFailed(result.message);
        setNotice(null);

        return;
      }

      setFailed(null);
      setNotice(
        result.count === 0
          ? "지금 한국에서 볼 수 있는 곳을 찾지 못했습니다."
          : `${result.count}곳을 받아왔습니다.`,
      );

      // 담기는 서버가 했다. 화면이 새 값을 보려면 다시 받아와야 한다.
      router.refresh();
    });
  }

  const fetched = providers.filter((row) => row.origin === "api");
  const mine = providers.filter((row) => row.origin === "manual");

  return (
    <Panel
      title="볼 수 있는 곳"
      help="media-watch"
      helpLabel="볼 수 있는 곳"
      hint="한국에서 이 작품을 볼 수 있는 곳입니다. 영상 자체는 담지 않고 어디서 볼 수 있는지만 알려드립니다."
      action={
        ready ? (
          <button
            type="button"
            onClick={sync}
            disabled={busy}
            className="h-9 shrink-0 whitespace-nowrap rounded-full border border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            {busy ? "받는 중…" : syncedAt ? "다시 받기" : "받아오기"}
          </button>
        ) : null
      }
    >
      {!ready ? (
        <p className="text-sm leading-6 text-zinc-500">
          먼저 위 `작품 정보`에서 `찾기`로 작품을 고르고 저장해 주세요.
          어느 작품인지 정해져야 볼 수 있는 곳을 찾을 수 있습니다.
        </p>
      ) : null}

      {failed ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
        >
          {failed}
        </p>
      ) : null}

      {notice ? (
        <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
          {notice}
        </p>
      ) : null}

      {/*
        받아온 것. **언제 받았는지를 목록 바로 위에 적는다.** 아래에 적으면
        목록을 다 읽은 뒤에야 "옛날 것이었네"를 알게 된다.
      */}
      {fetched.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            받아온 것 {syncedAt ? `· ${syncedAt.slice(0, 10)} 기준` : null}
          </h3>
          <ProviderList rows={fetched} returnTo={returnTo} />
        </section>
      ) : null}

      {/* 직접 적은 것. 다시 받아와도 남는다. */}
      {mine.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            직접 적은 것
          </h3>
          <ProviderList rows={mine} returnTo={returnTo} />
        </section>
      ) : null}

      {providers.length === 0 && ready ? (
        <p className="text-sm text-zinc-500">
          아직 담아둔 곳이 없습니다. `받아오기`를 누르거나 아래에서 직접
          적습니다.
        </p>
      ) : null}

      {/*
        직접 적기. **TMDB가 모르는 곳이 있다.** 지역 서비스나 도서관 영상
        서비스가 그렇다. 적어둘 자리가 있어야 이 칸이 쓸모 있다.
      */}
      <form
        action={addWatchProvider}
        className="flex flex-wrap items-end gap-2 border-t border-black/[.06] pt-4 dark:border-white/[.08]"
      >
        <input type="hidden" name="sourceId" value={sourceId} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <label className="flex min-w-0 flex-1 flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            직접 적기
          </span>
          <input
            name="providerName"
            type="text"
            required
            maxLength={200}
            placeholder="예: 학교 도서관 영상실"
            className="h-10 w-full min-w-0 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </label>

        <select
          name="offerKind"
          defaultValue="flatrate"
          aria-label="보는 방법"
          className="h-10 min-w-0 max-w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        >
          {OFFER_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {getOfferKindLabel(kind)}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="h-10 shrink-0 whitespace-nowrap rounded-full border border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          담기
        </button>
      </form>

      {/*
        출처 표기. TMDB는 이 자료를 쓸 때 출처를 JustWatch로 밝히기를
        요구한다. 값을 보는 자리에서 함께 밝힌다.
      */}
      <p className="text-xs leading-5 text-zinc-500">
        볼 수 있는 곳 정보는 JustWatch에서 제공하며 TMDB를 통해 받아옵니다.
        {watchLink ? (
          <>
            {" "}
            <a
              href={watchLink}
              target="_blank"
              rel="noreferrer noopener"
              className="underline underline-offset-2 hover:text-black dark:hover:text-zinc-300"
            >
              JustWatch에서 자세히 보기 →
            </a>
          </>
        ) : null}{" "}
        <a
          href="/credits"
          className="underline underline-offset-2 hover:text-black dark:hover:text-zinc-300"
        >
          출처 표기
        </a>
      </p>
    </Panel>
  );
}

function ProviderList({
  rows,
  returnTo,
}: {
  rows: readonly WatchProviderRow[];
  returnTo: string;
}) {
  return (
    <ul className="flex flex-wrap gap-2">
      {rows.map((row) => (
        <li
          key={row.id}
          className="flex items-center gap-2 rounded-full bg-zinc-50 py-1 pl-3 pr-1 text-sm dark:bg-white/[.04]"
        >
          <span className="text-zinc-800 dark:text-zinc-200">
            {row.providerName}
          </span>
          {/*
            보는 방법을 이름 옆에 붙인다. **같은 곳이 두 줄로 나오는 일이
            있다.** 빌릴 수도 있고 살 수도 있는 경우다. 방법이 안 보이면
            같은 것이 두 번 보이는 것으로 읽힌다.
          */}
          <span className="whitespace-nowrap text-xs text-zinc-500">
            {getOfferKindLabel(row.offerKind)}
          </span>

          <form action={removeWatchProvider}>
            <input type="hidden" name="id" value={row.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              aria-label={`${row.providerName} 빼기`}
              className="rounded-full px-2 text-xs text-zinc-400 transition-colors hover:text-red-700 dark:hover:text-red-400"
            >
              ✕
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
