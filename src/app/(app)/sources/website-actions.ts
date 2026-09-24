"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account";
import { MAX_DESCRIPTION_LENGTH, MAX_TITLE_LENGTH, formValue } from "@/lib/sources/schema";
import { parseTagInput, toTagSlug } from "@/lib/tags/name";
import { createClient } from "@/lib/supabase/server";
import { fetchWebsiteMetadata } from "@/lib/websites/fetch";
import { MAX_META_TEXT_LENGTH } from "@/lib/websites/metadata";
import { checkWebsiteUrl } from "@/lib/websites/safe-url";

/**
 * 웹사이트 자료 등록. (설계 문서 11.2절)
 *
 * 흐름이 둘로 나뉜다.
 *
 *   1. 미리 보기  주소를 받아 그 페이지의 공개 정보를 읽어 온다. 저장하지 않는다.
 *   2. 저장       사용자가 확인하고 고친 값으로 자료를 만든다.
 *
 * **미리 보기에서 저장하지 않는 것이 중요하다.** 받아온 제목이 엉뚱할 수
 * 있고, 사이트가 로그인을 요구해 아무것도 못 받아올 수도 있다. 그때 이미
 * 자료가 만들어져 있으면 지우는 일이 하나 더 생긴다. 사용자가 보고 정한다.
 *
 * 받아오기가 실패해도 자료는 만들 수 있다. 주소와 제목은 손으로 적으면
 * 된다. 받아오기는 **손을 덜어주는 일**이지 자료를 담는 조건이 아니다.
 */

function redirectWithQuery(path: string, params: Record<string, string>): never {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  redirect(query.length > 0 ? `${path}?${query}` : path);
}

export type WebsitePreview = {
  url: string;
  title: string;
  siteName: string;
  description: string;
  author: string;
  publishedAt: string;
  canonicalUrl: string;
  imageUrl: string;
  faviconUrl: string;
};

export type PreviewResult =
  | { ok: true; preview: WebsitePreview }
  | { ok: false; message: string; url: string };

/**
 * 주소를 받아 그 페이지의 공개 정보를 읽어 온다. 저장하지 않는다.
 *
 * 실패해도 주소는 돌려준다. 화면이 그 주소를 그대로 들고 있다가, 사용자가
 * 손으로 제목만 적어 담을 수 있게 하려는 것이다.
 */
export async function previewWebsite(url: string): Promise<PreviewResult> {
  await requireActiveAccount("/sources/new/website");

  const checked = checkWebsiteUrl(url);
  const safeUrl = checked.ok ? checked.url : typeof url === "string" ? url.trim() : "";

  const result = await fetchWebsiteMetadata(url);

  if (!result.ok) {
    /*
      무엇이 걸렸는지는 사용자에게 알리되, 서버 기록에는 주소를 남기지 않는다.
      실패한 주소가 그대로 쌓이면 그 자체가 남의 자료가 된다.
    */
    console.error("[ThreadMark] 웹사이트 정보 가져오기 실패:", result.reason);

    return { ok: false, message: result.message, url: safeUrl };
  }

  const meta = result.metadata;

  return {
    ok: true,
    preview: {
      url: result.finalUrl,
      title: meta.title ?? "",
      siteName: meta.siteName ?? "",
      description: meta.description ?? "",
      author: meta.author ?? "",
      publishedAt: meta.publishedAt ?? "",
      canonicalUrl: meta.canonicalUrl ?? "",
      imageUrl: meta.imageUrl ?? "",
      faviconUrl: meta.faviconUrl ?? "",
    },
  };
}

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value.length === 0 ? null : value));

const saveSchema = z.object({
  url: z.string(),
  title: z.string().trim().min(1, "제목을 적어 주세요.").max(MAX_TITLE_LENGTH),
  description: optionalText(MAX_DESCRIPTION_LENGTH),
  siteName: optionalText(MAX_META_TEXT_LENGTH),
  author: optionalText(MAX_META_TEXT_LENGTH),
  publishedAt: optionalText(MAX_META_TEXT_LENGTH),
  canonicalUrl: optionalText(2000),
  imageUrl: optionalText(2000),
  faviconUrl: optionalText(2000),
  memo: optionalText(20000),
  tags: z.string(),
});

/**
 * 확인한 값으로 웹사이트 자료를 만든다.
 *
 * 한 번에 여럿을 만든다. 자료, 웹사이트 정보, 메모 기록, 태그다.
 * **자료부터 만들고 나머지는 실패해도 넘어간다.** 자료가 만들어졌는데
 * 태그 하나 때문에 통째로 되돌리면, 사용자는 방금 읽은 페이지를 다시
 * 찾아와야 한다. 딸린 것은 나중에 자료 화면에서 붙일 수 있다.
 */
export async function createWebsiteSource(formData: FormData): Promise<void> {
  await requireActiveAccount("/sources/new/website");

  const parsed = saveSchema.safeParse({
    url: formValue(formData.get("url")),
    title: formValue(formData.get("title")),
    description: formValue(formData.get("description")),
    siteName: formValue(formData.get("siteName")),
    author: formValue(formData.get("author")),
    publishedAt: formValue(formData.get("publishedAt")),
    canonicalUrl: formValue(formData.get("canonicalUrl")),
    imageUrl: formValue(formData.get("imageUrl")),
    faviconUrl: formValue(formData.get("faviconUrl")),
    memo: formData.get("memo") ?? "",
    tags: formData.get("tags") ?? "",
  });

  if (!parsed.success) {
    redirectWithQuery("/sources/new/website", {
      error: parsed.error.issues[0]?.message ?? "입력을 확인해 주세요.",
    });
  }

  const input = parsed.data;

  /*
    주소를 여기서 한 번 더 본다. 화면이 보낸 값이라 그대로 믿지 않는다.
    미리 보기를 거치지 않고 바로 저장을 부르는 것이 가능하다.
  */
  const checked = checkWebsiteUrl(input.url);

  if (!checked.ok) {
    redirectWithQuery("/sources/new/website", { error: checked.message });
  }

  const supabase = await createClient();

  const { data: source, error: sourceError } = await supabase
    .from("sources")
    // owner_id는 넣지 않는다. 컬럼 기본값과 트리거가 auth.uid()로 채운다.
    .insert({
      type: "website",
      title: input.title,
      description: input.description,
      original_url: checked.url,
      canonical_url: safeHttpUrl(input.canonicalUrl),
      thumbnail_url: safeHttpUrl(input.imageUrl),
    })
    .select("id")
    .single();

  if (sourceError || !source) {
    console.error("[ThreadMark] 웹사이트 자료 생성 실패:", sourceError?.message);
    redirectWithQuery("/sources/new/website", {
      error: "저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    });
  }

  await attachProfile(supabase, source.id, input);
  await attachMemo(supabase, source.id, input.memo);
  await attachTags(supabase, source.id, input.tags);

  revalidatePath("/library");
  redirectWithQuery(`/sources/${source.id}`, {
    notice: "웹사이트를 담았습니다.",
  });
}

/** 사이트명·작성자·게시일·favicon. sources가 담지 않는 넷이다. */
async function attachProfile(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceId: string,
  input: z.infer<typeof saveSchema>,
): Promise<void> {
  const { error } = await supabase.from("website_profiles").insert({
    source_id: sourceId,
    site_name: input.siteName,
    author: input.author,
    published_at: input.publishedAt,
    favicon_url: safeHttpUrl(input.faviconUrl),
    fetched_at: new Date().toISOString(),
  });

  if (error) {
    console.error("[ThreadMark] 웹사이트 정보 저장 실패:", error.message);
  }
}

/**
 * 적어둔 메모를 기록으로 남긴다. (11.2절의 `사용자 메모 작성`)
 *
 * 자료의 설명이 아니라 **기록**으로 남기는 이유가 있다. 설명은 그 페이지가
 * 무엇인가를 적는 자리이고, 메모는 내가 무엇을 생각했는가를 적는 자리다.
 * 설계 문서 2.4절이 그 둘을 섞지 말라고 한다.
 */
async function attachMemo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceId: string,
  memo: string | null,
): Promise<void> {
  if (!memo) {
    return;
  }

  const { error } = await supabase.from("captures").insert({
    source_id: sourceId,
    capture_type: "note",
    content: memo,
  });

  if (error) {
    console.error("[ThreadMark] 웹사이트 메모 저장 실패:", error.message);
  }
}

/** 적어둔 태그를 붙인다. 없는 태그는 만든다. (설계 문서 20-1절) */
async function attachTags(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceId: string,
  raw: string,
): Promise<void> {
  const names = parseTagInput(raw);

  if (names.length === 0) {
    return;
  }

  const slugs = names.map(toTagSlug);

  const { data: existing } = await supabase
    .from("tags")
    .select("id, slug")
    .in("slug", slugs);

  const bySlug = new Map((existing ?? []).map((row) => [row.slug, row.id]));
  const missing = names.filter((name) => !bySlug.has(toTagSlug(name)));

  if (missing.length > 0) {
    const { data: created } = await supabase
      .from("tags")
      .insert(missing.map((name) => ({ name, slug: toTagSlug(name) })))
      .select("id, slug");

    for (const row of created ?? []) {
      bySlug.set(row.slug, row.id);
    }
  }

  const tagIds = names.flatMap((name) => {
    const id = bySlug.get(toTagSlug(name));

    return id ? [id] : [];
  });

  if (tagIds.length === 0) {
    return;
  }

  const { error } = await supabase
    .from("source_tags")
    .upsert(
      tagIds.map((tagId) => ({ source_id: sourceId, tag_id: tagId })),
      { onConflict: "source_id,tag_id", ignoreDuplicates: true },
    );

  if (error) {
    console.error("[ThreadMark] 웹사이트 태그 붙이기 실패:", error.message);
  }
}

/**
 * 주소 자리에 들어갈 값을 한 번 더 본다.
 *
 * 화면이 보낸 값이고, 그 값의 출처는 우리가 받아온 남의 페이지다.
 * `javascript:`가 화면의 링크에 들어가면 누르는 순간 실행된다.
 * 데이터베이스 제약조건도 막지만, 막히면 저장이 통째로 실패한다.
 * 여기서 걸러내면 나머지는 저장된다.
 */
function safeHttpUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return value.startsWith("http://") || value.startsWith("https://")
    ? value
    : null;
}
