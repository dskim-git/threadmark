/**
 * 화면 취향. 색 갈래와 글꼴 갈래. (설계 문서 4.2절 "사용자별 기능 설정")
 *
 * 값 목록이 세 곳에 있다. 이 파일, 마이그레이션의 check 제약, 그리고
 * `globals.css`의 `[data-palette]`·`[data-fonts]` 규칙이다.
 * 어긋나면 고를 수는 있는데 저장이 거부되거나, 저장은 되는데 화면이 안 바뀐다.
 * `tests/appearance-theme.test.mjs`가 셋을 맞대어 본다.
 *
 * 모르는 값은 기본값으로 본다. 화면 취향은 접근 통제가 아니라 보기에 관한
 * 것이라, 값 하나 때문에 화면을 못 여는 일이 있어서는 안 된다.
 *
 * 데이터베이스 의존성이 없는 순수 모듈이라 단위 테스트로 검증한다.
 */

export type ThemeMode = "system" | "light" | "dark";
export type ThemePalette = "hanji" | "graphite" | "moss";
export type ThemeFonts = "myeongjo" | "single" | "gowun";

/**
 * 밝기.
 *
 * 색 갈래 셋은 모두 밝은 화면으로 만든 것이다. 컴퓨터가 어두운 모드면
 * 골라둔 색을 볼 일이 없으므로, 앱에서 따로 정할 수 있어야 한다.
 *
 * 기본은 `컴퓨터 설정을 따름`이다. 아무것도 고르지 않은 사람의 화면이
 * 어느 날 갑자기 바뀌면 고장으로 읽는다.
 */
export const THEME_MODES: readonly {
  value: ThemeMode;
  label: string;
  description: string;
}[] = [
  {
    value: "system",
    label: "컴퓨터 설정을 따름",
    description: "컴퓨터가 어두운 모드면 어둡게, 밝은 모드면 밝게 보입니다.",
  },
  {
    value: "light",
    label: "밝게",
    description: "컴퓨터 설정과 상관없이 밝은 화면으로 봅니다.",
  },
  {
    value: "dark",
    label: "어둡게",
    description: "컴퓨터 설정과 상관없이 어두운 화면으로 봅니다.",
  },
];

export const DEFAULT_MODE: ThemeMode = "system";

export function isThemeMode(value: unknown): value is ThemeMode {
  return THEME_MODES.some((mode) => mode.value === value);
}

export function readThemeMode(value: unknown): ThemeMode {
  return isThemeMode(value) ? value : DEFAULT_MODE;
}

export function getModeLabel(value: ThemeMode): string {
  return THEME_MODES.find((mode) => mode.value === value)?.label ?? value;
}

export const THEME_PALETTES: readonly {
  value: ThemePalette;
  label: string;
  description: string;
  /** 고르는 화면에 보여줄 색 세 개. 바탕, 글, 강조 순이다. */
  swatch: readonly [string, string, string];
}[] = [
  {
    value: "hanji",
    label: "쪽빛과 한지",
    description: "미색 종이에 쪽빛으로 표시가 남습니다. 따뜻한 바탕에 차가운 점 하나.",
    swatch: ["#f2efe8", "#1d1c19", "#2e4a6b"],
  },
  {
    value: "graphite",
    label: "흑연",
    description: "색을 거의 쓰지 않습니다. 글과 선만 남아 오래 봐도 덜 피로합니다.",
    swatch: ["#f4f5f6", "#16181a", "#3d5a66"],
  },
  {
    value: "moss",
    label: "이끼 서가",
    description: "바탕에 옅은 초록이 섞입니다. 종이보다 오래된 도서관 쪽입니다.",
    swatch: ["#eef0ea", "#1e231d", "#4a6b4f"],
  },
];

export const THEME_FONT_SETS: readonly {
  value: ThemeFonts;
  label: string;
  description: string;
}[] = [
  {
    value: "myeongjo",
    label: "명조와 고딕",
    description: "제목은 Noto Serif KR, 본문은 Noto Sans KR. 또렷하고 단단합니다.",
  },
  {
    value: "single",
    label: "한 글꼴",
    description: "제목과 본문 모두 IBM Plex Sans KR. 굵기만 달라져 가장 조용합니다.",
  },
  {
    value: "gowun",
    label: "고운바탕과 고딕",
    description: "제목은 고운바탕, 본문은 Gothic A1. 부드럽게 눌러 앉습니다.",
  },
];

export const DEFAULT_PALETTE: ThemePalette = "hanji";
export const DEFAULT_FONTS: ThemeFonts = "myeongjo";

export function isThemePalette(value: unknown): value is ThemePalette {
  return THEME_PALETTES.some((palette) => palette.value === value);
}

export function isThemeFonts(value: unknown): value is ThemeFonts {
  return THEME_FONT_SETS.some((fonts) => fonts.value === value);
}

export function readThemePalette(value: unknown): ThemePalette {
  return isThemePalette(value) ? value : DEFAULT_PALETTE;
}

export function readThemeFonts(value: unknown): ThemeFonts {
  return isThemeFonts(value) ? value : DEFAULT_FONTS;
}

export function getPaletteLabel(value: ThemePalette): string {
  return (
    THEME_PALETTES.find((palette) => palette.value === value)?.label ?? value
  );
}

export function getFontsLabel(value: ThemeFonts): string {
  return THEME_FONT_SETS.find((fonts) => fonts.value === value)?.label ?? value;
}

/** 화면에 걸어줄 값들. 레이아웃이 `<html>`에 붙인다. */
export type Appearance = {
  mode: ThemeMode;
  palette: ThemePalette;
  fonts: ThemeFonts;
};

export const DEFAULT_APPEARANCE: Appearance = {
  mode: DEFAULT_MODE,
  palette: DEFAULT_PALETTE,
  fonts: DEFAULT_FONTS,
};
