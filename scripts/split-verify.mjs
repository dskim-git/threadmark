/**
 * 검증 SQL을 SQL Editor에 넣을 수 있는 크기로 자른다.
 *
 * 왜 필요한가
 *   2026-09-26에 `003_rls_isolation_test.sql`이 260KB·8천 줄이 되면서
 *   Supabase SQL Editor가 **답을 받기 전에 끊겼다.**
 *
 *     Error: Failed to fetch (api.supabase.com)
 *
 *   검사가 잡은 것이 아니다. 요청 자체가 시간 안에 끝나지 않은 것이다.
 *   **고장이 아니라 파일이 자란 것이고**, 검사를 줄일 일이 아니다.
 *
 * 왜 파일을 쪼개 저장소에 두지 않는가
 *   같은 글이 두 곳에 있으면 한쪽만 갱신되어 어긋난다. 이 저장소가
 *   사용법·방침·지침에서 계속 피해온 것이다. (`CLAUDE.md`)
 *
 *   그래서 **원본은 하나로 두고 조각은 만들어 쓰고 버린다.** 조각이 낡을
 *   자리가 없다. 원본을 고치면 다음에 만든 조각이 곧 새것이다.
 *
 * 왜 손으로 자르지 않는가
 *   `do $$ ... $$;` 한가운데를 자르면 엉뚱한 문법 오류가 나고, 그것을
 *   검사가 실패한 것으로 읽게 된다. **검사가 아닌 이유로 실패하면 다음부터
 *   그 검사를 믿지 않게 된다.** 자르는 자리는 검사와 검사 사이뿐이다.
 *
 * 쓰는 법
 *   npm run verify:split
 *   npm run verify:split -- supabase/verify/003_rls_isolation_test.sql 4
 *
 *   만들어진 조각은 `supabase/verify/parts/`에 놓인다. 그 폴더는 Git이
 *   따라가지 않는다.
 */

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));

const DEFAULT_SOURCE = "supabase/verify/003_rls_isolation_test.sql";
const DEFAULT_PARTS = 3;

/**
 * 검사 하나가 시작하는 줄.
 *
 * 파일이 `-- 12. 무엇무엇` 꼴의 머리말로 검사를 나눈다. 그 줄 **바로 위의
 * 구분선**부터가 그 검사의 시작이다. 구분선을 앞 조각에 남기면 다음 조각이
 * 머리말 없이 시작해 무엇을 도는 중인지 알 수 없다.
 */
const CHECK_HEADING = /^-- (\d+)\. /u;

/** 마지막에 붙는 "모두 통과" 요약. 맨 뒤 조각에만 들어간다. */
const SUMMARY_HEADING = "-- 모두 통과";

function findChecks(lines) {
  const checks = [];

  lines.forEach((line, index) => {
    const matched = CHECK_HEADING.exec(line);

    if (matched) {
      checks.push({ number: Number(matched[1]), start: index - 1 });
    }
  });

  return checks;
}

function findSummary(lines) {
  const index = lines.findIndex((line) => line.startsWith(SUMMARY_HEADING));

  return index === -1 ? lines.length : index - 1;
}

function banner(index, total, from, to) {
  return [
    "-- =============================================================================",
    `-- ${index}/${total} 조각 (검사 ${from}~${to})`,
    "-- =============================================================================",
    "-- 한 번에 보내기에 커서 나눴다. **각 검사는 서로 기대지 않는다.** 저마다",
    "-- 만들고 저마다 지우므로 순서대로 돌리면 된다.",
    "--",
    "-- **아무것도 안 나오면 통과다.** 오류가 없는 것이 통과이고, 세는 표는",
    "-- 마지막 조각에만 붙어 있다.",
    "--",
    "-- 이 파일은 만들어진 것이다. 고칠 것은 원본이다.",
    "--   supabase/verify/003_rls_isolation_test.sql",
    "-- =============================================================================",
    "",
    "",
  ].join("\n");
}

function main() {
  const [sourceArg, partsArg] = process.argv.slice(2);

  const source = sourceArg ?? DEFAULT_SOURCE;
  const wanted = Number(partsArg ?? DEFAULT_PARTS);

  if (!Number.isInteger(wanted) || wanted < 2) {
    console.error("조각 수는 2 이상의 정수여야 합니다.");
    process.exit(1);
  }

  const sourcePath = path.join(root, source);
  const lines = readFileSync(sourcePath, "utf8").split("\n");

  const checks = findChecks(lines);

  if (checks.length === 0) {
    console.error(
      `${source}에서 검사 머리말(-- 1. ...)을 찾지 못했습니다. 자를 자리가 없습니다.`,
    );
    process.exit(1);
  }

  const summary = findSummary(lines);

  /*
    조각마다 검사를 고르게 나눈다. **줄 수가 아니라 검사 수로 나눈다.**
    줄 수로 맞추려 들면 긴 검사 하나 때문에 경계가 검사 한가운데로 간다.
  */
  const perPart = Math.ceil(checks.length / wanted);

  const outDir = path.join(root, "supabase", "verify", "parts");

  mkdirSync(outDir, { recursive: true });

  // 지난번 조각을 지운다. 남겨두면 어느 것이 새것인지 알 수 없다.
  for (const entry of readdirSync(outDir)) {
    rmSync(path.join(outDir, entry), { force: true });
  }

  const header = lines.slice(0, checks[0].start).join("\n");
  const total = Math.ceil(checks.length / perPart);

  for (let part = 0; part < total; part += 1) {
    const slice = checks.slice(part * perPart, (part + 1) * perPart);
    const next = checks[(part + 1) * perPart];

    const from = slice[0].start;
    const to = next ? next.start : summary;

    const pieces = [banner(part + 1, total, slice[0].number, slice.at(-1).number)];

    // 첫 조각에만 파일 머리말을 붙인다. 전제와 주의사항이 거기 있다.
    if (part === 0) {
      pieces.push(header, "");
    }

    pieces.push(lines.slice(from, to).join("\n"));

    // 마지막 조각에 세는 표를 붙인다.
    if (part === total - 1) {
      pieces.push("", lines.slice(summary).join("\n"));
    }

    const name = `${path.basename(source, ".sql")}_part${part + 1}.sql`;
    const text = pieces.join("\n");

    writeFileSync(path.join(outDir, name), text, "utf8");

    console.log(
      `${name}  검사 ${slice[0].number}~${slice.at(-1).number}  ${Math.round(text.length / 1024)}KB`,
    );
  }

  console.log("");
  console.log(`만들어진 곳: supabase/verify/parts/`);
  console.log("순서대로 SQL Editor에 붙여넣어 돌립니다.");
  console.log("");
  console.log(
    "마지막 표의 `비활성_자료_검사`·`비활성_기록_검사`는 `건너뜀`으로 나옵니다.",
  );
  console.log(
    "검사 19·27이 남긴 값을 읽는 칸인데, 나눠 돌리면 그 값이 넘어오지 않습니다.",
  );
  console.log("그 두 검사가 안 돈 것이 아니라 결과를 전하는 길만 끊긴 것입니다.");
}

main();
