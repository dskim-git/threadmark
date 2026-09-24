"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * 앱 위쪽 메뉴. (설계 문서 21절)
 *
 * 처음에는 일곱 개가 한 줄에 늘어서 있었다. 빠른 기록, 내 자료, 논문,
 * 연구 검색, 프로젝트, 연결, 사용자 승인이다. 15단계에서 책·음악·영상이
 * 들어오면 감당할 수 없는 구조였다.
 *
 * 넷으로 묶었다.
 *
 *   기록      떠오른 것을 바로 적는 자리
 *   자료      담아둔 것 전부
 *   논문      논문 목록과 연구 검색. 둘 다 논문을 찾는 일이라 함께 둔다
 *   프로젝트  그것을 쓸 자리
 *
 * 연결·사용자 승인·로그아웃은 `설정` 안으로 넣었다. 매일 쓰는 것이 아니다.
 * 위 줄에 있으면 매일 쓰는 것들과 같은 무게로 보인다.
 *
 * 브라우저에서 도는 이유는 하나다. **지금 어디에 있는지 표시하기 위해서다.**
 * 그 판단에 경로가 필요한데 서버 레이아웃은 경로를 알 수 없다.
 * 여기서 읽는 것은 경로뿐이고 자료는 아무것도 읽지 않는다.
 */

type NavItem = {
  href: string;
  label: string;
  /** 관리자에게만 보인다. 감추는 것은 통제가 아니고, 실제 차단은 서버가 한다. */
  adminOnly?: boolean;
};

type Section = NavItem & {
  /**
   * 이 구역으로 볼 경로들. 앞부분이 맞으면 같은 구역이다.
   * 목록 화면만이 아니라 상세 화면에서도 메뉴가 켜져 있어야,
   * 자료 하나를 열어둔 동안 내가 어디에 있는지 알 수 있다.
   */
  owns: string[];
  /** 위의 규칙에서 빼는 경로. 논문은 자료 아래 경로를 쓰지만 다른 구역이다. */
  excludes?: string[];
  children?: NavItem[];
};

const SECTIONS: readonly Section[] = [
  { href: "/inbox", label: "기록", owns: ["/inbox", "/captures"] },
  {
    href: "/library",
    label: "자료",
    owns: ["/library", "/sources", "/tags"],
    // 논문 목록은 자료 아래 경로지만 `논문` 구역의 것이다.
    excludes: ["/library/papers"],
    children: [
      { href: "/library", label: "내 자료" },
      // 태그는 자료와 기록 양쪽에 달리지만 정리하는 자리는 하나다.
      // 자주 쓰는 곳이 자료 목록이라 그 아래에 둔다.
      { href: "/tags", label: "태그" },
    ],
  },
  {
    href: "/library/papers",
    label: "논문",
    owns: ["/library/papers", "/research"],
    children: [
      { href: "/library/papers", label: "논문 목록" },
      { href: "/research/search", label: "연구 검색" },
    ],
  },
  { href: "/projects", label: "프로젝트", owns: ["/projects"] },
];

const SETTINGS: Section = {
  href: "/settings",
  label: "설정",
  owns: ["/settings", "/admin"],
  children: [
    { href: "/settings", label: "내 계정" },
    { href: "/settings/integrations", label: "Google Drive 연결" },
    { href: "/admin/users", label: "사용자 승인", adminOnly: true },
    { href: "/admin/settings", label: "운영 설정", adminOnly: true },
  ],
};

/** 경로가 이 구역에 속하는지. `/library`와 `/library/papers`를 가른다. */
function owns(section: Section, pathname: string): boolean {
  const matches = (base: string) =>
    pathname === base || pathname.startsWith(`${base}/`);

  if (section.excludes?.some(matches)) {
    return false;
  }

  return section.owns.some(matches);
}

/**
 * 위 줄. 구역 넷.
 *
 * 아래 줄(`AppSubNav`)과 나눈 이유는 자리 때문이다. 위 줄에는 로고와 설정이
 * 함께 놓이고, 아래 줄은 가로를 다 쓴다. 한 덩어리로 두면 서브메뉴가
 * 로고 옆에 끼어든다.
 */
export function AppNav() {
  const pathname = usePathname();

  return (
    /*
      좁은 화면에서는 옆으로 넘긴다. 줄바꿈되면 머리말 높이가 들쭉날쭉해지고,
      그 아래 화면들이 창 높이를 재서 맞추고 있어 함께 어긋난다. (AGENTS.md 6절)
    */
    <nav className="no-scrollbar -mb-px flex gap-1 overflow-x-auto">
      {SECTIONS.map((section) => (
        <NavLink
          key={section.href}
          href={section.href}
          active={owns(section, pathname)}
        >
          {section.label}
        </NavLink>
      ))}
    </nav>
  );
}

/**
 * 아래 줄. 지금 구역에 딸린 화면들.
 *
 * 딸린 것이 없는 구역에서는 줄 자체를 만들지 않는다. 빈 줄이 남으면
 * 구역마다 머리말 높이가 달라져 화면이 들썩인다.
 */
export function AppSubNav({ isAdmin }: { isAdmin: boolean }) {
  const pathname = usePathname();

  const active = [...SECTIONS, SETTINGS].find((section) =>
    owns(section, pathname),
  );

  const children = (active?.children ?? []).filter(
    (item) => !item.adminOnly || isAdmin,
  );

  if (children.length === 0) {
    return null;
  }

  return (
    <nav className="no-scrollbar flex gap-4 overflow-x-auto border-t border-black/[.06] py-2 dark:border-white/[.08]">
      {children.map((item) => {
        const current = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={current ? "page" : undefined}
            className={
              current
                ? "shrink-0 text-xs font-medium text-accent dark:text-accent-dark"
                : "shrink-0 text-xs text-zinc-500 transition-colors hover:text-black dark:hover:text-zinc-50"
            }
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** 설정으로 가는 길. 오른쪽 끝에 따로 둔다. */
export function SettingsLink() {
  const pathname = usePathname();

  return (
    <NavLink href={SETTINGS.href} active={owns(SETTINGS, pathname)}>
      {SETTINGS.label}
    </NavLink>
  );
}

function NavLink({
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
      aria-current={active ? "page" : undefined}
      /*
        지금 있는 곳은 밑줄로 표시한다. 글자색만 바꾸면 흐린 화면에서
        구별되지 않고, 배경을 칠하면 단추처럼 보여 눌러야 할 것이 늘어 보인다.
      */
      className={
        active
          ? "shrink-0 border-b-2 border-accent px-3 py-3 text-sm font-medium text-black dark:border-accent-dark dark:text-zinc-50"
          : "shrink-0 border-b-2 border-transparent px-3 py-3 text-sm text-zinc-500 transition-colors hover:text-black dark:hover:text-zinc-50"
      }
    >
      {children}
    </Link>
  );
}
