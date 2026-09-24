"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import type { ImportCandidate, ImportedPaper } from "@/lib/papers/crossref";
import { MAX_PASTE_LENGTH, parsePastedCitation } from "@/lib/papers/paste";
import { formatAuthorsInput } from "@/lib/papers/schema";
import {
  MAX_ABSTRACT_LENGTH,
  MAX_CITATION_LENGTH,
  MAX_DOI_LENGTH,
  MAX_JOURNAL_NAME_LENGTH,
  MAX_PUBLICATION_YEAR,
  MIN_PUBLICATION_YEAR,
  PAPER_LANGUAGES,
} from "@/lib/papers/types";

import {
  extractWithAi,
  importByDoi,
  importByTitle,
  importFromPdf,
  previewPdfTextForAi,
  type ImportResult,
} from "./import-actions";
import { savePaperProfile } from "./paper-actions";
import { Field } from "./source-fields";

/**
 * 논문 서지 정보 입력 폼. (설계 문서 8.1절, 8.5절)
 *
 * 브라우저에서 도는 이유는 하나다. **가져온 값이 입력란을 채워야 하기 때문이다.**
 * 서버에서 그린 폼은 값을 나중에 바꿀 수 없다.
 *
 * 가져오기는 채우기만 한다. 저장은 사용자가 `저장`을 눌러야 일어난다.
 * 서지 정보는 틀려도 그럴듯해 보이는 것이 가장 위험하다. 그대로 논문
 * 참고문헌에 실리기 때문이다. 그래서 한 번은 사람 눈을 거치게 한다.
 */

type FieldValues = {
  authors: string;
  publicationYear: string;
  journalName: string;
  volume: string;
  issue: string;
  pageRange: string;
  doi: string;
  issn: string;
  abstract: string;
  keywords: string;
  originalLanguage: string;
  citationOverride: string;
};

type ImportState =
  | { phase: "idle" }
  | { phase: "working" }
  | { phase: "failed"; message: string }
  | { phase: "filled"; filled: string[]; source: ImportedPaper["source"] }
  | { phase: "candidates"; candidates: ImportCandidate[] }
  | { phase: "dois"; dois: string[] }
  /** AI에게 보낼 글을 보여주는 중. 아직 아무것도 보내지 않았다. */
  | { phase: "preview"; text: string; truncated: boolean };

export function PaperForm({
  sourceId,
  currentTitle,
  initial,
  /** 이 자료에 붙어 있는 PDF. 없으면 `PDF에서 찾기`를 보여주지 않는다. */
  pdfFileId,
  aiEnabled,
}: {
  sourceId: string;
  currentTitle: string;
  initial: FieldValues;
  pdfFileId: string | null;
  /**
   * AI 보조를 쓸 수 있는지. 서버가 판단해 내려준다.
   *
   * 키가 없으면 버튼 자체를 보여주지 않는다. 눌러야만 안 된다는 것을 알게
   * 되는 버튼은 없느니만 못하다. 번역(13-C)에서와 같은 처리다.
   */
  aiEnabled: boolean;
}) {
  const [values, setValues] = useState<FieldValues>(initial);
  const [importState, setImportState] = useState<ImportState>({ phase: "idle" });
  const [doiQuery, setDoiQuery] = useState("");
  const [titleQuery, setTitleQuery] = useState(currentTitle);
  const [pasted, setPasted] = useState("");
  const [pending, startTransition] = useTransition();

  /*
    가져온 제목은 여기서 바로 반영하지 않는다. 제목은 sources에 있고
    자료 수정 화면이 주인이다. 두 곳에서 고칠 수 있게 두면 어느 쪽이 맞는지
    알 수 없어진다. 대신 "제목도 바꿀까요"를 눈에 보이게 묻는다.
  */
  const [importedTitle, setImportedTitle] = useState<string | null>(null);
  const [applyTitle, setApplyTitle] = useState(false);

  function set<K extends keyof FieldValues>(key: K, value: string) {
    setValues((previous) => ({ ...previous, [key]: value }));
  }

  /**
   * 가져온 값으로 입력란을 채운다.
   *
   * **비어 있는 값은 덮어쓰지 않는다.** Crossref가 초록을 안 주는 일이 잦은데,
   * 그때 이미 적어둔 초록이 지워지면 사용자는 가져오기를 다시 쓰지 않게 된다.
   * 가져오기가 무언가를 지우는 일은 없어야 한다.
   */
  function applyPaper(paper: ImportedPaper) {
    const filled: string[] = [];

    setValues((previous) => {
      const next = { ...previous };

      const put = (key: keyof FieldValues, value: string | null, label: string) => {
        if (value === null || value.trim().length === 0) {
          return;
        }

        next[key] = value;
        filled.push(label);
      };

      put("authors", formatAuthorsInput(paper.authors), "저자");
      put(
        "publicationYear",
        paper.publicationYear === null ? null : String(paper.publicationYear),
        "발행 연도",
      );
      put("journalName", paper.journalName, "학술지명");
      put("volume", paper.volume, "권");
      put("issue", paper.issue, "호");
      put("pageRange", paper.pageRange, "쪽");
      put("doi", paper.doi, "DOI");
      put("issn", paper.issn, "ISSN");
      put("abstract", paper.abstract, "초록");
      put("originalLanguage", paper.originalLanguage, "원문 언어");

      return next;
    });

    if (paper.title && paper.title.trim() !== currentTitle.trim()) {
      setImportedTitle(paper.title.trim());
      setApplyTitle(false);
    } else {
      setImportedTitle(null);
    }

    setImportState({ phase: "filled", filled, source: paper.source });
  }

  function handle(result: ImportResult) {
    if (!result.ok) {
      setImportState({ phase: "failed", message: result.message });

      return;
    }

    if (result.kind === "paper") {
      applyPaper(result.paper);

      return;
    }

    if (result.kind === "candidates") {
      setImportState({ phase: "candidates", candidates: result.candidates });

      return;
    }

    if (result.kind === "preview") {
      setImportState({
        phase: "preview",
        text: result.text,
        truncated: result.truncated,
      });

      return;
    }

    setImportState({ phase: "dois", dois: result.dois });
  }

  function run(action: () => Promise<ImportResult>) {
    setImportState({ phase: "working" });
    startTransition(async () => {
      handle(await action());
    });
  }

  const busy = pending || importState.phase === "working";

  return (
    <div className="flex flex-col gap-8">
      {/* -------------------------------------------------- 가져오기 */}
      <section className="flex flex-col gap-4 rounded-2xl border border-black/[.08] bg-zinc-50 p-5 dark:border-white/[.145] dark:bg-white/[.04]">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">
            가져오기
          </h2>
          <p className="text-xs leading-5 text-zinc-500">
            찾은 값으로 아래 칸을 채워만 줍니다. 확인하고 직접 저장을 눌러야
            반영됩니다. 이미 적어둔 값은 지우지 않습니다.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {pdfFileId ? (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() => run(() => importFromPdf({ sourceFileId: pdfFileId }))}
                className="h-10 w-fit rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
              >
                {busy ? "찾는 중…" : "PDF에서 찾기"}
              </button>
              <p className="text-xs text-zinc-500">
                붙어 있는 PDF의 앞쪽에서 DOI를 찾아 서지 정보를 가져옵니다.
                밖으로 나가는 것은 DOI 하나뿐이고, 값도 치르지 않습니다.
              </p>
            </div>
          ) : null}

          {pdfFileId && aiEnabled ? (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(() => previewPdfTextForAi({ sourceFileId: pdfFileId }))
                }
                className="h-10 w-fit rounded-full border border-black/[.08] px-5 text-sm text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                {busy ? "읽는 중…" : "AI로 읽기"}
              </button>
              <p className="text-xs leading-5 text-zinc-500">
                DOI가 인쇄되어 있지 않은 논문에 씁니다. 첫 장에 적힌 것을 AI가
                읽어 옮깁니다. 저자 이름이 한글 그대로 나옵니다.{" "}
                <strong>보내기 전에 무엇이 나가는지 보여드립니다.</strong>{" "}
                요청마다 값이 듭니다.
              </p>
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                DOI로 가져오기
              </span>
              <input
                type="text"
                value={doiQuery}
                disabled={busy}
                onChange={(event) => setDoiQuery(event.target.value)}
                placeholder="10.1234/abcd 또는 주소째"
                className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
              />
            </label>
            <button
              type="button"
              disabled={busy || doiQuery.trim().length === 0}
              onClick={() => run(() => importByDoi({ doi: doiQuery }))}
              className="h-10 rounded-full border border-black/[.08] px-4 text-sm text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              가져오기
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-1 flex-col gap-1">
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
                제목으로 찾기
              </span>
              <input
                type="text"
                value={titleQuery}
                disabled={busy}
                onChange={(event) => setTitleQuery(event.target.value)}
                className="h-10 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
              />
            </label>
            <button
              type="button"
              disabled={busy || titleQuery.trim().length < 2}
              onClick={() => run(() => importByTitle({ query: titleQuery }))}
              className="h-10 rounded-full border border-black/[.08] px-4 text-sm text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              찾기
            </button>
          </div>

          <p className="text-xs leading-5 text-zinc-500">
            제목 검색은 <strong>한글로는 찾지 못합니다.</strong> 국내 논문도
            영문 제목과 로마자 저자명으로 등록되어 있기 때문입니다. 국내
            논문은 위의 <strong>PDF에서 찾기</strong>가 가장 잘 듣습니다.{" "}
            <Link
              href={`/research/search?q=${encodeURIComponent(titleQuery)}`}
              className="underline underline-offset-2"
            >
              국내 사이트에서 찾기
            </Link>
          </p>

          <div className="flex flex-col gap-2 border-t border-black/[.06] pt-3 dark:border-white/[.1]">
            <label
              htmlFor="paste-citation"
              className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
            >
              BibTeX · RIS 붙여넣기
            </label>
            <textarea
              id="paste-citation"
              rows={3}
              maxLength={MAX_PASTE_LENGTH}
              value={pasted}
              disabled={busy}
              onChange={(event) => setPasted(event.target.value)}
              placeholder={"@article{...}  또는  TY  - JOUR"}
              className="rounded-lg border border-black/[.08] bg-white px-3 py-2 font-mono text-xs leading-5 text-black disabled:opacity-60 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={busy || pasted.trim().length === 0}
                onClick={() => {
                  /*
                    밖으로 나가는 요청이 없다. 브라우저에서 바로 읽는다.
                    공짜이고 즉시 된다. 서버를 다녀올 이유가 없다.
                  */
                  const result = parsePastedCitation(pasted);

                  if (!result.ok) {
                    setImportState({
                      phase: "failed",
                      message: result.message,
                    });

                    return;
                  }

                  applyPaper(result.paper);
                }}
                className="h-9 rounded-full border border-black/[.08] px-4 text-sm text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                읽어서 채우기
              </button>
              <span className="text-xs text-zinc-500">
                학술지 사이트의 `인용 내보내기`에서 받은 글을 그대로
                붙여넣습니다. 밖으로 나가는 것은 없습니다.
              </span>
            </div>
          </div>
        </div>

        <ImportOutcome
          state={importState}
          busy={busy}
          onPickDoi={(doi) => run(() => importByDoi({ doi }))}
          onPickCandidate={(candidate) => applyPaper(candidate)}
          onConfirmAi={
            pdfFileId
              ? () => run(() => extractWithAi({ sourceFileId: pdfFileId }))
              : null
          }
          onCancelPreview={() => setImportState({ phase: "idle" })}
        />

        {importedTitle ? (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
            <p className="text-xs leading-5 text-amber-900 dark:text-amber-200">
              가져온 제목이 지금 자료 제목과 다릅니다.
            </p>
            <p className="text-sm leading-6 text-amber-900 dark:text-amber-100">
              {importedTitle}
            </p>
            <label className="flex items-start gap-2 text-xs leading-5 text-amber-900 dark:text-amber-200">
              <input
                type="checkbox"
                checked={applyTitle}
                onChange={(event) => setApplyTitle(event.target.checked)}
                className="mt-0.5"
              />
              <span>저장할 때 자료 제목도 이것으로 바꾸기</span>
            </label>
          </div>
        ) : null}
      </section>

      {/* -------------------------------------------------- 입력 */}
      <form action={savePaperProfile} className="flex flex-col gap-6">
        <input type="hidden" name="sourceId" value={sourceId} />
        {/*
          제목은 체크했을 때만 보낸다. 보내지 않으면 자료 제목은 손대지 않는다.
        */}
        {importedTitle && applyTitle ? (
          <input type="hidden" name="importedTitle" value={importedTitle} />
        ) : null}

        <Field
          label="저자"
          htmlFor="authors"
          hint="한 줄에 한 사람. 쉼표가 있으면 앞이 성, 뒤가 이름입니다. 예: Kim, Daesoo / 김대수 / 한국교육과정평가원"
        >
          <textarea
            id="authors"
            name="authors"
            rows={4}
            value={values.authors}
            onChange={(event) => set("authors", event.target.value)}
            placeholder={"Kim, Daesoo\n이서연"}
            className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-6 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </Field>

        <Field
          label="원문 언어"
          htmlFor="originalLanguage"
          hint="참고문헌 표기가 달라집니다. 한국어는 이름을 그대로 적고, 영어는 Kim, D. 처럼 줄입니다."
        >
          <select
            id="originalLanguage"
            name="originalLanguage"
            value={values.originalLanguage}
            onChange={(event) => set("originalLanguage", event.target.value)}
            className="h-11 min-w-0 max-w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          >
            <option value="">고르지 않음</option>
            {PAPER_LANGUAGES.map((language) => (
              <option key={language.code} value={language.code}>
                {language.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="발행 연도"
            htmlFor="publicationYear"
            hint="모르면 비워둡니다. 참고문헌에 n.d.로 적힙니다."
          >
            <input
              id="publicationYear"
              name="publicationYear"
              type="number"
              inputMode="numeric"
              min={MIN_PUBLICATION_YEAR}
              max={MAX_PUBLICATION_YEAR}
              value={values.publicationYear}
              onChange={(event) => set("publicationYear", event.target.value)}
              className="h-11 min-w-0 max-w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </Field>

          <Field label="학술지명" htmlFor="journalName">
            <input
              id="journalName"
              name="journalName"
              type="text"
              maxLength={MAX_JOURNAL_NAME_LENGTH}
              value={values.journalName}
              onChange={(event) => set("journalName", event.target.value)}
              className="h-11 min-w-0 max-w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          <Field label="권" htmlFor="volume">
            <input
              id="volume"
              name="volume"
              type="text"
              maxLength={50}
              value={values.volume}
              onChange={(event) => set("volume", event.target.value)}
              className="h-11 min-w-0 max-w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </Field>

          <Field label="호" htmlFor="issue">
            <input
              id="issue"
              name="issue"
              type="text"
              maxLength={50}
              value={values.issue}
              onChange={(event) => set("issue", event.target.value)}
              className="h-11 min-w-0 max-w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </Field>

          <Field label="쪽" htmlFor="pageRange" hint="예: 45-67">
            <input
              id="pageRange"
              name="pageRange"
              type="text"
              maxLength={50}
              value={values.pageRange}
              onChange={(event) => set("pageRange", event.target.value)}
              className="h-11 min-w-0 max-w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </Field>
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            label="DOI"
            htmlFor="doi"
            hint="주소째 붙여넣어도 됩니다. 10.으로 시작하는 부분만 담습니다."
          >
            <input
              id="doi"
              name="doi"
              type="text"
              maxLength={MAX_DOI_LENGTH}
              placeholder="10.1234/abcd"
              value={values.doi}
              onChange={(event) => set("doi", event.target.value)}
              className="h-11 min-w-0 max-w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </Field>

          <Field label="ISSN" htmlFor="issn">
            <input
              id="issn"
              name="issn"
              type="text"
              maxLength={20}
              value={values.issn}
              onChange={(event) => set("issn", event.target.value)}
              className="h-11 min-w-0 max-w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </Field>
        </div>

        <Field
          label="키워드"
          htmlFor="keywords"
          hint="쉼표로 나눕니다. 초록에서 그대로 복사해 붙여도 됩니다."
        >
          <input
            id="keywords"
            name="keywords"
            type="text"
            value={values.keywords}
            onChange={(event) => set("keywords", event.target.value)}
            className="h-11 min-w-0 max-w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </Field>

        <Field label="초록" htmlFor="abstract">
          <textarea
            id="abstract"
            name="abstract"
            rows={6}
            maxLength={MAX_ABSTRACT_LENGTH}
            value={values.abstract}
            onChange={(event) => set("abstract", event.target.value)}
            className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-6 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </Field>

        <Field
          label="참고문헌 직접 쓰기"
          htmlFor="citationOverride"
          hint="비워두면 위의 조각으로 만듭니다. 만들어진 것이 어색할 때만 적습니다. 여기에 적으면 조각을 고쳐도 이 글이 그대로 쓰입니다."
        >
          <textarea
            id="citationOverride"
            name="citationOverride"
            rows={3}
            maxLength={MAX_CITATION_LENGTH}
            value={values.citationOverride}
            onChange={(event) => set("citationOverride", event.target.value)}
            className="rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-6 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </Field>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy}
            className="h-11 rounded-full bg-zinc-900 px-6 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            저장
          </button>
          <Link
            href={`/sources/${sourceId}`}
            className="h-11 rounded-full border border-solid border-black/[.08] px-5 text-sm font-medium leading-[2.75rem] text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            취소
          </Link>
        </div>
      </form>
    </div>
  );
}

/** 가져오기 결과를 보여준다. 고를 것이 있으면 고르게 한다. */
function ImportOutcome({
  state,
  busy,
  onPickDoi,
  onPickCandidate,
  onConfirmAi,
  onCancelPreview,
}: {
  state: ImportState;
  busy: boolean;
  onPickDoi: (doi: string) => void;
  onPickCandidate: (candidate: ImportCandidate) => void;
  /** 보여준 글을 AI에게 보낸다. PDF가 없으면 null. */
  onConfirmAi: (() => void) | null;
  onCancelPreview: () => void;
}) {
  if (state.phase === "idle" || state.phase === "working") {
    return null;
  }

  if (state.phase === "failed") {
    return (
      <p
        role="alert"
        className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs leading-5 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
      >
        {state.message}
      </p>
    );
  }

  if (state.phase === "filled") {
    /*
      어디서 온 값인지에 따라 경고의 세기를 달리한다.

      Crossref는 출판사가 등록한 값이라 틀릴 일이 거의 없다.
      AI는 첫 장을 읽어 옮긴 것이라 틀릴 수 있다. 특히 권·호·쪽처럼
      작게 인쇄된 것과, 2단 편집에서 줄이 엉킨 곳이 그렇다.

      둘을 같은 얼굴로 보여주면 사용자는 어느 쪽을 더 눈여겨봐야 하는지
      알 수 없다. 그러면 둘 다 대충 보게 된다.
    */
    const ai = state.source === "ai";
    const origin =
      state.source === "bibtex"
        ? "BibTeX에서 "
        : state.source === "ris"
          ? "RIS에서 "
          : "";

    const filled =
      state.filled.length > 0
        ? `${origin}${state.filled.join(", ")}을(를) 채웠습니다.`
        : "가져온 값이 이미 적어둔 것과 같아 바뀐 칸이 없습니다.";

    return (
      <p
        role="status"
        className={
          ai
            ? "rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200"
            : "rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs leading-5 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-200"
        }
      >
        {filled}{" "}
        {ai ? (
          <>
            <strong>AI가 읽은 것이라 틀릴 수 있습니다.</strong> 저장하기 전에
            권·호·쪽을 특히 확인해 주세요. DOI는 지어낼 위험이 있어 아예 받지
            않았습니다.
          </>
        ) : (
          "확인하고 저장을 눌러 주세요."
        )}
      </p>
    );
  }

  if (state.phase === "preview") {
    /*
      설계 문서 18절: "요청 전에 전송될 텍스트 범위를 사용자가 확인할 수 있게 한다."

      여기까지는 아무것도 밖으로 나가지 않았다. PDF에서 글을 꺼내 보여준 것뿐이다.
      `AI에게 보내기`를 눌러야 나간다.
    */
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
        <p className="text-xs leading-5 text-amber-900 dark:text-amber-200">
          아래 글이 <strong>Claude에 보내집니다.</strong> 아직 보내지
          않았습니다. 확인하고 눌러 주세요.
          {state.truncated ? " (길어서 앞부분만 보냅니다)" : ""}
        </p>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-words rounded border border-amber-200 bg-white p-2 text-xs leading-5 text-zinc-700 dark:border-amber-900/60 dark:bg-black dark:text-zinc-300">
          {state.text}
        </pre>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busy || onConfirmAi === null}
            onClick={() => onConfirmAi?.()}
            className="h-9 rounded-full bg-zinc-900 px-4 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-60 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            {busy ? "읽는 중…" : "AI에게 보내기"}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onCancelPreview}
            className="h-9 rounded-full border border-black/[.08] px-4 text-sm text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            보내지 않기
          </button>
        </div>
      </div>
    );
  }

  if (state.phase === "dois") {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">
          이 PDF에서 DOI를 {state.dois.length}개 찾았습니다. 참고문헌에 적힌
          다른 논문의 것일 수 있습니다. 이 논문의 것을 골라 주세요.
        </p>
        <ul className="flex flex-col gap-2">
          {state.dois.map((doi) => (
            <li key={doi}>
              <button
                type="button"
                disabled={busy}
                onClick={() => onPickDoi(doi)}
                className="w-full rounded-lg border border-black/[.08] bg-white px-3 py-2 text-left text-xs text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:bg-zinc-950 dark:text-zinc-50 dark:hover:bg-white/[.06]"
              >
                {doi}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs leading-5 text-zinc-600 dark:text-zinc-400">
        비슷한 논문 {state.candidates.length}편을 찾았습니다. 맨 위가 맞는다는
        보장은 없습니다. 확인하고 골라 주세요.
      </p>
      <ul className="flex flex-col gap-2">
        {state.candidates.map((candidate, index) => (
          <li key={candidate.doi ?? index}>
            <button
              type="button"
              disabled={busy}
              onClick={() => onPickCandidate(candidate)}
              className="flex w-full flex-col gap-1 rounded-lg border border-black/[.08] bg-white px-3 py-2 text-left transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:bg-zinc-950 dark:hover:bg-white/[.06]"
            >
              <span className="text-sm leading-6 text-black dark:text-zinc-50">
                {candidate.title ?? "(제목 없음)"}
              </span>
              <span className="text-xs text-zinc-500">{candidate.summary}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
