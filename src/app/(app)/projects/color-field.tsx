import { PROJECT_COLOR_PRESETS } from "@/lib/projects/schema";

/**
 * 프로젝트 대표 색 선택.
 *
 * 16진수 색상 코드를 외우고 있는 사람은 드물다. 고를 수 있게 만든다.
 *
 * 자바스크립트 없이 동작한다. 미리 고른 색과 "색 없음"은 라디오 버튼이고,
 * "직접 고르기"를 선택하면 옆의 색상 선택기 값을 쓴다.
 * 어떤 값을 쓸지는 서버가 정한다.
 */
export function ColorField({ value }: { value: string }) {
  const isPreset = PROJECT_COLOR_PRESETS.includes(value);
  const isCustom = value.length > 0 && !isPreset;

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 text-sm font-medium text-black dark:text-zinc-50">
        대표 색
      </legend>

      <div className="flex flex-wrap items-center gap-2">
        <label
          className="flex h-9 cursor-pointer items-center rounded-full border border-black/[.08] px-3 text-xs text-zinc-600 has-[:checked]:border-zinc-900 has-[:checked]:bg-zinc-900 has-[:checked]:text-white dark:border-white/[.145] dark:text-zinc-400 dark:has-[:checked]:border-zinc-100 dark:has-[:checked]:bg-zinc-100 dark:has-[:checked]:text-black"
          title="색 없음"
        >
          <input
            type="radio"
            name="colorChoice"
            value="none"
            defaultChecked={value.length === 0}
            className="sr-only"
          />
          없음
        </label>

        {PROJECT_COLOR_PRESETS.map((preset) => (
          <label
            key={preset}
            title={preset}
            className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-full border border-black/10 transition-transform has-[:checked]:scale-110 has-[:checked]:ring-2 has-[:checked]:ring-zinc-900 has-[:checked]:ring-offset-2 dark:border-white/20 dark:has-[:checked]:ring-zinc-100 dark:has-[:checked]:ring-offset-black"
            style={{ backgroundColor: preset }}
          >
            <input
              type="radio"
              name="colorChoice"
              value={preset}
              defaultChecked={value === preset}
              className="sr-only"
            />
            <span className="sr-only">{preset}</span>
          </label>
        ))}

        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-full border border-black/[.08] px-3 text-xs text-zinc-600 has-[:checked]:border-zinc-900 dark:border-white/[.145] dark:text-zinc-400 dark:has-[:checked]:border-zinc-100">
          <input
            type="radio"
            name="colorChoice"
            value="custom"
            defaultChecked={isCustom}
            className="sr-only"
          />
          직접 고르기
        </label>

        <input
          type="color"
          name="customColor"
          aria-label="직접 고른 색"
          defaultValue={isCustom ? value : "#4f46e5"}
          className="h-9 w-12 cursor-pointer rounded border border-black/[.08] bg-white p-1 dark:border-white/[.145] dark:bg-black"
        />
      </div>

      <p className="text-xs text-zinc-500">
        색을 직접 고르려면 &ldquo;직접 고르기&rdquo;를 선택한 뒤 오른쪽 색상
        상자에서 고릅니다.
      </p>
    </fieldset>
  );
}
