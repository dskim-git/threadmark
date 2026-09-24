import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import { EXCLUDED_TABLES, EXPORTED_TABLES } from "./export-tables";

/**
 * 담아둔 것을 모아 내려준다. (18단계)
 *
 * **지우고 나가는 것만 되고 가지고 나가는 것은 안 되던 상태를 메운다.**
 * 17단계에서 계정을 지우는 길을 만들었는데, 담아둔 것을 챙겨 나가는 길이
 * 없었다. 서비스 약관이 "종료하면 30일 전에 알린다"고 약속하려면 그
 * 30일 동안 할 수 있는 일이 있어야 한다.
 *
 * **무엇을 주는가.** 이용자가 적은 것과 이용자를 위해 채운 것 전부다.
 * 무엇을 빼는지는 아래 `EXCLUDED_TABLES`에 까닭과 함께 적었다.
 *
 * **우리가 다시 꾸미지 않는다.** 담긴 모양 그대로 준다. 보기 좋게 바꾸면
 * 그 모양을 우리가 정하게 되고, 정한 모양이 바뀔 때마다 받아둔 파일이
 * 서로 달라진다. 표 파일(CSV)만 사람이 열어볼 수 있게 골라 담는다.
 *
 * **RLS가 한 번 더 막는다.** 이 조회는 로그인한 사람의 권한으로 돈다.
 * 질의에 소유자 조건을 적지 않아도 정책이 자기 것만 돌려준다. 그래도
 * `requireActiveAccount`를 먼저 부른다. 두 겹이다. (보안 원칙 5)
 */

export type ExportBundle = {
  /** 언제 내려받았는가. 받아둔 파일이 여럿일 때 가른다. */
  exportedAt: string;
  /** 어느 서비스에서 나온 것인가. */
  service: string;
  /** 담지 않은 것과 그 까닭. 파일 안에서도 읽을 수 있어야 한다. */
  notIncluded: Record<string, string>;
  /** 표 이름마다 그 표의 줄들. */
  tables: Record<string, unknown[]>;
};

/**
 * 담아둔 것을 전부 모은다.
 *
 * 표 하나가 실패해도 나머지를 포기하지 않는다. **일부라도 받는 것이
 * 아무것도 못 받는 것보다 낫다.** 대신 실패한 표를 파일 안에 적어,
 * 받는 사람이 무엇이 빠졌는지 알 수 있게 한다.
 */
export async function buildExport(): Promise<ExportBundle> {
  await requireActiveAccount();

  const supabase = await createClient();
  const tables: Record<string, unknown[]> = {};
  const failed: string[] = [];

  for (const table of EXPORTED_TABLES) {
    /*
      표 이름이 우리 목록에서만 오므로 글자를 이어 붙여도 안전하다.
      바깥에서 온 값을 여기 넣지 않는다.
    */
    const { data, error } = await supabase.from(table).select("*");

    if (error) {
      console.error(`[ThreadMark] 내려받기 조회 실패(${table}):`, error.message);
      failed.push(table);
      tables[table] = [];

      continue;
    }

    tables[table] = data ?? [];
  }

  const notIncluded = { ...EXCLUDED_TABLES };

  for (const table of failed) {
    notIncluded[table] = "가져오지 못했습니다. 잠시 뒤에 다시 받아 주세요";
  }

  return {
    exportedAt: new Date().toISOString(),
    service: "ThreadMark",
    notIncluded,
    tables,
  };
}

