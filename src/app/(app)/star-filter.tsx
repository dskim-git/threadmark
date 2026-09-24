import Link from "next/link";

/**
 * 기록 목록 위의 "전체 / 별 표시" 고르는 줄. (설계 문서 6.2-1절)
 *
 * 별을 달기만 하고 별 단 것만 모아 볼 수 없으면 표시가 아무 일도 하지 않는다.
 * 빠른 기록, 자료의 기록 목록, 읽기 화면의 기록 탭이 같은 줄을 쓴다.
 *
 * **주소에 담는다.** 브라우저에서 접었다 폈다 하면 새로고침에 사라지고,
 * 즐겨찾기에 담을 수도 없다. 자료 목록의 유형·정렬·보기와 같은 방식이다.
 *
 * **전체 수를 항상 함께 보여준다.** 별만 보는 중에 목록이 비면, 별을 단 것이
 * 없는 것인지 기록 자체가 없는 것인지 구분할 수 없다. 옆의 `전체 12`가
 * 그것을 가른다. 돌아갈 곳도 같은 자리에 있다.
 *
 * 별을 하나도 달지 않았으면 줄 자체를 그리지 않는다. 누를 곳이 하나 늘어도
 * 눌러서 얻을 것이 없다.
 */
export function StarFilter({
  allHref,
  starredHref,
  total,
  starred,
  starredOnly,
}: {
  allHref: string;
  starredHref: string;
  total: number;
  starred: number;
  starredOnly: boolean;
}) {
  if (starred === 0 && !starredOnly) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-4">
      <FilterLink href={allHref} active={!starredOnly}>
        전체 {total}
      </FilterLink>
      <FilterLink href={starredHref} active={starredOnly}>
        별 표시 {starred}
      </FilterLink>
    </div>
  );
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={
        active
          ? "shrink-0 text-xs font-medium text-accent dark:text-accent-dark"
          : "shrink-0 text-xs text-zinc-500 transition-colors hover:text-black dark:hover:text-zinc-50"
      }
    >
      {children}
    </Link>
  );
}
