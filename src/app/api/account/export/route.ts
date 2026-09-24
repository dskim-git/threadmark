import { CAPTURE_CSV_HEAD, SOURCE_CSV_HEAD } from "@/lib/account/export-tables";
import { captureRows, sourceRows } from "@/lib/account/export-tables";
import { buildExport } from "@/lib/account/export-queries";
import { exportFileName, toCsv } from "@/lib/account/csv";

/**
 * 담아둔 것을 파일로 내려준다. (18단계)
 *
 * **화면이 아니라 길(Route Handler)로 만든다.** 내려받기는 화면을 그리는
 * 일이 아니라 파일 하나를 건네는 일이다. Server Action으로는 파일을
 * 건넬 수 없다.
 *
 * **세 가지 모양으로 준다.**
 *
 *   json      빠짐없는 사본. 나중에 되살리거나 옮길 때 쓴다
 *   sources   자료를 표로. 엑셀에서 열어 훑어본다
 *   captures  기록을 표로. 원문과 내 메모가 다른 칸에 있다
 *
 * JSON 하나만 주면 **대부분의 사람은 열어볼 수 없다.** 표로만 주면
 * 담아둔 것의 일부만 나간다. 둘 다 필요하다.
 *
 * **로그인과 승인을 확인한다.** `buildExport`가 `requireActiveAccount`를
 * 먼저 부르고, 그 위에 RLS가 한 번 더 자기 것만 돌려준다. 두 겹이다.
 * 이 길은 `(app)` 묶음 밖에 있어서 레이아웃의 확인을 받지 못한다.
 * **레이아웃의 확인만 믿지 않는다.** (보안 원칙 5)
 */

/** 받을 수 있는 모양들. 그 밖의 값은 거절한다. (보안 원칙 7) */
const FORMATS = ["json", "sources", "captures"] as const;

type Format = (typeof FORMATS)[number];

function isFormat(value: string | null): value is Format {
  return value !== null && (FORMATS as readonly string[]).includes(value);
}

export async function GET(request: Request): Promise<Response> {
  const format = new URL(request.url).searchParams.get("format") ?? "json";

  if (!isFormat(format)) {
    return new Response("알 수 없는 모양입니다.", { status: 400 });
  }

  /*
    `requireActiveAccount`가 로그인하지 않았거나 승인되지 않은 경우
    다른 화면으로 보낸다. 여기서 따로 잡지 않는다. 잡으면 그 판단이
    두 곳에 생긴다.
  */
  const bundle = await buildExport();

  if (format === "json") {
    return download(
      // 사람이 열어볼 수도 있으므로 줄을 나눠 적는다.
      JSON.stringify(bundle, null, 2),
      "application/json; charset=utf-8",
      exportFileName("all", "json"),
    );
  }

  const csv =
    format === "sources"
      ? toCsv(SOURCE_CSV_HEAD, sourceRows(bundle.tables))
      : toCsv(CAPTURE_CSV_HEAD, captureRows(bundle.tables));

  return download(csv, "text/csv; charset=utf-8", exportFileName(format, "csv"));
}

/**
 * 브라우저가 화면에 펼치지 않고 파일로 받게 한다.
 *
 * `Content-Disposition: attachment`가 그 일을 한다. 없으면 JSON이 화면에
 * 통째로 펼쳐지고, 사용자는 그것을 어떻게 저장할지 알 수 없다.
 *
 * **저장해 두지 않는다.** 내려받는 순간의 자료여야 하고, 중간에 누가
 * 끼워 보관하면 그 사본이 어디에 남는지 우리가 모른다.
 */
function download(body: string, type: string, fileName: string): Response {
  return new Response(body, {
    headers: {
      "content-type": type,
      "content-disposition": `attachment; filename="${fileName}"`,
      "cache-control": "no-store, private",
    },
  });
}
