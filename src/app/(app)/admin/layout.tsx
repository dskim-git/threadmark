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

  return children;
}
