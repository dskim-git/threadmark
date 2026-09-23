/**
 * 화면 취향 단위 검사. (설계 문서 4.2절)
 *
 * 값 목록이 **세 곳**에 있다.
 *
 *   src/lib/appearance/theme.ts   화면이 보여주고 서버가 받아들이는 목록
 *   supabase/migrations/…         저장을 허용하는 check 제약
 *   src/app/globals.css           실제로 색과 글꼴을 바꾸는 규칙
 *
 * 어긋나는 방향마다 증상이 다르고, 셋 다 원인을 찾기 어렵다.
 *
 *   목록에만 있으면      고를 수는 있는데 저장이 거부된다
 *   제약에만 있으면      아무도 고를 수 없는 값이 남는다
 *   CSS가 빠지면        저장은 되는데 화면이 그대로다
 *
 * 마지막이 가장 나쁘다. 사용자는 저장했다는 말을 보고 화면을 보는데
 * 아무것도 달라지지 않는다. 고장인지 원래 그런 것인지 알 수 없다.
 *
 * 실행: npm test
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_APPEARANCE,
  DEFAULT_FONTS,
  DEFAULT_MODE,
  DEFAULT_PALETTE,
  THEME_MODES,
  THEME_FONT_SETS,
  THEME_PALETTES,
  getFontsLabel,
  getPaletteLabel,
  getModeLabel,
  isThemeFonts,
  isThemeMode,
  isThemePalette,
  readThemeFonts,
  readThemeMode,
  readThemePalette,
} from "../src/lib/appearance/theme.ts";

const repoRoot = path.resolve(import.meta.dirname, "..");
const migrationsDir = path.join(repoRoot, "supabase", "migrations");

const migrations = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
  .join("\n");

const css = readFileSync(
  path.join(repoRoot, "src", "app", "globals.css"),
  "utf8",
);

const flatSql = migrations.replace(/\s+/g, " ").toLowerCase();

// -----------------------------------------------------------------------------
// 세 곳이 어긋나지 않는다
// -----------------------------------------------------------------------------

test("색 갈래가 데이터베이스 제약과 같다", () => {
  const values = THEME_PALETTES.map((palette) => `'${palette.value}'`).join(
    ", ",
  );

  assert.ok(
    flatSql.includes(`check (theme_palette in (${values}))`),
    "고를 수 있는 색 갈래와 저장을 허용하는 목록이 다르다",
  );
});

test("글꼴 갈래가 데이터베이스 제약과 같다", () => {
  const values = THEME_FONT_SETS.map((fonts) => `'${fonts.value}'`).join(", ");

  assert.ok(
    flatSql.includes(`check (theme_fonts in (${values}))`),
    "고를 수 있는 글꼴 갈래와 저장을 허용하는 목록이 다르다",
  );
});

test("밝기가 데이터베이스 제약과 같다", () => {
  const values = THEME_MODES.map((mode) => `'${mode.value}'`).join(", ");

  assert.ok(
    flatSql.includes(`check (theme_mode in (${values}))`),
    "고를 수 있는 밝기와 저장을 허용하는 목록이 다르다",
  );
});

test("밝기 셋이 모두 화면에서 다뤄진다", () => {
  /*
    Tailwind의 `dark:`는 원래 컴퓨터 설정만 본다. 그 규칙을 다시 정하지
    않으면 `밝게`를 골라도 컴퓨터가 어두운 모드일 때 어두운 쪽이 걸린다.
    고르는 칸은 있는데 아무 일도 일어나지 않는 상태가 된다.
  */
  assert.ok(
    css.includes("@custom-variant dark"),
    "dark 규칙을 다시 정하지 않았다. 밝기를 골라도 적용되지 않는다",
  );
  assert.ok(
    css.includes('[data-mode="dark"]'),
    "언제나 어둡게를 다루지 않는다",
  );
  assert.ok(
    css.includes(':not([data-mode="light"])'),
    "언제나 밝게가 컴퓨터의 어두운 모드를 이기지 못한다",
  );
});

test("브라우저가 그리는 것들의 밝기도 함께 바꾼다", () => {
  /*
    빼먹으면 바탕만 어두워지고 스크롤 막대와 라디오 단추는 밝은 채로 남는다.
  */
  assert.ok(css.includes("color-scheme"), "color-scheme을 정하지 않았다");
});

test("어두울 때 카드가 바탕보다 밝다", () => {
  /*
    2026-09-24에 반대로 만들어 놓았다. 카드가 바탕보다 어두우면 떠 있는
    것이 아니라 파인 것처럼 보인다.

    어두운 화면에서 바탕은 `--color-black`, 카드는 `--color-zinc-950`이다.
  */
  const brightness = (hex) =>
    parseInt(hex.slice(1, 3), 16) +
    parseInt(hex.slice(3, 5), 16) +
    parseInt(hex.slice(5, 7), 16);

  for (const palette of THEME_PALETTES) {
    const start = css.indexOf(`[data-palette="${palette.value}"]`);
    const block = css.slice(start, css.indexOf("}", start));

    const black = block.match(/--color-black:\s*(#[0-9a-f]{6})/)?.[1];
    const surface = block.match(/--color-zinc-950:\s*(#[0-9a-f]{6})/)?.[1];

    assert.ok(black && surface, `${palette.value}의 밤 색을 찾을 수 없다`);
    assert.ok(
      brightness(surface) > brightness(black),
      `${palette.value}: 카드(${surface})가 바탕(${black})보다 어둡다`,
    );
  }
});

test("색 갈래마다 화면을 바꾸는 규칙이 있다", () => {
  for (const palette of THEME_PALETTES) {
    assert.ok(
      css.includes(`[data-palette="${palette.value}"]`),
      `${palette.value}를 고를 수 있는데 색이 바뀌지 않는다`,
    );
  }
});

test("글꼴 갈래마다 화면을 바꾸는 규칙이 있다", () => {
  for (const fonts of THEME_FONT_SETS) {
    assert.ok(
      css.includes(`[data-fonts="${fonts.value}"]`),
      `${fonts.value}를 고를 수 있는데 글꼴이 바뀌지 않는다`,
    );
  }
});

test("색 갈래 규칙마다 바탕·글·강조가 모두 정해져 있다", () => {
  /*
    하나라도 빠지면 앞 갈래의 값이 남는다. 예를 들어 강조색만 빠지면
    이끼 서가를 골랐는데 표시만 쪽빛으로 남는다.
  */
  for (const palette of THEME_PALETTES) {
    const start = css.indexOf(`[data-palette="${palette.value}"]`);
    const block = css.slice(start, css.indexOf("}", start));

    for (const name of [
      "--color-white",
      "--color-black",
      "--color-zinc-50",
      "--color-zinc-500",
      "--color-zinc-950",
      "--color-accent",
      "--color-accent-soft",
      "--color-accent-dark",
    ]) {
      assert.ok(
        block.includes(name),
        `${palette.value}에 ${name}이 없다`,
      );
    }
  }
});

test("Tailwind 색을 값으로 박아 넣지 않는다", () => {
  /*
    @theme에 inline을 붙이면 색이 각 클래스에 박혀, 그 뒤로는 무엇으로도
    바꿀 수 없다. 사람마다 다른 색을 쓰는 것이 이 한 낱말에 달려 있다.
  */
  assert.ok(
    !css.includes("@theme inline"),
    "@theme inline이면 [data-palette]로 색을 바꿀 수 없다",
  );
  assert.ok(css.includes("@theme"), "@theme 블록을 찾을 수 없다");
});

test("고르는 화면에 보여줄 색 세 개가 있다", () => {
  for (const palette of THEME_PALETTES) {
    assert.equal(palette.swatch.length, 3, `${palette.value}의 색이 셋이 아니다`);

    for (const color of palette.swatch) {
      assert.match(color, /^#[0-9a-f]{6}$/, `${color}는 색 값이 아니다`);
    }
  }
});

// -----------------------------------------------------------------------------
// 목록 자체가 성하다
// -----------------------------------------------------------------------------

test("갈래마다 이름과 설명이 있다", () => {
  for (const palette of THEME_PALETTES) {
    assert.ok(palette.label.trim().length > 0);
    assert.ok(palette.description.trim().length > 0);
  }

  for (const fonts of THEME_FONT_SETS) {
    assert.ok(fonts.label.trim().length > 0);
    assert.ok(fonts.description.trim().length > 0);
  }
});

test("이름이 겹치지 않는다", () => {
  const paletteLabels = THEME_PALETTES.map((palette) => palette.label);
  const fontLabels = THEME_FONT_SETS.map((fonts) => fonts.label);

  assert.equal(new Set(paletteLabels).size, paletteLabels.length);
  assert.equal(new Set(fontLabels).size, fontLabels.length);
});

test("이름표를 되돌려 준다", () => {
  assert.equal(getPaletteLabel("graphite"), "흑연");
  assert.equal(getFontsLabel("single"), "한 글꼴");
});

// -----------------------------------------------------------------------------
// 모르는 값
// -----------------------------------------------------------------------------

test("모르는 밝기는 컴퓨터 설정을 따르는 것으로 본다", () => {
  assert.equal(readThemeMode("auto"), DEFAULT_MODE);
  assert.equal(readThemeMode(undefined), DEFAULT_MODE);
  assert.ok(isThemeMode("light"));
  assert.ok(!isThemeMode("bright"));
  assert.equal(getModeLabel("dark"), "어둡게");
});

test("모르는 값은 기본값으로 본다", () => {
  /*
    보기에 관한 값이라 여기서 막을 일이 아니다. 값 하나 때문에 화면을
    못 여는 쪽이 훨씬 나쁘다. 저장할 때만 거부한다.
  */
  assert.equal(readThemePalette("sunset"), DEFAULT_PALETTE);
  assert.equal(readThemePalette(null), DEFAULT_PALETTE);
  assert.equal(readThemeFonts(""), DEFAULT_FONTS);
  assert.equal(readThemeFonts(undefined), DEFAULT_FONTS);
});

test("아는 값은 그대로 통과한다", () => {
  assert.equal(readThemePalette("moss"), "moss");
  assert.equal(readThemeFonts("gowun"), "gowun");
  assert.ok(isThemePalette("hanji"));
  assert.ok(!isThemePalette("myeongjo"));
  assert.ok(isThemeFonts("myeongjo"));
  assert.ok(!isThemeFonts("hanji"));
});

test("기본값이 목록 안에 있고 데이터베이스 기본값과 같다", () => {
  assert.ok(isThemePalette(DEFAULT_PALETTE));
  assert.ok(isThemeFonts(DEFAULT_FONTS));
  assert.ok(isThemeMode(DEFAULT_MODE));
  assert.deepEqual(DEFAULT_APPEARANCE, {
    mode: DEFAULT_MODE,
    palette: DEFAULT_PALETTE,
    fonts: DEFAULT_FONTS,
  });

  assert.ok(
    flatSql.includes(`theme_mode text not null default '${DEFAULT_MODE}'`),
    "데이터베이스 기본 밝기가 화면 기본값과 다르다",
  );

  assert.ok(
    flatSql.includes(`theme_palette text not null default '${DEFAULT_PALETTE}'`),
    "데이터베이스 기본 색이 화면 기본값과 다르다",
  );
  assert.ok(
    flatSql.includes(`theme_fonts text not null default '${DEFAULT_FONTS}'`),
    "데이터베이스 기본 글꼴이 화면 기본값과 다르다",
  );
});
