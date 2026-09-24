"use client";

import { useState, useTransition } from "react";

import { HelpButton } from "@/app/(app)/help-button";
import type { BookCandidate } from "@/lib/books/kakao";
import {
  HOLDINGS,
  HOLDING_LABELS,
  READING_STATUSES,
  READING_STATUS_LABELS,
  readingDays,
  readingProgress,
} from "@/lib/books/reading";
import type { BookProfile } from "@/lib/books/queries";
import { MAX_TITLE_LENGTH } from "@/lib/sources/schema";

import { findBooks, saveBookProfile } from "./book-actions";

/**
 * 책 칸. 찾아와 채우고, 읽은 자리를 남긴다. (설계 문서 12절)
 *
 * **두 갈래의 값을 눈으로도 갈라 놓는다.**
 *
 *   위쪽  책이 원래 가진 것. 제목·저자·출판사·ISBN. 찾아오면 채워진다
 *   아래쪽 내가 이 책과 보낸 시간. 읽기 상태·쪽·날짜·이유·평가
 *
 * 섞어두면 `찾기`를 눌렀을 때 내가 적은 것까지 바뀔까 봐 누르기를 망설이게
 * 된다. 실제로 바뀌지 않지만, **그것이 화면에서 보여야 한다.**
 *
 * **찾는 칸을 따로 두지 않는다.** 제목 칸 자체가 검색어다. 음악에서 찾는
 * 칸과 적는 칸을 나눴다가 값이 두 벌이 되어 어긋났다. 값이 하나면 어긋날
 * 자리가 없다. (music-profile-form.tsx)
 *
 * **고른 책의 값으로 바꾼다.** 후보를 누른 것이 곧 "이 책이 맞다"는 뜻이다.
 * 빈 칸만 채우게 두면 한 권을 채운 뒤 다른 판으로 바꿀 수 없다. 음악에서
 * 겪은 것이다. 다만 **읽기 기록은 건드리지 않는다.** 그것은 밖에서 오는
 * 값이 아니다.
 *
 * 저장을 누르기 전에는 아무것도 저장되지 않고, 바뀐 값이 바로 칸에 보인다.
 * 그 둘이 있어서 덮어써도 위험하지 않다.
 */

type Values = {
  // 자료가 담는 값
  bookTitle: string;
  description: string;
  thumbnailUrl: string;
  // 밖에서 가져오는 값
  authors: string;
  translators: string;
  publisher: string;
  publishedOn: string;
  isbn10: string;
  isbn13: string;
  metadataSource: string;
  // 사용자가 적는 값
  holding: string;
  readingStatus: string;
  totalPages: string;
  currentPage: string;
  startedOn: string;
  finishedOn: string;
  whyChosen: string;
  verdict: string;
};

export function BookPanel({
  sourceId,
  sourceTitle,
  description,
  thumbnailUrl,
  profile,
  returnTo,
}: {
  sourceId: string;
  sourceTitle: string;
  description: string | null;
  thumbnailUrl: string | null;
  profile: BookProfile | null;
  returnTo: string;
}) {
  const [values, setValues] = useState<Values>({
    bookTitle: sourceTitle,
    description: description ?? "",
    thumbnailUrl: thumbnailUrl ?? "",
    authors: (profile?.authors ?? []).join(", "),
    translators: (profile?.translators ?? []).join(", "),
    publisher: profile?.publisher ?? "",
    publishedOn: profile?.publishedOn ?? "",
    isbn10: profile?.isbn10 ?? "",
    isbn13: profile?.isbn13 ?? "",
    metadataSource: profile?.metadataSource ?? "",
    holding: profile?.holding ?? "",
    readingStatus: profile?.readingStatus ?? "unread",
    totalPages: profile?.totalPages?.toString() ?? "",
    currentPage: profile?.currentPage?.toString() ?? "",
    startedOn: profile?.startedOn ?? "",
    finishedOn: profile?.finishedOn ?? "",
    whyChosen: profile?.whyChosen ?? "",
    verdict: profile?.verdict ?? "",
  });

  const [candidates, setCandidates] = useState<BookCandidate[] | null>(null);
  /** 방금 어느 후보를 적용했는지. 목록에 표시해 준다. */
  const [appliedKey, setAppliedKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, startLoading] = useTransition();

  const set = (name: keyof Values, value: string) =>
    setValues((current) => ({ ...current, [name]: value }));

  const progress = readingProgress(
    toNumber(values.currentPage),
    toNumber(values.totalPages),
  );
  const days = readingDays(
    values.startedOn || null,
    values.finishedOn || null,
  );

  function handleLookup() {
    setMessage(null);
    setFailed(false);

    startLoading(async () => {
      const result = await findBooks(values.bookTitle);

      if (!result.ok) {
        setCandidates(null);
        setAppliedKey(null);
        setFailed(true);
        setMessage(result.message);

        return;
      }

      setCandidates(result.candidates);
      setAppliedKey(null);
      setMessage(result.notice);
    });
  }

  /**
   * 고른 책의 값으로 칸을 바꾼다.
   *
   * **읽기 기록은 건드리지 않는다.** 후보가 내주는 것은 책이 원래 가진
   * 값뿐이고, 내가 몇 쪽까지 읽었는지는 어느 후보도 알지 못한다.
   */
  function handleFill(candidate: BookCandidate) {
    const incoming: Partial<Values> = {
      bookTitle: candidate.title,
      description: candidate.contents ?? "",
      thumbnailUrl: candidate.thumbnailUrl ?? "",
      authors: candidate.authors.join(", "),
      translators: candidate.translators.join(", "),
      publisher: candidate.publisher ?? "",
      publishedOn: candidate.publishedOn ?? "",
      isbn10: candidate.isbn10 ?? "",
      isbn13: candidate.isbn13 ?? "",
    };

    const given = Object.entries(incoming).filter(
      ([, value]) => (value ?? "").length > 0,
    );

    setValues((current) => ({
      ...current,
      ...Object.fromEntries(given),
      // 어디서 온 값인지 남긴다. 밝히지 않으면 "왜 이 출판사지"를 묻게 된다.
      metadataSource: "Kakao",
    }));
    setAppliedKey(keyOf(candidate));
    setMessage(
      given.length > 0
        ? `${given.length}칸을 이 책의 값으로 바꿨습니다. 읽기 기록은 그대로입니다. 저장을 눌러야 남습니다.`
        : "이 후보에는 채울 값이 없었습니다.",
    );
  }

  return (
    <form
      action={saveBookProfile}
      className="flex flex-col gap-6 rounded-2xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-zinc-950"
    >
      <input type="hidden" name="sourceId" value={sourceId} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="thumbnailUrl" value={values.thumbnailUrl} />
      <input type="hidden" name="metadataSource" value={values.metadataSource} />

      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium text-black dark:text-zinc-50">책
        </h2>
        <HelpButton topic="book" label="책 정보와 읽기 기록" />
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 책이 원래 가진 것                                                  */}
      {/* ---------------------------------------------------------------- */}
      <section className="flex flex-col gap-3 rounded-xl border border-black/[.06] p-4 dark:border-white/[.1]">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          책 정보
        </p>

        <div className="flex items-start gap-3">
          <Cover url={values.thumbnailUrl} />

          <div className="flex min-w-0 flex-1 flex-col gap-3">
            <Field
              name="bookTitle"
              label="제목"
              value={values.bookTitle}
              hint="이 칸이 곧 찾는 말입니다. ISBN을 적어도 됩니다."
              required
              maxLength={MAX_TITLE_LENGTH}
              onChange={(value) => set("bookTitle", value)}
              onEnter={handleLookup}
            />

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleLookup}
                disabled={loading || values.bookTitle.trim().length < 2}
                className="h-9 rounded-full border border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                {loading ? "찾는 중…" : "이 이름으로 찾기"}
              </button>
              <p className="text-xs text-zinc-500">
                ISBN으로 찾으면 그 판을 정확히 집어냅니다.
              </p>
            </div>
          </div>
        </div>

        {message ? (
          <p
            className={
              failed
                ? "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200"
                : "text-xs leading-5 text-zinc-600 dark:text-zinc-400"
            }
          >
            {message}
          </p>
        ) : null}

        {candidates && candidates.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {candidates.map((candidate) => (
              <li key={keyOf(candidate)}>
                <button
                  type="button"
                  onClick={() => handleFill(candidate)}
                  aria-pressed={appliedKey === keyOf(candidate)}
                  /*
                    누른 뒤에도 목록을 그대로 둔다. 잘못 골랐을 때 바로 다른
                    것을 누를 수 있어야 한다. 감추면 처음부터 다시 찾게 된다.
                  */
                  className={
                    appliedKey === keyOf(candidate)
                      ? "flex w-full items-start gap-3 rounded-lg border border-accent bg-accent-soft p-3 text-left dark:border-accent-dark dark:bg-accent-dark-soft"
                      : "flex w-full items-start gap-3 rounded-lg border border-black/[.08] p-3 text-left transition-colors hover:bg-black/[.03] dark:border-white/[.145] dark:hover:bg-white/[.05]"
                  }
                >
                  <Cover url={candidate.thumbnailUrl} small />

                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="truncate text-sm text-black dark:text-zinc-50">
                      {candidate.title}
                    </span>
                    <span className="truncate text-xs text-zinc-600 dark:text-zinc-400">
                      {[candidate.authors.join(", "), candidate.publisher]
                        .filter(Boolean)
                        .join(" · ") || "정보 없음"}
                    </span>
                    <span className="truncate text-xs text-zinc-500">
                      {[candidate.publishedOn, candidate.isbn13 ?? candidate.isbn10]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>

                  {/* 어디서 온 값인지 밝힌다. */}
                  <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-white/[.08] dark:text-zinc-400">
                    Kakao
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field
            name="authors"
            label="저자"
            value={values.authors}
            hint="여럿이면 쉼표로 나눠 적습니다."
            onChange={(value) => set("authors", value)}
          />
          <Field
            name="translators"
            label="번역"
            value={values.translators}
            onChange={(value) => set("translators", value)}
          />
          <Field
            name="publisher"
            label="출판사"
            value={values.publisher}
            onChange={(value) => set("publisher", value)}
          />
          <Field
            name="publishedOn"
            label="출판일"
            value={values.publishedOn}
            hint="아는 만큼만 적어도 됩니다."
            onChange={(value) => set("publishedOn", value)}
          />
          <Field
            name="isbn13"
            label="ISBN-13"
            value={values.isbn13}
            onChange={(value) => set("isbn13", value)}
          />
          <Field
            name="isbn10"
            label="ISBN-10"
            value={values.isbn10}
            onChange={(value) => set("isbn10", value)}
          />
        </div>

        <TextArea
          name="description"
          label="책 소개"
          value={values.description}
          rows={3}
          maxLength={5000}
          onChange={(value) => set("description", value)}
        />

        {profile?.fetchedAt && values.metadataSource ? (
          <p className="text-xs leading-5 text-zinc-500">
            {values.metadataSource}에서 가져온 값이 섞여 있습니다.
          </p>
        ) : null}
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 내가 이 책과 보낸 시간                                             */}
      {/* ---------------------------------------------------------------- */}
      <section className="flex flex-col gap-3 rounded-xl border border-black/[.06] p-4 dark:border-white/[.1]">
        <p className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
          읽기 기록
        </p>
        <p className="text-xs leading-5 text-zinc-500">
          여기 적는 것은 `찾기`를 눌러도 바뀌지 않습니다.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Choice
            name="readingStatus"
            label="읽기 상태"
            value={values.readingStatus}
            options={READING_STATUSES.map((status) => ({
              value: status,
              label: READING_STATUS_LABELS[status],
            }))}
            onChange={(value) => set("readingStatus", value)}
          />
          <Choice
            name="holding"
            label="소장 형태"
            value={values.holding}
            /* 비워둘 수 있다. 어떤 꼴인지 적고 싶지 않은 책이 대부분이다. */
            options={[
              { value: "", label: "적지 않음" },
              ...HOLDINGS.map((holding) => ({
                value: holding,
                label: HOLDING_LABELS[holding],
              })),
            ]}
            onChange={(value) => set("holding", value)}
          />
          <Field
            name="currentPage"
            label="읽은 쪽"
            value={values.currentPage}
            onChange={(value) => set("currentPage", value)}
          />
          <Field
            name="totalPages"
            label="전체 쪽수"
            value={values.totalPages}
            onChange={(value) => set("totalPages", value)}
          />
          <DateField
            name="startedOn"
            label="시작한 날"
            value={values.startedOn}
            onChange={(value) => set("startedOn", value)}
          />
          <DateField
            name="finishedOn"
            label="다 읽은 날"
            value={values.finishedOn}
            onChange={(value) => set("finishedOn", value)}
          />
        </div>

        {/*
          센 것을 저장하지 않고 **보여주기만 한다.** 두 칸에서 언제든 다시
          셀 수 있는 값이라 담아두면 어긋날 자리만 생긴다.
        */}
        {progress !== null || days !== null ? (
          <div className="flex flex-col gap-2 rounded-lg bg-zinc-50 px-3 py-2.5 dark:bg-white/[.04]">
            {progress !== null ? (
              <div className="flex items-center gap-3">
                <div
                  className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[.08] dark:bg-white/[.12]"
                  role="img"
                  aria-label={`${progress}% 읽음`}
                >
                  <div
                    className="h-full rounded-full bg-accent dark:bg-accent-dark"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <span className="shrink-0 text-xs text-zinc-600 dark:text-zinc-400">
                  {progress}%
                </span>
              </div>
            ) : null}
            {days !== null ? (
              <p className="text-xs text-zinc-600 dark:text-zinc-400">
                읽는 데 {days}일 걸렸습니다.
              </p>
            ) : null}
          </div>
        ) : null}

        <TextArea
          name="whyChosen"
          label="이 책을 고른 이유"
          value={values.whyChosen}
          hint="다 읽고 나면 왜 집어 들었는지 기억나지 않습니다."
          rows={2}
          maxLength={2000}
          onChange={(value) => set("whyChosen", value)}
        />
        <TextArea
          name="verdict"
          label="다 읽고 난 생각"
          value={values.verdict}
          hint="책 한 권에 하나입니다. 읽는 동안의 메모는 아래 기록에 남깁니다."
          rows={3}
          maxLength={5000}
          onChange={(value) => set("verdict", value)}
        />
      </section>

      <button
        type="submit"
        className="h-10 w-fit rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
      >
        책 정보 저장
      </button>
    </form>
  );
}

/**
 * 후보를 가르는 열쇠.
 *
 * ISBN이 있으면 그것이 가장 정확하다. 없는 책이 있어서 제목과 출판사를
 * 덧붙인다. 같은 책의 다른 판이 한 목록에 함께 오는 일이 흔하다.
 */
function keyOf(candidate: BookCandidate): string {
  return (
    candidate.isbn13 ??
    candidate.isbn10 ??
    `${candidate.title}|${candidate.publisher ?? ""}|${candidate.publishedOn ?? ""}`
  );
}

function toNumber(value: string): number | null {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return null;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * 표지.
 *
 * `next/image`를 쓰지 않는다. 주소가 어디서 올지 미리 알 수 없어 허용
 * 목록을 적어둘 수 없다. 음악의 앨범 표지와 같은 판단이다.
 */
function Cover({ url, small }: { url: string | null; small?: boolean }) {
  const size = small ? "h-14 w-10" : "h-24 w-16";

  if (!url) {
    return (
      <span
        aria-hidden="true"
        className={`${size} shrink-0 rounded bg-zinc-100 dark:bg-white/[.08]`}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={url}
      alt=""
      className={`${size} shrink-0 rounded object-cover`}
      loading="lazy"
    />
  );
}

function Field({
  label,
  name,
  value,
  hint,
  required,
  maxLength,
  onChange,
  onEnter,
}: {
  label: string;
  name: string;
  value: string;
  hint?: string;
  required?: boolean;
  maxLength?: number;
  onChange: (value: string) => void;
  onEnter?: () => void;
}) {
  const id = `book-${name}`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
      >
        {label}
        {required ? (
          <span className="ml-1 text-red-600 dark:text-red-400">*</span>
        ) : null}
      </label>
      <input
        id={id}
        name={name}
        type="text"
        required={required}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={
          onEnter
            ? (event) => {
                if (event.key === "Enter") {
                  // 폼이 저장으로 넘어가지 않게 막고 찾기만 한다.
                  event.preventDefault();
                  onEnter();
                }
              }
            : undefined
        }
        className="h-10 w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
      />
      {hint ? <p className="text-xs leading-5 text-zinc-500">{hint}</p> : null}
    </div>
  );
}

/**
 * 날짜 칸.
 *
 * `type="date"`를 쓴다. 브라우저가 달력을 띄우고 `YYYY-MM-DD`로 보낸다.
 * 손으로 적게 하면 `2026.9.24`와 `26/9/24`가 섞여 들어와 날짜로 셀 수 없다.
 */
function DateField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `book-${name}`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
      />
    </div>
  );
}

function Choice({
  label,
  name,
  value,
  options,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const id = `book-${name}`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
      >
        {label}
      </label>
      <select
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function TextArea({
  label,
  name,
  value,
  hint,
  rows,
  maxLength,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  hint?: string;
  rows: number;
  maxLength: number;
  onChange: (value: string) => void;
}) {
  const id = `book-${name}`;

  return (
    <div className="flex flex-col gap-1.5">
      <label
        htmlFor={id}
        className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
      >
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        maxLength={maxLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-6 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
      />
      {hint ? <p className="text-xs leading-5 text-zinc-500">{hint}</p> : null}
    </div>
  );
}
