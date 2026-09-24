import { MAX_TAGS_PER_ITEM, MAX_TAG_LENGTH } from "@/lib/tags/name";
import type { Tag } from "@/lib/tags/queries";

import { attachTags, detachTag } from "./tags/actions";

/**
 * 태그를 달고 떼는 칸. (설계 문서 20-1절)
 *
 * 자료와 기록이 같은 칸을 쓴다. 하는 일이 같고, 두 벌로 만들면 한쪽만
 * 손보게 된다. 다른 것은 어느 표에 다느냐뿐이라 그것만 받는다.
 *
 * 브라우저에서 도는 코드가 없다. form과 단추와 글상자다.
 *
 * **이미 쓴 태그를 눌러서 달 수 있게 한다.** 이것이 없으면 같은 태그를 매번
 * 손으로 치게 되고, 조금씩 다르게 쳐서 결국 비슷한 태그가 여럿 쌓인다.
 * 다듬는 규칙이 대소문자와 공백까지는 잡아주지만 `수업준비`와 `수업 준비`는
 * 다른 태그다. 치지 않게 하는 것이 가장 확실하다.
 *
 * 달려 있는 것은 고르는 줄에서 뺀다. 눌러도 아무 일이 없는 단추를 두지 않는다.
 */
export function TagEditor({
  target,
  id,
  tags,
  allTags,
  returnTo,
  compact,
}: {
  target: "source" | "capture";
  /** 자료 id 또는 기록 id. */
  id: string;
  /** 지금 달려 있는 태그. */
  tags: readonly Tag[];
  /** 내가 쓴 태그 전부. 눌러서 달 수 있게 보여준다. */
  allTags: readonly Tag[];
  returnTo: string;
  /** 기록 카드처럼 좁은 자리에서 쓸 때. 안내 문구를 줄인다. */
  compact?: boolean;
}) {
  const attached = new Set(tags.map((tag) => tag.id));
  const addable = allTags.filter((tag) => !attached.has(tag.id));
  const inputId = `tag-input-${target}-${id}`;

  return (
    <div className="flex flex-col gap-2">
      {tags.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-1.5">
          {tags.map((tag) => (
            <li key={tag.id}>
              {/*
                꼬리표와 떼는 단추를 한 덩어리로 둔다. 떼는 단추를 따로
                떼어놓으면 어느 태그를 떼는 것인지 짝지어 보기 어렵다.
              */}
              <form action={detachTag} className="flex items-center">
                <input type="hidden" name="target" value={target} />
                <input type="hidden" name="id" value={id} />
                <input type="hidden" name="tagId" value={tag.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <span className="flex items-center gap-1 rounded-full bg-accent-soft py-0.5 pl-2.5 pr-1 text-xs font-medium text-accent dark:bg-accent-dark-soft dark:text-accent-dark">
                  {tag.name}
                  <button
                    type="submit"
                    aria-label={`${tag.name} 태그 떼기`}
                    title={`${tag.name} 태그 떼기`}
                    className="flex h-5 w-5 items-center justify-center rounded-full leading-none transition-colors hover:bg-black/10 dark:hover:bg-white/20"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-3 w-3"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2.5}
                      strokeLinecap="round"
                      aria-hidden="true"
                    >
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                </span>
              </form>
            </li>
          ))}
        </ul>
      ) : null}

      <form action={attachTags} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="target" value={target} />
        <input type="hidden" name="id" value={id} />
        <input type="hidden" name="returnTo" value={returnTo} />

        <label htmlFor={inputId} className="sr-only">
          태그
        </label>
        <input
          id={inputId}
          name="names"
          type="text"
          required
          /*
            한 줄에 여러 개를 칠 수 있으므로 상한을 넉넉히 둔다.
            하나하나의 길이는 서버가 다듬으면서 본다.
          */
          maxLength={(MAX_TAG_LENGTH + 2) * MAX_TAGS_PER_ITEM}
          placeholder="수업 준비, AI 융합수업"
          /*
            이미 쓴 태그를 자동완성으로 보여준다. datalist는 브라우저가
            그려주므로 우리가 쓸 코드가 없다. 눌러서 다는 길(아래)과
            겹치지만, 태그가 많아지면 아래 줄이 길어져 치는 쪽이 빠르다.
          */
          list={`${inputId}-options`}
          className="h-9 min-w-40 flex-1 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
        />
        <datalist id={`${inputId}-options`}>
          {allTags.map((tag) => (
            <option key={tag.id} value={tag.name} />
          ))}
        </datalist>

        <button
          type="submit"
          className="h-9 shrink-0 rounded-full border border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
        >
          태그 달기
        </button>

        {compact ? null : (
          <p className="w-full text-xs leading-5 text-zinc-500">
            쉼표로 여러 개를 한 번에 적을 수 있습니다. 대소문자와 공백이 달라도
            같은 태그로 봅니다.
          </p>
        )}
      </form>

      {addable.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {!compact ? (
            <span className="text-xs text-zinc-500">쓰던 태그</span>
          ) : null}
          {addable.map((tag) => (
            /*
              눌러서 바로 단다. 한 태그에 form 하나다. 한 form 안에서
              여러 단추로 값을 나눠 보내려면 단추마다 value를 다르게
              주어야 하는데, 그러면 어느 단추가 눌렸는지에 기대게 된다.
            */
            <form key={tag.id} action={attachTags}>
              <input type="hidden" name="target" value={target} />
              <input type="hidden" name="id" value={id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <input type="hidden" name="names" value={tag.name} />
              <button
                type="submit"
                className="rounded-full border border-dashed border-black/20 px-2.5 py-0.5 text-xs text-zinc-600 transition-colors hover:border-solid hover:bg-black/[.04] hover:text-black dark:border-white/25 dark:text-zinc-400 dark:hover:bg-white/[.06] dark:hover:text-zinc-50"
              >
                + {tag.name}
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * 달린 태그만 보여준다. 달거나 뗄 수 없는 자리에서 쓴다.
 *
 * 목록 화면의 카드가 그렇다. 카드마다 글상자를 두면 목록이 읽기 어려워지고,
 * 무엇보다 카드 전체가 자료로 가는 링크라서 그 안에 form을 둘 수 없다.
 *
 * 꼬리표를 눌러 그 태그로 거를 수 있게 한다. 목록에서 태그를 보는 이유가
 * 대개 "이것과 같은 것을 더 보고 싶다"이기 때문이다.
 */
export function TagChips({
  tags,
  hrefFor,
}: {
  tags: readonly Tag[];
  /** 누르면 갈 곳. 넘기지 않으면 누를 수 없는 꼬리표가 된다. */
  hrefFor?: (tag: Tag) => string;
}) {
  if (tags.length === 0) {
    return null;
  }

  return (
    <ul className="flex flex-wrap items-center gap-1.5">
      {tags.map((tag) => (
        <li key={tag.id}>
          {hrefFor ? (
            <a
              href={hrefFor(tag)}
              className="block rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent transition-opacity hover:opacity-80 dark:bg-accent-dark-soft dark:text-accent-dark"
            >
              {tag.name}
            </a>
          ) : (
            <span className="block rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent dark:bg-accent-dark-soft dark:text-accent-dark">
              {tag.name}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}
