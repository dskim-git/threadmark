/**
 * 비밀값이 브라우저로 새지 않는지 확인한다. (블루프린트 25절 배포 전 점검)
 *
 * **이 저장소에는 두 종류의 환경변수가 있다.**
 *
 *   NEXT_PUBLIC_로 시작하는 것   브라우저로 나가도 되는 값
 *   그 밖의 것                   서버에만 있어야 하는 값
 *
 * 뒤의 것을 읽는 파일이 브라우저 묶음에 들어가면 안 된다. Next.js가
 * `NEXT_PUBLIC_`이 아닌 값을 브라우저 코드에 박아 넣지는 않지만, 그렇다고
 * 안전한 것이 아니다. **그 자리에 `undefined`가 들어가 조용히 실패한다.**
 * 오류도 나지 않고 "왜 안 되지"만 남는다.
 *
 * 설계 문서가 연동마다 못 박아 둔 것이기도 하다. 12절은 Kakao 키를,
 * 14절은 YouTube 키를, 15절은 TMDB 토큰을 "서버 전용 환경변수로 보관하고
 * 브라우저 코드나 저장소에 노출하지 않는다"고 적었다.
 *
 * **한 번 보고 끝낼 일이 아니다.** 파일 하나를 `"use client"`로 바꾸거나,
 * 브라우저 칸에서 도우미 하나를 가져다 쓰는 순간 길이 열린다. 그 순간은
 * 악의 없이 온다.
 *
 * 세는 방법
 *   `"use client"`가 붙은 파일에서 시작해 `import`를 따라간다.
 *   다만 둘은 따라가지 않는다.
 *
 *   타입만 가져오는 것   컴파일할 때 지워지므로 묶이지 않는다
 *   `"use server"` 파일  브라우저에는 부르는 표지만 남고 속은 묶이지 않는다
 *
 *   이 둘을 빼지 않으면 **헛경보가 난다.** 실제로 처음 훑었을 때 일곱
 *   파일이 걸렸는데 전부 이 두 경우였다.
 *
 * **아직 쓰지 않는 값도 목록에 넣는다.** `SPOTIFY_CLIENT_SECRET`이 그렇다.
 * `.env.example`에는 칸이 있는데 코드가 읽는 곳은 아직 없다. 넣어두면
 * 그 연동을 만드는 날 검사가 이미 걸려 있다. 그날 목록을 고치는 것을
 * 기억할 이유가 없어진다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("..", import.meta.url));
const srcDir = path.join(root, "src");

/**
 * 서버에만 있어야 하는 값들.
 *
 * **새 연동을 더하면 여기에도 이름을 더한다.** 더하지 않으면 그 값만
 * 검사를 받지 않는다. `PROTECTED_TABLES`가 뒤처졌던 것과 같은 자리다.
 * (`docs/VERIFICATION.md` 4-25절)
 */
const SERVER_ONLY_SECRETS = [
  "ANTHROPIC_API_KEY",
  "GOOGLE_CLIENT_SECRET",
  "KAKAO_REST_API_KEY",
  "SPOTIFY_CLIENT_SECRET",
  "SUPABASE_SECRET_KEY",
  "TMDB_API_READ_TOKEN",
  "TOKEN_ENCRYPTION_KEY",
  "YOUTUBE_API_KEY",
];

/** src 아래 모든 ts·tsx 파일. */
function sourceFiles(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);

    if (statSync(full).isDirectory()) {
      return sourceFiles(full);
    }

    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}

const files = new Map(
  sourceFiles(srcDir).map((file) => [
    file.replaceAll("\\", "/"),
    readFileSync(file, "utf8"),
  ]),
);

function hasDirective(source, name) {
  const head = source.trimStart();

  return head.startsWith(`"${name}"`) || head.startsWith(`'${name}'`);
}

/** `@/x`와 상대 경로를 실제 파일로 푼다. 못 풀면 바깥 꾸러미다. */
function resolveImport(spec, from) {
  let base;

  if (spec.startsWith("@/")) {
    base = `${srcDir.replaceAll("\\", "/")}/${spec.slice(2)}`;
  } else if (spec.startsWith(".")) {
    base = path
      .normalize(path.join(path.dirname(from), spec))
      .replaceAll("\\", "/");
  } else {
    return null;
  }

  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`]) {
    if (files.has(candidate)) {
      return candidate;
    }
  }

  return null;
}

/**
 * 값으로 가져오는 것만 돌려준다.
 *
 * `import type { A } from "x"`와 `import { type A, type B } from "x"`는
 * 컴파일할 때 지워진다. 그것을 따라가면 헛경보가 난다.
 */
function valueImports(file, source) {
  const found = new Set();

  for (const match of source.matchAll(
    /import\s+(type\s+)?([\s\S]*?)from\s+"([^"]+)"/gu,
  )) {
    const [, typeKeyword, clause, spec] = match;

    if (typeKeyword) {
      continue;
    }

    const braced = clause.trim().startsWith("{")
      ? /\{([\s\S]*)\}/u.exec(clause)
      : null;

    if (braced) {
      const parts = braced[1]
        .split(",")
        .map((piece) => piece.trim())
        .filter(Boolean);

      if (parts.length > 0 && parts.every((piece) => piece.startsWith("type "))) {
        continue;
      }
    }

    const resolved = resolveImport(spec, file);

    if (resolved) {
      found.add(resolved);
    }
  }

  return found;
}

test("서버 전용 비밀값이 브라우저 묶음에 닿지 않는다", () => {
  const clientFiles = [...files]
    .filter(([, source]) => hasDirective(source, "use client"))
    .map(([file]) => file);

  const serverActions = new Set(
    [...files]
      .filter(([, source]) => hasDirective(source, "use server"))
      .map(([file]) => file),
  );

  const secretFiles = new Set(
    [...files]
      .filter(([, source]) =>
        SERVER_ONLY_SECRETS.some((name) => source.includes(`process.env.${name}`)),
      )
      .map(([file]) => file),
  );

  // 브라우저 파일에서 출발해 묶이는 것을 전부 모은다.
  const reached = new Set();
  const stack = [...clientFiles];

  while (stack.length > 0) {
    const current = stack.pop();

    if (reached.has(current)) {
      continue;
    }

    reached.add(current);

    // Server Action은 부르는 표지만 남는다. 그 속은 브라우저에 묶이지 않는다.
    if (serverActions.has(current)) {
      continue;
    }

    stack.push(...valueImports(current, files.get(current) ?? ""));
  }

  const leaked = [...reached]
    .filter((file) => secretFiles.has(file))
    .map((file) => path.relative(root, file).replaceAll("\\", "/"))
    .sort();

  assert.deepEqual(
    leaked,
    [],
    `이 파일이 비밀값을 읽으면서 브라우저 묶음에 닿는다. 서버 쪽으로 옮긴다: ${leaked.join(", ")}`,
  );
});

test("브라우저 파일이 비밀값을 직접 읽지 않는다", () => {
  /*
    위 검사가 이것도 잡지만, 걸렸을 때 **무엇이 문제인지 바로 보이도록**
    따로 둔다. 가져다 쓴 것이 문제인지 직접 읽은 것이 문제인지에 따라
    고치는 방법이 다르다.
  */
  const offenders = [];

  for (const [file, source] of files) {
    if (!hasDirective(source, "use client")) {
      continue;
    }

    for (const name of SERVER_ONLY_SECRETS) {
      if (source.includes(`process.env.${name}`)) {
        offenders.push(`${path.relative(root, file).replaceAll("\\", "/")} (${name})`);
      }
    }
  }

  assert.deepEqual(
    offenders,
    [],
    `브라우저에서 도는 파일이 서버 전용 값을 읽는다: ${offenders.join(", ")}`,
  );
});

test("검사할 비밀값 목록이 실제로 쓰이는 값을 덮는다", () => {
  /*
    **목록이 뒤처지는 것을 막는다.** 새 연동을 더하면서 위 목록에 이름을
    넣지 않으면 그 값만 검사 밖에 남는다.

    `.env.example`을 기준으로 삼는다. 새 연동을 만들면 거기에는 반드시
    칸을 더하게 되기 때문이다. `NEXT_PUBLIC_`으로 시작하는 것과, 값이
    비밀이 아닌 것들은 뺀다.
  */
  const example = readFileSync(path.join(root, ".env.example"), "utf8");

  const declared = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gmu)].map(
    (match) => match[1],
  );

  /** 비밀이 아니라서 검사하지 않는 것들. 왜 아닌지 적어 둔다. */
  const NOT_SECRET = new Set([
    "ANTHROPIC_MODEL", // 모델 이름. 비밀이 아니다
    "ANTHROPIC_BUDGET_USD", // 얼마까지 쓸지 정한 숫자다
    "GOOGLE_CLIENT_ID", // 공개되는 값이다. 동의 화면에 그대로 보인다
    "GOOGLE_OAUTH_REDIRECT_URI", // 우리 앱의 주소다
    "MUSICBRAINZ_USER_AGENT", // 우리가 누구인지 밝히는 글자다
    "SPOTIFY_CLIENT_ID", // OAuth의 공개 쪽 값이다
    "SUPABASE_URL", // 프로젝트 주소. 브라우저에도 같은 값이 나간다
    "SUPPORT_EMAIL", // 화면에 보여주는 값이다
    "NODE_ENV",
  ]);

  const missing = declared.filter(
    (name) =>
      !name.startsWith("NEXT_PUBLIC_") &&
      !NOT_SECRET.has(name) &&
      !SERVER_ONLY_SECRETS.includes(name),
  );

  assert.deepEqual(
    missing,
    [],
    `이 값이 비밀값 목록에 없다. SERVER_ONLY_SECRETS에 더하거나, 비밀이 아니면 NOT_SECRET에 이유와 함께 적는다: ${missing.join(", ")}`,
  );
});
