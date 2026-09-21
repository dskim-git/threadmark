"use client";

/**
 * 날짜 입력.
 *
 * 브라우저의 날짜 입력란은 오른쪽 끝의 작은 달력 아이콘을 눌러야 달력이 열린다.
 * 칸 아무 곳이나 눌러도 열리게 한다.
 *
 * 포커스만으로는 열지 않는다. 탭으로 이동한 뒤 키보드로 날짜를 치려는 사람에게
 * 달력이 먼저 덮이면 방해가 된다. 클릭은 달력을 찾는 동작이고,
 * 탭 이동은 입력을 시작하려는 동작이라 서로 다르게 다룬다.
 *
 * showPicker는 사용자의 조작 없이 호출되면 브라우저가 막는다.
 * 지원하지 않는 브라우저도 있으므로, 실패해도 평소처럼 동작하게 둔다.
 */
export function DateField({
  id,
  name,
  label,
  defaultValue,
}: {
  id: string;
  name: string;
  label: string;
  defaultValue: string;
}) {
  const openPicker = (input: HTMLInputElement) => {
    if (typeof input.showPicker !== "function") {
      return;
    }

    try {
      input.showPicker();
    } catch {
      // 브라우저가 거부한 경우다. 기본 동작에 맡긴다.
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className="text-sm font-medium text-black dark:text-zinc-50"
      >
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="date"
        defaultValue={defaultValue}
        onClick={(event) => openPicker(event.currentTarget)}
        className="h-11 w-full cursor-pointer rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
      />
      <p className="text-xs text-zinc-500">
        칸을 누르면 달력이 열립니다. 키보드로 직접 입력할 수도 있습니다.
      </p>
    </div>
  );
}
