import { requireActiveAccount } from "@/lib/auth/account";
import { createClient } from "@/lib/supabase/server";

import { isCaptureType, type CaptureType } from "./types";

/**
 * Capture 조회 계층.
 *
 * sources와 같은 원칙을 따른다. 모든 함수가 먼저 승인된 계정인지 확인하고,
 * 삭제 표시된 행은 RLS가 걸러내지만 질의에서도 한 번 더 제외한다.
 */

const CAPTURE_COLUMNS =
  "id, source_id, capture_type, content, original_text, translated_text, translation_language, ai_generated, created_at, updated_at";

export type Capture = {
  id: string;
  sourceId: string | null;
  captureType: CaptureType;
  content: string | null;
  originalText: string | null;
  translatedText: string | null;
  translationLanguage: string | null;
  aiGenerated: boolean;
  createdAt: string;
  updatedAt: string;
};

type CaptureRow = {
  id: string;
  source_id: string | null;
  capture_type: string;
  content: string | null;
  original_text: string | null;
  translated_text: string | null;
  translation_language: string | null;
  ai_generated: boolean;
  created_at: string;
  updated_at: string;
};

function toCapture(row: CaptureRow): Capture[] {
  // 알 수 없는 유형은 조용히 버린다. 화면이 무엇을 보여줄지 정할 수 없기 때문이다.
  if (!isCaptureType(row.capture_type)) {
    return [];
  }

  return [
    {
      id: row.id,
      sourceId: row.source_id,
      captureType: row.capture_type,
      content: row.content,
      originalText: row.original_text,
      translatedText: row.translated_text,
      translationLanguage: row.translation_language,
      aiGenerated: row.ai_generated,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  ];
}

/** 특정 자료에 달린 기록. 오래된 것부터 보여준다. 읽은 순서를 따라가기 쉽다. */
export async function listCapturesForSource(
  sourceId: string,
): Promise<Capture[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("captures")
    .select(CAPTURE_COLUMNS)
    .eq("source_id", sourceId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[ThreadMark] 기록 조회 실패:", error.message);

    return [];
  }

  return (data ?? []).flatMap(toCapture);
}

/**
 * 자료에 붙지 않은 기록. Inbox 화면이 쓴다.
 *
 * 자료 없이 남긴 기록은 여기 말고는 볼 곳이 없다.
 * 최신순으로 보여줘 방금 적은 것이 먼저 보이게 한다.
 */
export async function listInboxCaptures(): Promise<Capture[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("captures")
    .select(CAPTURE_COLUMNS)
    .is("source_id", null)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[ThreadMark] Inbox 조회 실패:", error.message);

    return [];
  }

  return (data ?? []).flatMap(toCapture);
}

/** 기록 하나. 없거나 내 것이 아니면 null을 돌려준다. */
export async function getCaptureById(id: string): Promise<Capture | null> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("captures")
    .select(CAPTURE_COLUMNS)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    console.error("[ThreadMark] 기록 조회 실패:", error.message);

    return null;
  }

  return data ? (toCapture(data)[0] ?? null) : null;
}

/** 자료에 붙지 않은 기록 수. 화면 안내에 쓴다. */
export async function countInboxCaptures(): Promise<number> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { count, error } = await supabase
    .from("captures")
    .select("id", { count: "exact", head: true })
    .is("source_id", null)
    .is("deleted_at", null);

  if (error) {
    console.error("[ThreadMark] Inbox 수 조회 실패:", error.message);

    return 0;
  }

  return count ?? 0;
}
