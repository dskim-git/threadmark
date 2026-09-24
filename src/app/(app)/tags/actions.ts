"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import { sanitizeNextPath } from "@/lib/auth/request-url";
import { formValue } from "@/lib/sources/schema";
import {
  MAX_TAGS_PER_ITEM,
  parseTagInput,
  toTagName,
  toTagSlug,
} from "@/lib/tags/name";
import { createClient } from "@/lib/supabase/server";

/**
 * 태그 달기·떼기·이름 고치기. (설계 문서 20-1절)
 *
 * 세 겹으로 막는다.
 *   1. 이 함수의 requireActiveAccount
 *   2. tags·source_tags·capture_tags의 *_own 정책 (소유자 + 승인 상태)
 *   3. 소유자 고정과 **양쪽** 참조 확인 트리거
 *
 * 양쪽 확인을 여기서 흉내 내지 않는다. 두 벌이 되면 한쪽만 고쳐졌을 때 어느
 * 쪽이 맞는지 알 수 없다. 여기서는 요청 값의 모양만 본다.
 *
 * 성공하면 아무 말도 하지 않는다. 태그는 달렸는지가 화면에 바로 보이는 일이고,
 * 알림 줄이 뜨면 여러 개를 달 때마다 화면이 들썩인다. 별과 같은 규칙이다.
 */

/**
 * 조회 문자열을 붙여 이동한다.
 *
 * Server Action의 리디렉션 주소는 HTTP 헤더로 전달되고, 헤더 값에는 ASCII만
 * 들어갈 수 있다. 한글 메시지를 주소에 그대로 넣으면 응답 자체가 깨진다.
 */
function redirectWithQuery(
  path: string,
  params: Record<string, string>,
): never {
  const query = Object.entries(params)
    .map(
      ([key, value]) =>
        `${encodeURIComponent(key)}=${encodeURIComponent(value)}`,
    )
    .join("&");

  redirect(query.length > 0 ? `${path}?${query}` : path);
}

/** 조회 문자열과 조각을 떼어낸 경로. revalidatePath에 넘길 값이다. */
function pathOnly(value: string): string {
  return value.split(/[?#]/, 1)[0] || "/";
}

/**
 * 무엇에 다는지. 자료와 기록이 표만 다르고 나머지가 같다.
 *
 * 표 이름과 열 이름을 값으로 골라 쓰지 않는다. 생성된 타입이 표마다 다른
 * 모양을 갖고 있어서, 문자열로 고르면 타입이 어느 표인지 알 수 없게 된다.
 * 대신 두 갈래를 각각 적는다. 줄이 몇 줄 늘지만 잘못된 열 이름을 쓰면
 * 컴파일 단계에서 걸린다.
 */
type Target = "source" | "capture";

/**
 * 이름으로 태그를 찾고, 없으면 만든다.
 *
 * 화면은 이름만 보낸다. 태그 id를 화면이 들고 다니게 하면, 처음 쓰는 태그를
 * 달 때 "먼저 태그를 만들고 그다음에 단다"는 두 걸음이 된다. 읽다가 떠오른
 * 낱말을 적는 일에 두 걸음은 너무 길다.
 *
 * 이미 있으면 그 행을 쓴다. `AI`와 `ai`가 같은 태그인 것은 slug의
 * unique 인덱스가 보장한다. 여기서 slug로 먼저 찾아보고, 없을 때만 만든다.
 *
 * 만드는 도중에 같은 태그가 먼저 들어올 수 있다(두 창에서 동시에 달기).
 * 그때는 unique 인덱스가 막으므로, 실패하면 다시 한 번 찾아본다.
 * "만들기 실패"를 그대로 오류로 내보내면 멀쩡한 요청이 실패한다.
 */
async function resolveTagIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  names: readonly string[],
): Promise<string[]> {
  if (names.length === 0) {
    return [];
  }

  const slugs = names.map(toTagSlug);

  const { data: existing, error: findError } = await supabase
    .from("tags")
    .select("id, slug")
    .in("slug", slugs);

  if (findError) {
    console.error("[ThreadMark] 태그 조회 실패:", findError.message);

    return [];
  }

  const bySlug = new Map((existing ?? []).map((row) => [row.slug, row.id]));
  const missing = names.filter((name) => !bySlug.has(toTagSlug(name)));

  if (missing.length > 0) {
    const { data: created, error: createError } = await supabase
      .from("tags")
      // owner_id는 보내지 않는다. 컬럼 기본값과 트리거가 auth.uid()로 채운다.
      .insert(missing.map((name) => ({ name, slug: toTagSlug(name) })))
      .select("id, slug");

    if (createError) {
      console.error("[ThreadMark] 태그 생성 실패:", createError.message);
    }

    for (const row of created ?? []) {
      bySlug.set(row.slug, row.id);
    }

    // 만들기가 막혔다면 그 사이에 누가 먼저 만든 것일 수 있다. 다시 찾아본다.
    if (createError) {
      const { data: again } = await supabase
        .from("tags")
        .select("id, slug")
        .in("slug", slugs);

      for (const row of again ?? []) {
        bySlug.set(row.slug, row.id);
      }
    }
  }

  return names.flatMap((name) => {
    const id = bySlug.get(toTagSlug(name));

    return id ? [id] : [];
  });
}

const attachSchema = z.object({
  target: z.enum(["source", "capture"]),
  id: z.uuid(),
  names: z.string(),
  returnTo: z.string(),
});

/**
 * 한 줄에 쉼표로 이어 친 태그를 단다.
 *
 * 이미 달려 있는 것을 다시 달아도 오류가 아니다. 연결 표의 기본키가 겹치는
 * 것을 막고, 우리는 그것을 "이미 달려 있다"로 읽는다. 사용자에게는 같은
 * 결과이므로 알릴 것이 없다.
 */
export async function attachTags(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = attachSchema.safeParse({
    target: formValue(formData.get("target")),
    id: formValue(formData.get("id")),
    names: formData.get("names") ?? "",
    returnTo: formValue(formData.get("returnTo")),
  });

  if (!parsed.success) {
    redirectWithQuery(
      sanitizeNextPath(formValue(formData.get("returnTo"))),
      { error: "잘못된 요청입니다." },
    );
  }

  const destination = sanitizeNextPath(parsed.data.returnTo);
  const names = parseTagInput(parsed.data.names);

  // 쳤는데 쓸 수 있는 것이 하나도 없었다. 쉼표만 쳤거나 모두 너무 길었다.
  if (names.length === 0) {
    redirectWithQuery(destination, {
      error: `태그를 알아볼 수 없습니다. 쉼표로 나누고, 하나에 40자까지, 한 번에 ${MAX_TAGS_PER_ITEM}개까지 적을 수 있습니다.`,
    });
  }

  const supabase = await createClient();
  const tagIds = await resolveTagIds(supabase, names);

  if (tagIds.length === 0) {
    redirectWithQuery(destination, {
      error: "태그를 만들지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  // 이미 달려 있는 것은 그냥 둔다. 다시 달았다고 알릴 일이 아니다.
  const { error } =
    parsed.data.target === "source"
      ? await supabase.from("source_tags").upsert(
          tagIds.map((tagId) => ({
            source_id: parsed.data.id,
            tag_id: tagId,
          })),
          { onConflict: "source_id,tag_id", ignoreDuplicates: true },
        )
      : await supabase.from("capture_tags").upsert(
          tagIds.map((tagId) => ({
            capture_id: parsed.data.id,
            tag_id: tagId,
          })),
          { onConflict: "capture_id,tag_id", ignoreDuplicates: true },
        );

  if (error) {
    console.error("[ThreadMark] 태그 달기 실패:", error.message);
    redirectWithQuery(destination, {
      error: "태그를 달지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  revalidateFor(parsed.data.target, destination);
}

const detachSchema = z.object({
  target: z.enum(["source", "capture"]),
  id: z.uuid(),
  tagId: z.uuid(),
  returnTo: z.string(),
});

/**
 * 태그를 뗀다.
 *
 * 태그 자체는 지우지 않는다. 다른 자료에도 달려 있을 수 있고, 마지막 하나를
 * 떼었더라도 그 이름을 다시 쓸 수 있게 목록에 남겨두는 편이 낫다.
 * 태그를 아예 없애는 길은 태그 화면에 따로 있다.
 */
export async function detachTag(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = detachSchema.safeParse({
    target: formValue(formData.get("target")),
    id: formValue(formData.get("id")),
    tagId: formValue(formData.get("tagId")),
    returnTo: formValue(formData.get("returnTo")),
  });

  if (!parsed.success) {
    redirectWithQuery(
      sanitizeNextPath(formValue(formData.get("returnTo"))),
      { error: "잘못된 요청입니다." },
    );
  }

  const destination = sanitizeNextPath(parsed.data.returnTo);
  const supabase = await createClient();

  const { error } =
    parsed.data.target === "source"
      ? await supabase
          .from("source_tags")
          .delete()
          .eq("source_id", parsed.data.id)
          .eq("tag_id", parsed.data.tagId)
      : await supabase
          .from("capture_tags")
          .delete()
          .eq("capture_id", parsed.data.id)
          .eq("tag_id", parsed.data.tagId);

  if (error) {
    console.error("[ThreadMark] 태그 떼기 실패:", error.message);
    redirectWithQuery(destination, {
      error: "태그를 떼지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  revalidateFor(parsed.data.target, destination);
}

const renameSchema = z.object({
  tagId: z.uuid(),
  name: z.string(),
  returnTo: z.string(),
});

/**
 * 태그 이름을 고친다.
 *
 * 지웠다 다시 만드는 것으로 대신할 수 없다. 그러면 그 태그로 달아둔 것이
 * 전부 끊긴다. 그래서 연결 표와 달리 `tags`에는 UPDATE 권한이 있다.
 */
export async function renameTag(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = renameSchema.safeParse({
    tagId: formValue(formData.get("tagId")),
    name: formData.get("name") ?? "",
    returnTo: formValue(formData.get("returnTo")),
  });

  if (!parsed.success) {
    redirectWithQuery(
      sanitizeNextPath(formValue(formData.get("returnTo"))),
      { error: "잘못된 요청입니다." },
    );
  }

  const destination = sanitizeNextPath(parsed.data.returnTo);
  const name = toTagName(parsed.data.name);
  const names = parseTagInput(name);

  // 하나만 받는다. 쉼표로 여럿을 치면 어느 것으로 고칠지 알 수 없다.
  if (names.length !== 1 || names[0] !== name) {
    redirectWithQuery(destination, {
      error: "태그 이름은 쉼표 없이 하나만, 40자까지 적을 수 있습니다.",
    });
  }

  const supabase = await createClient();

  const { error } = await supabase
    .from("tags")
    .update({ name, slug: toTagSlug(name) })
    .eq("id", parsed.data.tagId);

  if (error) {
    console.error("[ThreadMark] 태그 이름 고치기 실패:", error.message);
    redirectWithQuery(destination, {
      /*
        같은 이름이 이미 있으면 unique 인덱스가 막는다. 그것이 가장 흔한
        실패이므로 그 경우를 먼저 말한다. 합치는 길은 아직 없다.
      */
      error:
        "이름을 고치지 못했습니다. 같은 이름의 태그가 이미 있는지 확인해 주세요.",
    });
  }

  revalidatePath("/tags");
  revalidatePath("/library");
  revalidatePath("/inbox");
  redirectWithQuery(destination, { notice: "태그 이름을 고쳤습니다." });
}

const deleteSchema = z.object({
  tagId: z.uuid(),
  returnTo: z.string(),
});

/**
 * 태그를 아예 없앤다.
 *
 * 달아둔 것이 함께 끊긴다(on delete cascade). 자료와 기록은 그대로다.
 * 되돌릴 수 없으므로 화면에서 무엇이 끊기는지 개수로 먼저 알린다.
 */
export async function deleteTag(formData: FormData): Promise<void> {
  await requireActiveAccount();

  const parsed = deleteSchema.safeParse({
    tagId: formValue(formData.get("tagId")),
    returnTo: formValue(formData.get("returnTo")),
  });

  if (!parsed.success) {
    redirectWithQuery(
      sanitizeNextPath(formValue(formData.get("returnTo"))),
      { error: "잘못된 요청입니다." },
    );
  }

  const destination = sanitizeNextPath(parsed.data.returnTo);
  const supabase = await createClient();

  const { error } = await supabase
    .from("tags")
    .delete()
    .eq("id", parsed.data.tagId);

  if (error) {
    console.error("[ThreadMark] 태그 삭제 실패:", error.message);
    redirectWithQuery(destination, {
      error: "태그를 지우지 못했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  revalidatePath("/tags");
  revalidatePath("/library");
  revalidatePath("/inbox");
  redirectWithQuery("/tags", { notice: "태그를 지웠습니다." });
}

/**
 * 태그가 보이는 곳을 다시 그린다.
 *
 * 같은 자료가 여러 화면에 보인다. 한 곳에서 달고 다른 곳으로 가면 옛 모습이
 * 남아 있으면 안 된다. 태그 목록 화면의 개수도 함께 달라진다.
 */
function revalidateFor(target: Target, destination: string): void {
  revalidatePath(pathOnly(destination));
  revalidatePath("/tags");

  if (target === "source") {
    revalidatePath("/library");
  } else {
    revalidatePath("/inbox");
  }
}
