"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import { VIDEO_TIME_KIND } from "@/lib/captures/video-locator";
import { MAX_POSITION_SECONDS } from "@/lib/media/time";
import { sanitizeNextPath } from "@/lib/auth/request-url";
import { MAX_TITLE_LENGTH, formValue } from "@/lib/sources/schema";
import { createClient } from "@/lib/supabase/server";
import { lookupVideo, type VideoInfo } from "@/lib/youtube/lookup";
import {
  saveYoutubeProfile,
  sourceFieldsFromVideo,
} from "@/lib/youtube/queries";
import { extractVideoId } from "@/lib/youtube/video-id";

/**
 * YouTube 영상 정보. (설계 문서 14절)
 *
 * 세 겹으로 막는다.
 *   1. 이 파일의 requireActiveAccount
 *   2. youtube_profiles 정책 (소유자 + 승인 상태)
 *   3. 소유자 고정과 연결 확인 트리거
 *
 * **여기서 내보내는 것은 브라우저가 부를 수 있다.** async라고 안전한 것이
 * 아니다. 서버끼리만 쓰는 도우미는 `src/lib` 쪽에 둔다. 17-A와 19-A에서
 * 두 번 걸린 자리다. (`docs/VERIFICATION.md` 4-27절)
 */

function redirectWithQuery(path: string, params: Record<string, string>): never {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  redirect(query.length > 0 ? `${path}?${query}` : path);
}

/**
 * 주소나 번호로 영상을 찾는다.
 *
 * **찾기만 하고 담지 않는다.** 돌려준 값을 화면이 칸에 채우고, 사용자가
 * `저장`을 눌러야 담긴다. 저장 전에는 아무것도 저장되지 않고 바뀐 값이
 * 바로 보이므로, 덮어써도 위험하지 않다. (AGENTS.md 2절)
 */
export async function findVideo(
  input: string,
): Promise<
  { ok: true; video: VideoInfo } | { ok: false; message: string }
> {
  await requireActiveAccount();

  /*
    길이를 먼저 막는다. 주소가 이보다 길 일은 없고, 긴 값을 그대로
    밖으로 보내면 우리가 남의 서버에 짐을 지우는 셈이 된다.
  */
  if (input.length > 2000) {
    return { ok: false, message: "주소가 너무 깁니다." };
  }

  return lookupVideo(input);
}

const saveSchema = z.object({
  sourceId: z.string().uuid(),
  title: z.string().trim().min(1, "제목을 적어 주세요.").max(MAX_TITLE_LENGTH),
  /** 주소째로 와도 되고 번호만 와도 된다. 뽑는 규칙은 한 곳에 있다. */
  videoInput: z.string().trim().min(1, "영상 주소를 넣어 주세요.").max(2000),
  channelName: z
    .string()
    .trim()
    .max(500)
    .transform((value) => (value.length === 0 ? null : value)),
  /*
    아래 셋은 사용자가 손으로 적는 값이 아니라 **찾아온 값을 그대로 넘기는
    칸**이다. 화면이 숨은 칸으로 들고 있다가 함께 보낸다.

    숨은 칸이라도 믿지 않는다. 브라우저에서 고칠 수 있는 값이다.
  */
  publishedAt: z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? null : value))
    .refine((value) => value === null || !Number.isNaN(Date.parse(value)), {
      message: "게시일을 확인해 주세요.",
    }),
  durationSeconds: z
    .string()
    .trim()
    .transform((value) => (value.length === 0 ? null : Number(value)))
    .refine(
      (value) =>
        value === null ||
        (Number.isInteger(value) && value > 0 && value <= 86_400),
      { message: "영상 길이를 확인해 주세요." },
    ),
  /*
    `embeddable`은 세 값이다. `""`는 **모른다**는 뜻이고 false와 다르다.
    모르는 것을 false로 담으면 틀 수 있는 영상까지 바깥으로 내보낸다.
  */
  embeddable: z
    .enum(["", "true", "false"])
    .transform((value) => (value === "" ? null : value === "true")),
  returnTo: z.string(),
});

/**
 * 영상 정보를 담는다.
 *
 * 두 표에 나눠 담는다. 제목·주소·미리보기 그림은 `sources`, 나머지는
 * `youtube_profiles`다. 같은 값을 두 곳에 두지 않으려는 것이고, 그 덕에
 * **목록 화면의 표지 표시와 검색이 그대로 동작한다.**
 */
export async function saveVideoProfile(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = saveSchema.safeParse({
    sourceId: formValue(formData.get("sourceId")),
    title: formValue(formData.get("title")),
    videoInput: formValue(formData.get("videoInput")),
    channelName: formValue(formData.get("channelName")),
    publishedAt: formValue(formData.get("publishedAt")),
    durationSeconds: formValue(formData.get("durationSeconds")),
    embeddable: formValue(formData.get("embeddable")),
    returnTo: formValue(formData.get("returnTo")),
  });

  if (!parsed.success) {
    const fallback = sanitizeNextPath(formValue(formData.get("returnTo"))) ?? "/library";

    redirectWithQuery(fallback, {
      error:
        parsed.error.issues[0]?.message ?? "적어주신 내용을 확인해 주세요.",
    });
  }

  const values = parsed.data;
  const returnTo = sanitizeNextPath(values.returnTo) ?? "/library";

  /*
    주소에서 번호를 다시 뽑는다.

    화면이 이미 뽑아 두었더라도 여기서 한 번 더 한다. **브라우저에서 온
    값은 브라우저에서 고칠 수 있다.** 모양이 깨진 번호가 담기면 화면의
    플레이어가 검은 상자가 되고, 오류도 나지 않아 사용자는 영상이 지워진
    줄 안다. 데이터베이스의 제약조건도 같은 것을 보지만, 여기서 걸러야
    사용자에게 무엇이 잘못됐는지 말해 줄 수 있다.
  */
  const videoId = extractVideoId(values.videoInput);

  if (!videoId) {
    redirectWithQuery(returnTo, {
      error: "YouTube 주소로 보이지 않습니다. 주소창의 주소를 그대로 넣어 주세요.",
    });
  }

  const supabase = await createClient();
  const fields = sourceFieldsFromVideo(videoId);

  /*
    자료 쪽을 먼저 고친다.

    **소유자 조건을 질의에도 건다.** 정책이 이미 막지만, 막는 것과 0건이
    바뀌는 것은 다르다. 여기서 걸면 남의 자료 id가 와도 0건이 되고
    아래에서 알아챈다. (보안 원칙 5 "레이아웃의 확인만 믿지 않는다")
  */
  const { data: updated, error: sourceError } = await supabase
    .from("sources")
    .update({
      title: values.title,
      original_url: fields.originalUrl,
      thumbnail_url: fields.thumbnailUrl,
    })
    .eq("id", values.sourceId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle();

  if (sourceError || !updated) {
    console.error(
      "[ThreadMark] 영상 자료 저장 실패:",
      sourceError?.message ?? "대상 없음",
    );

    redirectWithQuery(returnTo, {
      error: "저장하지 못했습니다. 잠시 뒤에 다시 눌러 주세요.",
    });
  }

  const saved = await saveYoutubeProfile(values.sourceId, {
    videoId,
    channelName: values.channelName,
    publishedAt: values.publishedAt,
    durationSeconds: values.durationSeconds,
    embeddable: values.embeddable,
  });

  if (!saved) {
    redirectWithQuery(returnTo, {
      error: "영상 정보를 저장하지 못했습니다. 잠시 뒤에 다시 눌러 주세요.",
    });
  }

  revalidatePath(returnTo);
  revalidatePath("/library");

  redirectWithQuery(returnTo, { notice: "영상 정보를 저장했습니다." });
}

const momentSchema = z.object({
  sourceId: z.string().uuid(),
  /**
   * 재생기가 잡아 준 시점(초).
   *
   * 사람이 치는 칸이 아니다. **그래도 믿지 않는다.** 브라우저에서 온 값은
   * 브라우저에서 고칠 수 있다.
   */
  startSeconds: z
    .string()
    .trim()
    .min(1, "먼저 `지금 시점 담기`를 눌러 주세요.")
    .transform((value) => Number(value))
    .refine(
      (value) =>
        Number.isInteger(value) && value >= 0 && value <= MAX_POSITION_SECONDS,
      { message: "시점을 확인해 주세요." },
    ),
  content: z
    .string()
    .trim()
    .min(1, "이 대목에 남길 말을 적어 주세요.")
    .max(5000),
  returnTo: z.string(),
});

/**
 * 보던 시점에 기록을 남긴다. (설계 문서 14절)
 *
 * **여기가 이 기능의 값어치다.** 영상을 담아두기만 하는 것은 즐겨찾기와
 * 다르지 않다. 보다가 "여기다" 싶은 순간에 그 자리에서 한 줄 남길 수
 * 있어야 나중에 그 대목으로 돌아온다.
 *
 * 담는 곳은 `captures.locator`다. 새 표를 만들지 않는다. PDF의 자리와
 * 음악의 시점이 이미 그 칸을 쓰고 있고, `kind`로 갈린다. (6.3절)
 */
export async function captureVideoMoment(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = momentSchema.safeParse({
    sourceId: formValue(formData.get("sourceId")),
    startSeconds: formValue(formData.get("startSeconds")),
    content: formValue(formData.get("content")),
    returnTo: formValue(formData.get("returnTo")),
  });

  if (!parsed.success) {
    const fallback = sanitizeNextPath(formValue(formData.get("returnTo"))) ?? "/library";

    redirectWithQuery(fallback, {
      error: parsed.error.issues[0]?.message ?? "적어주신 내용을 확인해 주세요.",
    });
  }

  const values = parsed.data;
  const returnTo = sanitizeNextPath(values.returnTo) ?? "/library";

  const supabase = await createClient();

  const { error } = await supabase.from("captures").insert({
    source_id: values.sourceId,
    /*
      영상을 보며 남기는 말은 **내가 쓴 글**이다. 원문을 옮긴 것이 아니다.
      인용이 아니므로 `note`다. (설계 문서 2.4절)
    */
    capture_type: "note",
    content: values.content,
    locator: {
      kind: VIDEO_TIME_KIND,
      startSeconds: values.startSeconds,
      /*
        끝은 담지 않는다. 재생기를 보다가 누르는 것이 주된 쓰임이고, 그때
        끝을 정하려면 끝날 때까지 기다려야 한다. 그 기다림이 기록을 남기지
        않게 만든다. (video-locator.ts)
      */
      endSeconds: null,
    },
  });

  if (error) {
    console.error("[ThreadMark] 영상 시점 기록 실패:", error.message);

    redirectWithQuery(returnTo, {
      error: "기록하지 못했습니다. 잠시 뒤에 다시 눌러 주세요.",
    });
  }

  revalidatePath(returnTo.split(/[?#]/, 1)[0] || "/");

  redirectWithQuery(returnTo, { notice: "그 시점에 기록을 남겼습니다." });
}
