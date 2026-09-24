import { requireActiveAccount } from "@/lib/auth/account";
import { isCaptureType, type CaptureType } from "@/lib/captures/types";
import { isSourceType, type SourceType } from "@/lib/sources/types";
import { createClient } from "@/lib/supabase/server";

/**
 * 자리에 놓인 재료 조회. (설계 문서 7.4절)
 *
 * **한 번에 통째로 가져온다.** 자리마다 질의를 보내면 자리 수만큼 왕복이
 * 늘고, 뼈대의 깊이와 크기에 한계가 없어서 그 끝을 우리가 모른다.
 * 자리별로 나누는 일은 화면이 한다.
 */

export type PlacedItem = {
  id: string;
  nodeId: string;
  /** 이 재료로 여기서 할 말. 재료를 옮겨 담는 것과 요리를 가르는 값이다. */
  note: string | null;
  position: number;
} & (
  | {
      kind: "source";
      sourceId: string;
      sourceType: SourceType;
      title: string;
    }
  | {
      kind: "capture";
      captureId: string;
      captureType: CaptureType;
      /** 기록의 본문. 목록에서는 화면이 줄여 보여준다. */
      content: string | null;
      originalText: string | null;
      /** 이 기록이 달린 자료. 어디서 나온 말인지 알아야 쓸 수 있다. */
      sourceId: string | null;
      sourceTitle: string | null;
    }
);

/**
 * 프로젝트의 모든 자리에 놓인 재료.
 *
 * 삭제 표시된 자료와 기록은 **놓인 기록이 남아 있어도 보여주지 않는다.**
 * 지운 것이 프로젝트 화면에 되살아나 보이면 지운 것이 아니게 된다.
 * 연결된 자료 목록이 이미 같은 방식이다.
 */
export async function listPlacements(
  projectId: string,
): Promise<readonly PlacedItem[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  /*
    자리를 거쳐 프로젝트를 좁힌다.

    `project_node_items`에는 프로젝트 id가 없다. 자리가 이미 프로젝트에
    매여 있어서 두 곳에 같은 값을 두지 않으려는 것이다. 대신 이어진 표를
    타고 걸러야 한다.
  */
  const { data, error } = await supabase
    .from("project_node_items")
    /*
      고르는 칸 목록을 이어 붙이지 않는다. 한 덩어리로 적는다.

      Supabase 타입은 이 글자를 **그대로 읽어** 돌아올 모양을 정한다.
      `+`로 이으면 그냥 `string`이 되고 돌아온 값의 타입이 통째로 무너진다.
      15-E-2a에서 변수로 뺐다가 같은 일을 겪었다. (AGENTS.md 6절)
    */
    .select(
      "id, node_id, note, position, project_outline_nodes!inner (project_id), sources (id, type, title, deleted_at), captures (id, capture_type, content, original_text, source_id, deleted_at, sources (title, deleted_at))",
    )
    .eq("project_outline_nodes.project_id", projectId)
    .order("position", { ascending: true });

  if (error) {
    console.error("[ThreadMark] 놓인 재료 조회 실패:", error.message);

    return [];
  }

  return (data ?? []).flatMap((row): PlacedItem[] => {
    const base = {
      id: row.id,
      nodeId: row.node_id,
      note: row.note,
      position: row.position,
    };

    const source = row.sources;

    if (source) {
      if (source.deleted_at !== null || !isSourceType(source.type)) {
        return [];
      }

      return [
        {
          ...base,
          kind: "source",
          sourceId: source.id,
          sourceType: source.type,
          title: source.title,
        },
      ];
    }

    const capture = row.captures;

    if (capture) {
      if (
        capture.deleted_at !== null ||
        !isCaptureType(capture.capture_type)
      ) {
        return [];
      }

      return [
        {
          ...base,
          kind: "capture",
          captureId: capture.id,
          captureType: capture.capture_type,
          content: capture.content,
          originalText: capture.original_text,
          sourceId: capture.source_id,
          /*
            지운 자료의 이름은 보여주지 않는다. 지운 것이 이름으로
            되살아나면 지운 것이 아니게 된다.
          */
          sourceTitle:
            capture.sources && capture.sources.deleted_at === null
              ? capture.sources.title
              : null,
        },
      ];
    }

    /*
      둘 다 비었다. 제약조건이 막고 있어 생기지 않지만, 생겼다면 무엇을
      놓았는지 알 수 없는 줄이므로 그리지 않는다. (보안 원칙 7과 같은 생각)
    */
    return [];
  });
}

/**
 * 이 자료가 어느 프로젝트의 어느 자리에 놓여 있는가. (설계 문서 7.5절)
 *
 * 재료 쪽에서 거꾸로 보는 길이다. 같은 재료가 여러 요리에 들어가므로,
 * "이건 어디에 쓰였나"가 자료 화면에서 답할 만한 물음이 된다.
 */
export type PlacementOfSource = {
  projectId: string;
  projectName: string;
  nodeId: string;
  nodeTitle: string;
};

export async function listPlacementsOfSource(
  sourceId: string,
): Promise<readonly PlacementOfSource[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_node_items")
    .select(
      "node_id, project_outline_nodes!inner (id, title, projects!inner (id, name, deleted_at))",
    )
    .eq("source_id", sourceId);

  if (error) {
    console.error("[ThreadMark] 놓인 자리 조회 실패:", error.message);

    return [];
  }

  return (data ?? []).flatMap((row): PlacementOfSource[] => {
    const node = row.project_outline_nodes;
    const project = node?.projects;

    // 지운 프로젝트의 자리는 보여주지 않는다.
    if (!node || !project || project.deleted_at !== null) {
      return [];
    }

    return [
      {
        projectId: project.id,
        projectName: project.name,
        nodeId: node.id,
        nodeTitle: node.title,
      },
    ];
  });
}

/**
 * 자리에 놓을 수 있는 재료 목록. (19-B)
 *
 * **내 자료와 기록 전부다.** 프로젝트에 이미 이어둔 것으로 좁히지 않는다.
 * "먼저 프로젝트에 잇고 그다음 자리에 놓기"는 두 걸음인데, 실제로는
 * "이걸 여기 쓰자"가 한 번에 떠오른다. 놓으면 프로젝트에도 함께 이어진다.
 *
 * 최근에 담은 것부터 준다. 자리에 놓으려고 찾는 것은 대개 방금 담은 것이다.
 */
export type PlacementChoiceRow = {
  value: string;
  label: string;
  group: string;
};

export async function listPlacementChoices(): Promise<
  readonly PlacementChoiceRow[]
> {
  await requireActiveAccount();

  const supabase = await createClient();

  const [sources, captures] = await Promise.all([
    supabase
      .from("sources")
      .select("id, type, title")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("captures")
      .select("id, capture_type, content, original_text")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (sources.error) {
    console.error("[ThreadMark] 놓을 자료 목록 조회 실패:", sources.error.message);
  }

  if (captures.error) {
    console.error("[ThreadMark] 놓을 기록 목록 조회 실패:", captures.error.message);
  }

  const choices: PlacementChoiceRow[] = [];

  for (const row of sources.data ?? []) {
    choices.push({
      value: `source:${row.id}`,
      label: row.title,
      group: "자료",
    });
  }

  for (const row of captures.data ?? []) {
    /*
      기록에는 제목이 없다. 원문이 있으면 원문을, 없으면 내 메모를 줄여
      보여준다. 원문을 앞에 두는 이유는, 인용을 고를 때 떠오르는 것이
      내가 쓴 메모가 아니라 **그 문장**이기 때문이다.
    */
    const text = (row.original_text ?? row.content ?? "").trim();

    choices.push({
      value: `capture:${row.id}`,
      label: text.length > 0 ? text.slice(0, 80) : "내용 없는 기록",
      group: "기록",
    });
  }

  return choices;
}

/**
 * 재료를 고를 때 보여줄 나무. (19-B, 사용자 요청으로 고침)
 *
 * **글자 목록에서 고르게 하지 않는다.** 드롭다운에 제목만 늘어놓으면
 * 무엇인지 모르는 채로 고르게 된다. 자료를 먼저 고르고, 그 자료에 적어둔
 * 기록을 그 안에서 고른다. 파일 고르는 창과 같은 모양이다.
 *
 * 자료에 매이지 않은 기록은 따로 한 묶음으로 둔다. 빠른 기록으로 남긴
 * 것들이며 어느 자료에도 속하지 않는다.
 */
export type PickerCapture = {
  id: string;
  captureType: CaptureType;
  /**
   * 찾을 때 훑는 글. 원문이 있으면 원문, 없으면 내 메모다.
   *
   * **화면에 무엇을 위에 놓을지는 여기서 정하지 않는다.** 고르는 창은
   * 내 메모를 위에 두고 인용을 아래에 줄여 둔다. 어느 화면이냐에 따라
   * 달라지는 판단이라 그리는 쪽이 한다.
   */
  text: string;
  /** 원문과 내 메모를 함께 들여다볼 수 있게 둘 다 준다. */
  originalText: string | null;
  content: string | null;
};

export type PickerSource = {
  id: string;
  type: SourceType;
  title: string;
  thumbnailUrl: string | null;
  captures: PickerCapture[];
};

export type PickerTree = {
  sources: PickerSource[];
  /** 자료에 매이지 않은 기록. */
  loose: PickerCapture[];
};

export async function listPickerTree(): Promise<PickerTree> {
  await requireActiveAccount();

  const supabase = await createClient();

  const [sources, captures] = await Promise.all([
    supabase
      .from("sources")
      .select("id, type, title, thumbnail_url")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("captures")
      .select("id, capture_type, content, original_text, source_id")
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (sources.error) {
    console.error("[ThreadMark] 고를 자료 조회 실패:", sources.error.message);
  }

  if (captures.error) {
    console.error("[ThreadMark] 고를 기록 조회 실패:", captures.error.message);
  }

  const byId = new Map<string, PickerSource>();
  const tree: PickerTree = { sources: [], loose: [] };

  for (const row of sources.data ?? []) {
    if (!isSourceType(row.type)) {
      continue;
    }

    const entry: PickerSource = {
      id: row.id,
      type: row.type,
      title: row.title,
      thumbnailUrl: row.thumbnail_url,
      captures: [],
    };

    byId.set(row.id, entry);
    tree.sources.push(entry);
  }

  for (const row of captures.data ?? []) {
    if (!isCaptureType(row.capture_type)) {
      continue;
    }

    /*
      원문을 앞에 둔다. 인용을 고를 때 떠오르는 것은 내가 쓴 메모가 아니라
      **그 문장**이다. 원문이 없는 기록(생각·질문)은 내 메모가 곧 본문이다.
    */
    const text = (row.original_text ?? row.content ?? "").trim();

    const capture: PickerCapture = {
      id: row.id,
      captureType: row.capture_type,
      text: text.length > 0 ? text : "내용 없는 기록",
      originalText: row.original_text,
      content: row.content,
    };

    const parent = row.source_id ? byId.get(row.source_id) : undefined;

    if (parent) {
      parent.captures.push(capture);
    } else {
      tree.loose.push(capture);
    }
  }

  return tree;
}

/**
 * 이 기록이 어느 프로젝트의 어느 자리에 놓여 있는가. (사용자 요청)
 *
 * 자료 쪽의 `listPlacementsOfSource`와 같은 일을 기록에 한다. 기록은 자료와
 * 달리 제목이 없어 목록에서 스쳐 지나가기 쉬운데, **그래서 더 필요하다.**
 * "이 메모 어디에 썼더라"를 물을 데가 없으면 같은 것을 두 번 적게 된다.
 */
export async function listPlacementsOfCapture(
  captureId: string,
): Promise<readonly PlacementOfSource[]> {
  await requireActiveAccount();

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("project_node_items")
    .select(
      "node_id, project_outline_nodes!inner (id, title, projects!inner (id, name, deleted_at))",
    )
    .eq("capture_id", captureId);

  if (error) {
    console.error("[ThreadMark] 기록이 놓인 자리 조회 실패:", error.message);

    return [];
  }

  return (data ?? []).flatMap((row): PlacementOfSource[] => {
    const node = row.project_outline_nodes;
    const project = node?.projects;

    if (!node || !project || project.deleted_at !== null) {
      return [];
    }

    return [
      {
        projectId: project.id,
        projectName: project.name,
        nodeId: node.id,
        nodeTitle: node.title,
      },
    ];
  });
}
