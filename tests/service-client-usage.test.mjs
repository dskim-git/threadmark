/**
 * service role 클라이언트 사용처 감시.
 *
 * 이 클라이언트는 RLS를 우회한다. 지금까지 데이터베이스가 대신 해주던
 * 소유자 확인이 사라진다는 뜻이다.
 *
 * 편하다는 이유로 일반 데이터 조회에 쓰기 시작하면, 한 줄의 실수가 곧바로
 * 다른 사용자의 자료 노출이 된다. 그래서 쓸 수 있는 곳을 목록으로 고정하고,
 * 새로운 곳에서 쓰이면 이 검사가 실패하도록 한다.
 *
 * 목록을 늘리는 것 자체는 막지 않는다. 다만 "왜 여기서 RLS를 우회해야 하는가"를
 * 한 번 더 생각하게 만드는 것이 목적이다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const srcRoot = path.join(repoRoot, "src");

/** service role 클라이언트를 써도 되는 파일. 저장소 기준 상대 경로다. */
const ALLOWED = [
  // 정의 자체
  "src/lib/supabase/service.ts",
  // Drive 연결 정보는 authenticated 역할에게 권한이 없어 여기서만 다룰 수 있다.
  "src/lib/drive/connection.ts",
];

const CODE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".mjs"];

/**
 * @param {string} dir
 * @returns {string[]}
 */
function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);

    return entry.isDirectory() ? walk(full) : [full];
  });
}

function relative(file) {
  return path.relative(repoRoot, file).split(path.sep).join("/");
}

test("service role 클라이언트는 허용된 파일에서만 쓴다", () => {
  const users = walk(srcRoot)
    .filter((file) => CODE_EXTENSIONS.includes(path.extname(file)))
    .filter((file) => {
      const contents = readFileSync(file, "utf8");

      return (
        contents.includes("createServiceClient") ||
        contents.includes("supabase/service")
      );
    })
    .map(relative);

  const unexpected = users.filter((file) => !ALLOWED.includes(file));

  assert.deepEqual(
    unexpected,
    [],
    `RLS를 우회하는 클라이언트가 예상 밖의 파일에서 쓰이고 있다: ${unexpected.join(", ")}`,
  );
});

test("서버 전용 비밀 키는 클라이언트 컴포넌트에 들어가지 않는다", () => {
  const offenders = walk(srcRoot)
    .filter((file) => CODE_EXTENSIONS.includes(path.extname(file)))
    .filter((file) => {
      const contents = readFileSync(file, "utf8");
      const isClientComponent = contents
        .slice(0, 200)
        .includes('"use client"');

      return (
        isClientComponent &&
        (contents.includes("SUPABASE_SECRET_KEY") ||
          contents.includes("TOKEN_ENCRYPTION_KEY") ||
          contents.includes("GOOGLE_CLIENT_SECRET"))
      );
    })
    .map(relative);

  assert.deepEqual(
    offenders,
    [],
    `클라이언트 컴포넌트가 서버 전용 비밀값을 참조한다: ${offenders.join(", ")}`,
  );
});

test("서버 전용 비밀값 이름은 NEXT_PUBLIC 접두사를 쓰지 않는다", () => {
  // NEXT_PUBLIC이 붙으면 값이 브라우저 번들에 그대로 들어간다.
  const example = readFileSync(path.join(repoRoot, ".env.example"), "utf8");

  const forbidden = [
    "NEXT_PUBLIC_SUPABASE_SECRET_KEY",
    "NEXT_PUBLIC_TOKEN_ENCRYPTION_KEY",
    "NEXT_PUBLIC_GOOGLE_CLIENT_SECRET",
    "NEXT_PUBLIC_SUPPORT_EMAIL",
  ];

  for (const name of forbidden) {
    assert.ok(
      !example.includes(name),
      `${name}은 브라우저에 노출되므로 쓰면 안 된다`,
    );
  }
});
