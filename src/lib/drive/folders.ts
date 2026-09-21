/**
 * ThreadMark 폴더 구성.
 *
 * 설계 문서 10.1절에 따라 사용자의 My Drive에 ThreadMark 폴더와 하위 폴더를 만든다.
 *
 * 물리적 폴더 구조를 Source·Project 관계와 같게 만들지 않는다.
 * 한 자료가 여러 프로젝트에 속할 수 있기 때문이다.
 * Drive는 파일을 두는 곳이고, 분류는 ThreadMark 데이터베이스가 맡는다.
 */

const DRIVE_FILES_ENDPOINT = "https://www.googleapis.com/drive/v3/files";
const FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

export const ROOT_FOLDER_NAME = "ThreadMark";

/** 설계 문서 10.1절의 권장 폴더. */
export const CHILD_FOLDER_NAMES = [
  "Papers",
  "PDFs",
  "Images",
  "Drawings",
  "Audio",
] as const;

/**
 * 이름으로 폴더를 찾는다.
 *
 * drive.file 권한은 이 앱이 만들었거나 사용자가 고른 파일만 볼 수 있다.
 * 그래서 여기서 찾아지는 것은 우리가 전에 만든 폴더뿐이다.
 * 사용자의 다른 폴더를 뒤지는 것이 아니다.
 */
async function findFolder(options: {
  accessToken: string;
  name: string;
  parentId?: string;
}): Promise<string | null> {
  const conditions = [
    `name = '${options.name.replace(/'/g, "\\'")}'`,
    `mimeType = '${FOLDER_MIME_TYPE}'`,
    "trashed = false",
  ];

  if (options.parentId) {
    conditions.push(`'${options.parentId}' in parents`);
  }

  const params = new URLSearchParams({
    q: conditions.join(" and "),
    fields: "files(id,name)",
    pageSize: "10",
  });

  const response = await fetch(`${DRIVE_FILES_ENDPOINT}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${options.accessToken}` },
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json().catch(() => null)) as {
    files?: { id?: string }[];
  } | null;

  const first = body?.files?.[0];

  return typeof first?.id === "string" ? first.id : null;
}

async function createFolder(options: {
  accessToken: string;
  name: string;
  parentId?: string;
}): Promise<string | null> {
  const response = await fetch(`${DRIVE_FILES_ENDPOINT}?fields=id`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: options.name,
      mimeType: FOLDER_MIME_TYPE,
      ...(options.parentId ? { parents: [options.parentId] } : {}),
    }),
  });

  if (!response.ok) {
    return null;
  }

  const body = (await response.json().catch(() => null)) as {
    id?: string;
  } | null;

  return typeof body?.id === "string" ? body.id : null;
}

/** 있으면 쓰고 없으면 만든다. 다시 연결해도 폴더가 늘어나지 않게 한다. */
async function ensureFolder(options: {
  accessToken: string;
  name: string;
  parentId?: string;
}): Promise<string | null> {
  const existing = await findFolder(options);

  return existing ?? (await createFolder(options));
}

export type DriveFolderSetup = {
  rootFolderId: string;
  folderIds: Record<string, string>;
};

/**
 * ThreadMark 폴더와 하위 폴더를 준비한다.
 *
 * 하위 폴더 하나가 실패해도 전체를 되돌리지 않는다.
 * 나머지는 쓸 수 있고, 다음 연결 때 없는 것만 다시 만든다.
 * 루트 폴더를 못 만들면 그때는 아무것도 할 수 없으므로 null을 돌려준다.
 */
export async function ensureThreadMarkFolders(
  accessToken: string,
): Promise<DriveFolderSetup | null> {
  const rootFolderId = await ensureFolder({
    accessToken,
    name: ROOT_FOLDER_NAME,
  });

  if (!rootFolderId) {
    return null;
  }

  const folderIds: Record<string, string> = {};

  for (const name of CHILD_FOLDER_NAMES) {
    const id = await ensureFolder({ accessToken, name, parentId: rootFolderId });

    if (id) {
      folderIds[name] = id;
    }
  }

  return { rootFolderId, folderIds };
}
