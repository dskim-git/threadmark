"use client";

import { useState, useTransition } from "react";

import { MAX_TITLE_LENGTH, MAX_URL_LENGTH } from "@/lib/sources/schema";
import { MAX_TAGS_PER_ITEM } from "@/lib/tags/name";

import {
  createWebsiteSource,
  previewWebsite,
  type WebsitePreview,
} from "./website-actions";

/**
 * 웹사이트 담기. (설계 문서 11.2절)
 *
 * 흐름이 두 걸음이다. 주소를 넣어 **읽어 오고**, 그 결과를 보고 **담는다.**
 *
 * 읽어 오는 걸음에서는 아무것도 저장하지 않는다. 받아온 제목이 엉뚱할 수
 * 있고, 사이트가 로그인을 요구해 아무것도 못 받아올 수도 있다. 그때 이미
 * 자료가 만들어져 있으면 지우는 일이 하나 더 생긴다.
 *
 * **읽어 오기가 실패해도 담을 수 있다.** 실패하면 주소만 채운 빈 미리보기를
 * 두고, 제목을 손으로 적게 한다. 읽어 오기는 손을 덜어주는 일이지 자료를
 * 담는 조건이 아니다. 로그인해야 보이는 페이지는 꽤 흔하다.
 *
 * 받아온 값은 전부 **고칠 수 있는 칸**에 넣는다. 남이 쓴 글이라 그대로
 * 쓰기에 알맞지 않은 경우가 많다. 제목에 사이트 이름이 붙어 오거나,
 * 설명 자리에 광고 문구가 들어 있거나 한다.
 */
export function WebsiteForm() {
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState<WebsitePreview | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  function handleLoad() {
    setError(null);
    setNotice(null);

    startLoading(async () => {
      const result = await previewWebsite(url);

      if (!result.ok) {
        /*
          실패해도 손으로 담을 길을 연다. 주소가 쓸 만하면 그 주소로 빈
          미리보기를 만든다. 주소 자체가 잘못된 경우에는 열지 않는다.
          고쳐야 할 것이 주소이기 때문이다.

          **말은 한 줄로 한다.** 처음에는 빨간 칸에 이유를, 노란 칸에
          `제목을 직접 적어 담을 수 있습니다`를 따로 띄웠다. 같은 일을 두
          번 말하는 셈이어서, 사용자가 "이게 왜 둘이나 나오나" 하고 물었다.
          알릴 것이 하나면 칸도 하나다.
        */
        if (result.url.startsWith("http")) {
          setPreview(emptyPreview(result.url));
          setNotice(`${result.message} 제목을 직접 적어 담을 수 있습니다.`);
        } else {
          setPreview(null);
          setError(result.message);
        }

        return;
      }

      setPreview(result.preview);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950">
        <label
          htmlFor="website-url"
          className="text-sm font-medium text-black dark:text-zinc-50"
        >
          웹사이트 주소
        </label>

        <div className="flex flex-wrap gap-2">
          <input
            id="website-url"
            type="url"
            inputMode="url"
            value={url}
            maxLength={MAX_URL_LENGTH}
            onChange={(event) => setUrl(event.target.value)}
            onKeyDown={(event) => {
              // 주소를 붙여넣고 Enter를 누르는 것이 가장 자연스러운 손놀림이다.
              if (event.key === "Enter") {
                event.preventDefault();
                handleLoad();
              }
            }}
            placeholder="https://example.com/article"
            className="h-11 min-w-60 flex-1 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
          <button
            type="button"
            onClick={handleLoad}
            disabled={loading || url.trim().length === 0}
            className="h-11 shrink-0 rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            {loading ? "읽어 오는 중…" : "읽어 오기"}
          </button>
        </div>

        <p className="text-xs leading-5 text-zinc-500">
          페이지 전체를 저장하지 않습니다. 제목과 설명처럼 그 페이지가 공개해
          둔 정보만 가져옵니다.
        </p>

        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            {error}
          </p>
        ) : null}

        {notice ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
            {notice}
          </p>
        ) : null}
      </section>

      {preview ? <PreviewForm key={preview.url} preview={preview} /> : null}
    </div>
  );
}

/**
 * 읽어 온 값을 확인하고 담는 칸.
 *
 * `key`를 미리보기의 주소로 준다. 다른 주소를 읽어 오면 이 칸을 새로
 * 만들어, 앞 페이지에 적던 메모가 남지 않게 한다.
 */
function PreviewForm({ preview }: { preview: WebsitePreview }) {
  return (
    <form
      action={createWebsiteSource}
      className="flex flex-col gap-6 rounded-2xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-zinc-950"
    >
      <input type="hidden" name="url" value={preview.url} />
      <input type="hidden" name="canonicalUrl" value={preview.canonicalUrl} />
      <input type="hidden" name="imageUrl" value={preview.imageUrl} />
      <input type="hidden" name="faviconUrl" value={preview.faviconUrl} />

      <div className="flex flex-col gap-2">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">
          읽어 온 내용
        </h2>
        <p className="break-all text-xs leading-5 text-zinc-500">
          {preview.url}
        </p>
      </div>

      {/*
        미리보기 그림. 받아온 주소라 안 뜰 수 있다. 안 떠도 화면이 무너지지
        않게 둔다. next/image를 쓰지 않는 이유는 그것이 우리 서버를 거쳐
        남의 그림을 받아오게 만들기 때문이다. 그러면 SSRF를 막아둔 자리가
        다시 열린다.
      */}
      {preview.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview.imageUrl}
          alt=""
          referrerPolicy="no-referrer"
          className="max-h-48 w-full rounded-lg object-cover"
        />
      ) : null}

      <Field label="제목" htmlFor="website-title" required>
        <input
          id="website-title"
          name="title"
          type="text"
          required
          maxLength={MAX_TITLE_LENGTH}
          defaultValue={preview.title}
          className={inputClass}
        />
      </Field>

      <div className="grid gap-6 sm:grid-cols-2">
        <Field label="사이트 이름" htmlFor="website-site-name">
          <input
            id="website-site-name"
            name="siteName"
            type="text"
            maxLength={500}
            defaultValue={preview.siteName}
            className={inputClass}
          />
        </Field>

        <Field label="작성자" htmlFor="website-author">
          <input
            id="website-author"
            name="author"
            type="text"
            maxLength={500}
            defaultValue={preview.author}
            className={inputClass}
          />
        </Field>
      </div>

      <Field
        label="게시일"
        htmlFor="website-published-at"
        hint="사이트가 적어둔 그대로입니다. 고치거나 비워도 됩니다."
      >
        <input
          id="website-published-at"
          name="publishedAt"
          type="text"
          maxLength={500}
          defaultValue={preview.publishedAt}
          className={inputClass}
        />
      </Field>

      <Field label="설명" htmlFor="website-description">
        <textarea
          id="website-description"
          name="description"
          rows={3}
          defaultValue={preview.description}
          className={textareaClass}
        />
      </Field>

      <Field
        label="내 메모"
        htmlFor="website-memo"
        hint="이 페이지를 왜 담아두는지 적습니다. 기록으로 남습니다."
      >
        <textarea
          id="website-memo"
          name="memo"
          rows={4}
          className={textareaClass}
        />
      </Field>

      <Field
        label="태그"
        htmlFor="website-tags"
        hint={`쉼표로 나눠 적습니다. 한 번에 ${MAX_TAGS_PER_ITEM}개까지.`}
      >
        <input
          id="website-tags"
          name="tags"
          type="text"
          placeholder="수업 준비, AI"
          className={inputClass}
        />
      </Field>

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="h-11 rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
        >
          담기
        </button>
        <a
          href="/library"
          className="h-11 rounded-full border border-solid border-black/[.08] px-6 text-sm font-medium leading-[2.75rem] text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          취소
        </a>
      </div>
    </form>
  );
}

function emptyPreview(url: string): WebsitePreview {
  return {
    url,
    title: "",
    siteName: "",
    description: "",
    author: "",
    publishedAt: "",
    canonicalUrl: "",
    imageUrl: "",
    faviconUrl: "",
  };
}

const inputClass =
  "h-11 w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50";

const textareaClass =
  "w-full rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-7 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50";

function Field({
  label,
  htmlFor,
  hint,
  required,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={htmlFor}
        className="text-sm font-medium text-black dark:text-zinc-50"
      >
        {label}
        {required ? (
          <span className="ml-1 text-red-600 dark:text-red-400">*</span>
        ) : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}
