import Link from "next/link";

import { requireAdminAccount } from "@/lib/auth/account";

/**
 * 관리자 영역 레이아웃.
 *
 * ADR 0002와 같은 이유로 이 확인만 믿지 않는다.
 * 레이아웃은 관리자가 아닌 사용자를 이른 시점에 돌려보내는 역할이고,
 * 실제 차단은 각 페이지와 Server Action의 확인, 그리고 RLS가 담당한다.
 */
export default async function AdminLayout({ children }: LayoutProps<"/">) {
  await requireAdminAccount();

  return (
    <div className="flex flex-col gap-8">
      <nav className="flex gap-4 border-b border-black/[.08] pb-3 dark:border-white/[.145]">
        <Link
          href="/admin/users"
          className="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          사용자 승인
        </Link>
        <Link
          href="/admin/settings"
          className="text-sm font-medium text-zinc-600 transition-colors hover:text-black dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          가입 설정
        </Link>
      </nav>

      {children}
    </div>
  );
}
