import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

/**
 * 웹사이트 자료의 추가 정보 조회. (설계 문서 11.1절)
 *
 * sources가 담지 않는 넷만 여기 있다. 사이트명, 작성자, 게시일, favicon이다.
 * 나머지는 자료 자체가 들고 있다.
 */

export type WebsiteProfile = {
  siteName: string | null;
  author: string | null;
  /** 사이트가 적어둔 그대로. 날짜로 바꾸지 않는다. */
  publishedAt: string | null;
  faviconUrl: string | null;
  /** 언제 받아온 값인지. 웹페이지는 바뀐다. */
  fetchedAt: string | null;
};

export async function getWebsiteProfile(
  sourceId: string,
): Promise<WebsiteProfile | null> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("website_profiles")
    .select("site_name, author, published_at, favicon_url, fetched_at")
    .eq("source_id", sourceId)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 웹사이트 정보 조회 실패:", error.message);

    return null;
  }

  if (!data) {
    return null;
  }

  return {
    siteName: data.site_name,
    author: data.author,
    publishedAt: data.published_at,
    /*
      담을 때도 막지만 읽을 때도 본다. 예전에 담긴 값이 있을 수 있고,
      이 값은 화면의 그림 주소로 들어간다.
    */
    faviconUrl: isHttpUrl(data.favicon_url) ? data.favicon_url : null,
    fetchedAt: data.fetched_at,
  };
}

function isHttpUrl(value: string | null): boolean {
  return (
    value !== null &&
    (value.startsWith("http://") || value.startsWith("https://"))
  );
}
