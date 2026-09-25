/**
 * Drive 리디렉션 주소가 세 곳에서 같은지 본다. (18단계 마무리)
 *
 * 이 주소는 **우리 저장소 밖에 한 벌 더 있다.** Google Cloud Console의
 * `승인된 리디렉션 URI` 목록이다. 그것과 코드가 어긋나면 연결이 안 된다.
 *
 * Google은 주소를 **글자 단위로 비교하며 와일드카드를 받지 않는다.**
 * 이 저장소가 그 때문에 두 번 막혔다. 12-A에서 OAuth 리디렉션이,
 * 12-C에서 Picker의 API key가 걸렸다. 포트 하나가 달랐을 뿐이었다.
 * (AGENTS.md 6절)
 *
 * 검사가 할 수 있는 것과 없는 것
 *   **Console에 무엇이 등록되어 있는지는 여기서 알 수 없다.** 밖에 있는
 *   설정이고, 본다 해도 그것이 도는지는 눌러봐야 안다.
 *
 *   여기서 붙잡는 것은 **우리 쪽 세 곳이 서로 어긋나지 않는 것**이다.
 *   상수, 실제 화면 파일, 그리고 설계 문서 10.6절의 기록. 이 셋이 맞으면
 *   Console과 맞춰야 할 값이 하나로 정해진다. 어긋나면 어느 것을 Console에
 *   넣어야 하는지부터 알 수 없어진다.
 *
 *   상수를 고치면 이 검사가 실패한다. **그때 문서를 고치게 되고, 문서를
 *   고치면서 Console도 고쳐야 한다는 것을 떠올리게 된다.** 그것이 이
 *   검사의 쓸모다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { DRIVE_CALLBACK_PATH } from "../src/lib/drive/oauth.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");

const blueprint = readFileSync(
  path.join(repoRoot, "docs", "THREADMARK_BLUEPRINT.md"),
  "utf8",
);

test("콜백 경로에 실제 화면 파일이 있다", () => {
  /*
    상수만 고치고 파일을 옮기지 않거나, 파일만 옮기고 상수를 그대로 두면
    **연결 단추를 누를 때까지 아무도 모른다.** 그때 나는 오류는 404이고,
    Google 쪽 문제처럼 보인다.
  */
  const routeFile = path.join(
    repoRoot,
    "src",
    "app",
    ...DRIVE_CALLBACK_PATH.split("/").filter(Boolean),
    "route.ts",
  );

  assert.ok(
    existsSync(routeFile),
    `${DRIVE_CALLBACK_PATH}를 받을 파일이 없다: ${path.relative(repoRoot, routeFile)}`,
  );
});

test("설계 문서 10.6절이 같은 경로를 적어두고 있다", () => {
  /*
    문서에 적힌 것이 곧 Google Cloud Console에 넣을 값이다.
    코드가 앞서 가고 문서가 뒤처지면, 다음에 주소를 등록하는 사람이
    **틀린 값을 넣는다.**
  */
  assert.ok(
    blueprint.includes(DRIVE_CALLBACK_PATH),
    `설계 문서에 ${DRIVE_CALLBACK_PATH}가 없다. 10.6절을 고치고 Google Cloud Console도 함께 고친다`,
  );
});

test("배포 주소와 개발 주소가 모두 적혀 있다", () => {
  /*
    **포트 하나가 다르면 완전히 다른 곳이다.** 개발 서버는 3001번에서 뜨는데
    처음에는 3000번만 등록해 두었고, 그래서 막혔다.

    배포 주소도 함께 본다. 로컬에서만 되고 배포에서 안 되는 일을 이 저장소가
    이미 겪었다.
  */
  const musts = [
    `http://localhost:3001${DRIVE_CALLBACK_PATH}`,
    `https://thread-mark.vercel.app${DRIVE_CALLBACK_PATH}`,
  ];

  const missing = musts.filter((uri) => !blueprint.includes(uri));

  assert.deepEqual(
    missing,
    [],
    `설계 문서 10.6절에 이 리디렉션 주소가 없다: ${missing.join(", ")}`,
  );
});
