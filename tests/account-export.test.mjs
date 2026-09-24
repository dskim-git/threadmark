/**
 * 내려받기가 빠뜨리는 표가 없는지 확인한다. (18단계)
 *
 * **이 목록이 뒤처지면 내려받은 파일에 구멍이 난다.** 표를 새로 만들고
 * 목록에 이름을 더하지 않으면, 그 표에 담긴 것만 조용히 빠진 채로 파일이
 * 만들어진다. **받는 사람은 빠진 줄 모른다.**
 *
 * 나가는 사람이 마지막으로 챙기는 파일이다. 그때 빠진 것은 되찾을 길이
 * 없다. 계정을 지우고 나면 원본도 사라지기 때문이다.
 *
 * 이 저장소는 같은 종류의 뒤처짐을 두 번 겪었다. `PROTECTED_TABLES`가
 * 그랬고 `003`의 격리 검사가 그랬다. (`docs/VERIFICATION.md` 4-25, 4-30절)
 * 세 번째는 여기서 막는다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  EXCLUDED_TABLES,
  EXPORTED_TABLES,
  captureRows,
  sourceRows,
} from "../src/lib/account/export-tables.ts";

/**
 * 앱이 만드는 표 전부.
 *
 * `migration-invariants`의 `PROTECTED_TABLES`와 같은 목록이어야 한다.
 * 그 파일에서 가져오지 않고 여기 적는 이유는, **두 목록이 서로를 견주게
 * 하기 위해서다.** 한쪽에서 가져오면 둘이 같은 값이 되어 견줄 것이 없다.
 */
function protectedTables() {
  const source = readFileSync(
    new URL("./migration-invariants.test.mjs", import.meta.url),
    "utf8",
  );

  const block = /const PROTECTED_TABLES = \[([\s\S]*?)\];/u.exec(source);

  assert.ok(block, "PROTECTED_TABLES를 찾지 못했다");

  return [...block[1].matchAll(/"([a-z_]+)"/gu)].map((match) => match[1]);
}

test("앱의 모든 표가 내려받기에 담기거나, 빼는 까닭이 적혀 있다", () => {
  const all = protectedTables();
  const included = new Set(EXPORTED_TABLES);

  const missing = all.filter(
    (table) => !included.has(table) && !(table in EXCLUDED_TABLES),
  );

  assert.deepEqual(
    missing,
    [],
    `이 표가 내려받기에서 빠졌다. EXPORTED_TABLES에 더하거나, 담지 않을 이유를 EXCLUDED_TABLES에 적는다: ${missing.join(", ")}`,
  );
});

test("담는 표와 빼는 표가 겹치지 않는다", () => {
  /*
    겹치면 "담는다"와 "안 담는다"가 동시에 적힌 것이다. 읽는 사람도
    고치는 사람도 어느 쪽이 맞는지 알 수 없다.
  */
  const both = EXPORTED_TABLES.filter((table) => table in EXCLUDED_TABLES);

  assert.deepEqual(both, [], `이 표가 담는 목록과 빼는 목록 양쪽에 있다: ${both.join(", ")}`);
});

test("빼는 표마다 까닭이 적혀 있다", () => {
  /*
    **까닭 없이 빠지면 그것은 빠뜨린 것이지 정한 것이 아니다.**
    이 글은 내려받은 파일 안에도 들어가서, 받는 사람이 무엇이 왜 없는지
    읽을 수 있게 한다.
  */
  for (const [table, reason] of Object.entries(EXCLUDED_TABLES)) {
    assert.ok(
      reason.trim().length > 0,
      `${table}을 빼는 까닭이 비어 있다`,
    );
  }
});

test("토큰이 담긴 표는 반드시 빠진다", () => {
  /*
    **내려받는 파일은 메일로도 오가고 클라우드에도 올라간다.** 그 파일에
    Google 접근 권한을 담지 않는다. 암호로 잠겨 있어도 마찬가지다.

    이름으로 콕 집어 확인한다. 목록을 훑는 검사만 두면 목록이 바뀌었을 때
    조용히 통과한다.
  */
  assert.ok(
    !EXPORTED_TABLES.includes("google_drive_connections"),
    "Google 토큰이 든 표가 내려받기에 담겼다",
  );
  assert.ok(
    "google_drive_connections" in EXCLUDED_TABLES,
    "Google 토큰이 든 표를 왜 빼는지 적혀 있지 않다",
  );
});

test("운영에 관한 표는 담지 않는다", () => {
  // 이용자의 것이 아니다.
  for (const table of ["user_roles", "app_settings", "admin_audit_logs"]) {
    assert.ok(
      !EXPORTED_TABLES.includes(table),
      `${table}은 이용자의 것이 아닌데 담겼다`,
    );
  }
});

// -----------------------------------------------------------------------------
// 표 파일로 고를 때
// -----------------------------------------------------------------------------

test("기록 표에서 원문과 내 메모가 다른 칸에 있다", () => {
  /*
    **이 앱의 가장 중요한 약속이다.** (설계 문서 2.4절) 표로 내보낼 때
    한 칸에 합치면 그 구분이 사라지고, 받아둔 파일에서는 되돌릴 방법이 없다.
  */
  const rows = captureRows({
    captures: [
      {
        capture_type: "quote",
        original_text: "남이 쓴 문장",
        content: "내가 쓴 생각",
        translated_text: null,
        ai_generated: false,
        created_at: "2026-09-25T00:00:00Z",
      },
    ],
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0][1], "남이 쓴 문장");
  assert.equal(rows[0][2], "내가 쓴 생각");
  assert.notEqual(rows[0][1], rows[0][2]);
});

test("기계가 만든 글인지 표에도 남는다", () => {
  // 받아둔 파일에서 사람이 쓴 것과 기계가 만든 것이 섞이면 안 된다.
  const rows = captureRows({
    captures: [{ ai_generated: true }, { ai_generated: false }],
  });

  assert.equal(rows[0][4], "예");
  assert.equal(rows[1][4], "아니오");
});

test("표가 비어 있어도 무너지지 않는다", () => {
  // 담아둔 것이 없는 사람도 내려받을 수 있어야 한다.
  assert.deepEqual(sourceRows({}), []);
  assert.deepEqual(captureRows({}), []);
});

test("자료 표에 제목과 주소가 들어간다", () => {
  const rows = sourceRows({
    sources: [
      {
        title: "수학 불안 연구",
        type: "paper",
        status: "active",
        original_url: "https://example.com/a",
        description: "줄거리",
        created_at: "2026-09-25T00:00:00Z",
      },
    ],
  });

  assert.equal(rows[0][0], "수학 불안 연구");
  assert.equal(rows[0][3], "https://example.com/a");
});
