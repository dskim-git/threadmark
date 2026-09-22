/**
 * Google Picker 창을 띄운다.
 *
 * 이 파일은 브라우저에서만 돈다. 서버에서 부르지 않는다.
 *
 * Picker는 Google이 만든 화면이 브라우저 안에서 직접 Drive에 묻는 방식이다.
 * 그래서 서버가 대신해 줄 수 없고, 짧게 사는 access token을 여기로 가져와야 한다.
 * 그 토큰은 인자로 받아 Picker에 넘기고 끝이다. 어디에도 저장하지 않는다.
 * (설계 문서 10.2절, 10.5절)
 *
 * 타입 정의를 따로 설치하지 않는다. 쓰는 것이 몇 개 되지 않아서, 필요한 만큼만
 * 여기에 적어둔다. 의존성을 하나 늘리는 것보다 이쪽이 낫다고 보았다.
 */

const PICKER_SCRIPT_SRC = "https://apis.google.com/js/api.js";

type PickerDocument = {
  id?: unknown;
  name?: unknown;
  sizeBytes?: unknown;
};

type PickerResponse = {
  action?: unknown;
  docs?: PickerDocument[];
};

type PickerView = {
  setMimeTypes: (value: string) => PickerView;
  setOwnedByMe: (value: boolean) => PickerView;
  setIncludeFolders: (value: boolean) => PickerView;
  setSelectFolderEnabled: (value: boolean) => PickerView;
};

type PickerBuilder = {
  setAppId: (value: string) => PickerBuilder;
  setOAuthToken: (value: string) => PickerBuilder;
  setDeveloperKey: (value: string) => PickerBuilder;
  setTitle: (value: string) => PickerBuilder;
  addView: (view: PickerView) => PickerBuilder;
  setCallback: (callback: (response: PickerResponse) => void) => PickerBuilder;
  build: () => { setVisible: (value: boolean) => void };
};

type GooglePicker = {
  DocsView: new (viewId?: unknown) => PickerView;
  ViewId: { DOCS: unknown };
  PickerBuilder: new () => PickerBuilder;
  Action: { PICKED: string; CANCEL: string };
};

type GapiWindow = Window & {
  gapi?: {
    load: (name: string, callback: () => void) => void;
  };
  google?: {
    picker?: GooglePicker;
  };
};

/**
 * Google의 스크립트를 한 번만 불러온다.
 *
 * 두 번 부르면 같은 스크립트가 두 개 붙는다. 같은 약속을 돌려주어
 * 버튼을 여러 번 눌러도 한 번만 불러오게 한다.
 */
let pickerReady: Promise<GooglePicker> | null = null;

function loadPicker(): Promise<GooglePicker> {
  if (pickerReady) {
    return pickerReady;
  }

  pickerReady = new Promise<GooglePicker>((resolve, reject) => {
    const target = window as GapiWindow;

    const whenGapiReady = () => {
      if (!target.gapi) {
        reject(new Error("gapi를 불러오지 못했습니다."));

        return;
      }

      target.gapi.load("picker", () => {
        const picker = (window as GapiWindow).google?.picker;

        if (picker) {
          resolve(picker);
        } else {
          reject(new Error("picker를 불러오지 못했습니다."));
        }
      });
    };

    if (target.gapi) {
      whenGapiReady();

      return;
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${PICKER_SCRIPT_SRC}"]`,
    );

    if (existing) {
      existing.addEventListener("load", whenGapiReady, { once: true });
      existing.addEventListener(
        "error",
        () => reject(new Error("스크립트를 불러오지 못했습니다.")),
        { once: true },
      );

      return;
    }

    const script = document.createElement("script");

    script.src = PICKER_SCRIPT_SRC;
    script.async = true;
    script.onload = whenGapiReady;
    script.onerror = () => reject(new Error("스크립트를 불러오지 못했습니다."));

    document.head.appendChild(script);
  }).catch((error: unknown) => {
    // 실패한 약속을 남겨두면 다시 시도할 수 없다.
    pickerReady = null;

    throw error;
  });

  return pickerReady;
}

/**
 * 사용자가 고른 결과. 취소하면 null이다.
 *
 * `driveFileId`만 서버로 보낸다. 서버는 그 식별자로 Drive에 직접 물어서
 * 이름·크기·종류를 받아 적는다.
 *
 * `displayName`과 `displaySize`는 **화면에 보여주기 위한 것뿐**이다.
 * 브라우저를 거쳐 온 값이라 그대로 저장하지 않는다. 고르자마자 "무엇을 골랐는지"
 * 보여주려면 필요한데, 그것 때문에 서버에 한 번 더 물으면 기다림만 늘어난다.
 * 등록 화면에서 제목을 제안하는 데에도 쓴다. 제목은 어차피 사용자가 고칠 수 있고
 * 서버가 다시 검사한다.
 */
export type PickedFile = {
  driveFileId: string;
  displayName: string | null;
  displaySize: number | null;
};

/**
 * Picker를 열고 사용자가 고를 때까지 기다린다.
 *
 * 한 번에 하나만 고르게 한다. 여러 개를 한꺼번에 붙이면 중간에 하나가
 * 실패했을 때 무엇이 되고 무엇이 안 됐는지 알리기 어렵다.
 */
export async function openDrivePicker(options: {
  accessToken: string;
  apiKey: string;
  appId: string;
  mimeTypes: string;
}): Promise<PickedFile | null> {
  const picker = await loadPicker();

  return new Promise<PickedFile | null>((resolve) => {
    const view = new picker.DocsView(picker.ViewId.DOCS)
      .setMimeTypes(options.mimeTypes)
      // 내 Drive에 있는 것만 보여준다. 공유받은 파일은 권한이 바뀌면
      // 접근이 끊겨서, 붙여두고도 열지 못하는 항목이 남는다.
      .setOwnedByMe(true)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);

    const built = new picker.PickerBuilder()
      .setAppId(options.appId)
      .setOAuthToken(options.accessToken)
      .setDeveloperKey(options.apiKey)
      .setTitle("ThreadMark에 붙일 파일 고르기")
      .addView(view)
      .setCallback((response) => {
        if (response.action === picker.Action.CANCEL) {
          resolve(null);

          return;
        }

        if (response.action !== picker.Action.PICKED) {
          // 창이 열렸다는 알림 등은 무시한다. 아직 고르지 않았다.
          return;
        }

        const doc = response.docs?.[0];
        const id = doc?.id;

        if (typeof id !== "string" || id.length === 0) {
          resolve(null);

          return;
        }

        resolve({
          driveFileId: id,
          displayName: typeof doc?.name === "string" ? doc.name : null,
          displaySize:
            typeof doc?.sizeBytes === "number"
              ? doc.sizeBytes
              : typeof doc?.sizeBytes === "string" && /^\d+$/.test(doc.sizeBytes)
                ? Number.parseInt(doc.sizeBytes, 10)
                : null,
        });
      })
      .build();

    built.setVisible(true);
  });
}
