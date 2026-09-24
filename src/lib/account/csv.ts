/**
 * 표 파일(CSV)을 만든다. (18단계, 내려받기)
 *
 * **여기가 조용히 틀리기 쉬운 곳이다.** 우리가 담는 글에는 쉼표도 있고
 * 따옴표도 있고 줄바꿈도 있다. 인용한 문장이 특히 그렇다. 그대로 이어
 * 붙이면 **칸이 밀려서 엉뚱한 자리에 글이 들어간다.**
 *
 * 그리고 그 잘못은 눈에 잘 띄지 않는다. 파일은 멀쩡히 만들어지고, 열어도
 * 표처럼 보인다. 수백 줄 중 쉼표가 든 몇 줄만 어긋나 있다.
 *
 * 규칙은 짧다. (RFC 4180)
 *
 *   따옴표·쉼표·줄바꿈이 들어 있으면 전체를 따옴표로 감싼다
 *   안에 든 따옴표는 두 번 적는다
 *
 * **엑셀을 위해 BOM을 앞에 붙인다.** 붙이지 않으면 엑셀이 한글을 깨뜨린다.
 * 다른 프로그램은 BOM이 있어도 괜찮지만 엑셀은 없으면 안 된다. 내려받아
 * 여는 사람의 대부분이 엑셀을 쓴다.
 *
 * **이 파일에 다른 것을 import하지 않는다.** 검사가 이 셈만 따로 들여다볼
 * 수 있어야 한다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 검사로 검증한다.
 */

/**
 * 엑셀이 한글을 알아보게 하는 표시.
 *
 * 눈에 보이지 않는 글자 하나다. 없으면 엑셀이 파일을 제 컴퓨터의 기본
 * 문자표로 읽어 `기록`이 `湲곕줉`처럼 나온다.
 */
export const CSV_BOM = "﻿";

/**
 * 한 칸을 안전한 모양으로 만든다.
 *
 * `null`과 `undefined`는 빈 칸이다. **`"null"`이라는 글자를 적지 않는다.**
 * 표를 열어본 사람이 그것을 자기가 적은 값으로 읽게 된다.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  /*
    목록은 세미콜론으로 잇는다.

    쉼표로 이으면 칸을 나누는 글자와 같아져서, 감싸지 않으면 칸이 밀린다.
    감싸더라도 표를 여는 사람이 "이게 한 칸인가 여러 칸인가"를 헷갈린다.
    태그와 저자 이름이 이 길로 온다.
  */
  const text = Array.isArray(value)
    ? value.map((item) => String(item ?? "")).join("; ")
    : String(value);

  if (!/[",\r\n]/u.test(text)) {
    return text;
  }

  return `"${text.replaceAll('"', '""')}"`;
}

/**
 * 머리줄과 값들로 표 파일 한 덩어리를 만든다.
 *
 * 줄 끝은 `\r\n`이다. RFC 4180이 그렇게 정했고, 윈도우 엑셀이 그것을
 * 기대한다. `\n`만 쓰면 어떤 프로그램에서 한 줄로 붙어 보인다.
 */
export function toCsv(
  head: readonly string[],
  rows: readonly (readonly unknown[])[],
): string {
  const lines = [head.map(csvCell).join(",")];

  for (const row of rows) {
    lines.push(row.map(csvCell).join(","));
  }

  /*
    끝에 줄바꿈을 하나 둔다. 없으면 어떤 도구가 마지막 줄을 읽다 만
    것으로 본다.
  */
  return CSV_BOM + lines.join("\r\n") + "\r\n";
}

/**
 * 내려받을 때 붙일 파일 이름.
 *
 * **날짜를 넣는다.** 두 번 내려받으면 `(1)`이 붙어 어느 것이 최신인지
 * 알 수 없게 된다. 날짜가 있으면 파일 이름만 보고 안다.
 *
 * 파일 이름에 쓸 수 없는 글자를 넣지 않는다. 한글은 괜찮지만 운영체제마다
 * 다루는 방식이 달라서, **이름은 영문과 숫자로만 만든다.**
 */
export function exportFileName(kind: string, extension: string): string {
  const today = new Date().toISOString().slice(0, 10);

  return `threadmark-${kind}-${today}.${extension}`;
}
