/**
 * 번역 기능의 말과 모양. (설계 문서 9.4절)
 *
 * 9.4절은 "번역 API는 교체할 수 있도록 provider interface로 추상화한다"고 한다.
 * 그래서 이 파일에는 **어느 회사도 등장하지 않는다.** Anthropic을 쓰든
 * 나중에 DeepL을 붙이든, 바깥에서 보이는 모양은 여기에 적힌 것 하나다.
 *
 * 네트워크 호출과 환경변수 읽기는 여기에 두지 않는다. 단위 테스트로 검증한다.
 */

/**
 * 옮길 수 있는 언어.
 *
 * 9.4절은 "기본 대상 언어는 사용자 설정에서 정한다"고 하는데, 사용자별 설정을
 * 담을 자리가 아직 없다. 설정이 생기기 전까지는 기본값을 한국어로 두고
 * 고를 수 있게만 한다. 설정이 생기면 기본값만 그쪽에서 읽어오면 된다.
 *
 * 값은 데이터베이스의 translation_language 칸에 그대로 들어간다.
 */
export const TRANSLATION_LANGUAGES = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
  { code: "ja", label: "日本語" },
  { code: "zh", label: "中文" },
] as const;

export type TranslationLanguageCode =
  (typeof TRANSLATION_LANGUAGES)[number]["code"];

export const DEFAULT_TRANSLATION_LANGUAGE: TranslationLanguageCode = "ko";

export function isTranslationLanguage(
  value: unknown,
): value is TranslationLanguageCode {
  return (
    typeof value === "string" &&
    TRANSLATION_LANGUAGES.some((language) => language.code === value)
  );
}

export function getTranslationLanguageLabel(
  code: TranslationLanguageCode,
): string {
  return (
    TRANSLATION_LANGUAGES.find((language) => language.code === code)?.label ??
    code
  );
}

/**
 * 한 번에 보낼 수 있는 글의 길이.
 *
 * 9.4절의 첫 번째 원칙이 "논문 전체를 자동 전송하지 않는다"이다.
 * 고른 문장 하나를 옮기는 기능이므로 문단 하나 남짓이면 충분하다.
 * 기록에 저장할 수 있는 길이(20000자)와 일부러 다르게 둔다. 저장은 사람이
 * 쓴 글도 받지만, 밖으로 나가는 글은 그보다 훨씬 좁아야 한다.
 *
 * 이것이 13-C의 비용 방어 가운데 첫 번째다. 요청 한 건의 크기를 못 넘게 한다.
 */
export const MAX_TRANSLATION_INPUT_LENGTH = 4000;

/** 번역을 맡길 때 넘기는 것. */
export type TranslationRequest = {
  text: string;
  targetLanguage: TranslationLanguageCode;
};

/**
 * 번역이 된 결과.
 *
 * 9.4절이 기록하라고 한 네 가지가 모두 여기 있다.
 * 공급자, 모델, 언어, 생성 시각. 화면은 이 값을 그대로 기록에 저장한다.
 */
export type TranslationOutcome = {
  translatedText: string;
  /** 어디에 맡겼는지. 예: "anthropic" */
  provider: string;
  /** 무엇이 만들었는지. 예: "claude-sonnet-5" */
  model: string;
  targetLanguage: TranslationLanguageCode;
  /** ISO 8601 문자열. 데이터베이스의 translated_at에 들어간다. */
  translatedAt: string;
};

/**
 * 왜 안 됐는지.
 *
 * 화면에 무엇을 보여줄지가 이유마다 다르다. 문구를 그대로 넘기면
 * 화면이 "이건 다시 해볼 만한가"를 판단할 수 없다.
 *
 *   not_configured  번역 기능이 켜져 있지 않다. 사용자가 할 수 있는 일이 없다.
 *   too_long        고른 글이 길다. 짧게 다시 고르면 된다.
 *   rate_limited    너무 자주 눌렀다. 잠시 뒤 다시 하면 된다.
 *   refused         번역기가 이 글을 다루기를 거부했다.
 *   failed          그 밖의 실패. 잠시 뒤 다시.
 */
export type TranslationFailureReason =
  | "not_configured"
  | "too_long"
  | "rate_limited"
  | "refused"
  | "failed";

export type TranslationResult =
  | ({ ok: true } & TranslationOutcome)
  | { ok: false; reason: TranslationFailureReason; message: string };

/**
 * 번역기를 바꿔 끼우는 자리. (9.4절)
 *
 * 이 모양만 지키면 무엇을 붙여도 화면과 서버 액션은 손대지 않아도 된다.
 */
export type TranslationProvider = {
  /** 데이터베이스의 translation_provider에 들어갈 이름. */
  readonly name: string;
  readonly model: string;
  translate(request: TranslationRequest): Promise<TranslationResult>;
};
