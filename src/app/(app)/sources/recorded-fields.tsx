/**
 * 담아둔 값을 읽기만 하는 모양으로 보여준다. (2026-10-04, 사용자가 쓰다가 말함)
 *
 * > 그 버튼을 누르지 않았을 때는 입력되어 있는 내용들이 편집창처럼 나오지
 * > 않고 깔끔하게 기록되어 있는 화면을 보이게 해줘.
 *
 * 음악·책·YouTube·장소·영화 칸이 함께 쓴다. **한 벌만 만든다.** 갈래마다
 * 읽기 화면을 따로 만들면 다섯 곳이 조금씩 달라지고, 자료 갈래를 바꿀 때마다
 * 읽는 사람이 눈을 다시 맞춰야 한다.
 *
 * 갈래가 내놓는 것은 **이름과 값의 줄들**뿐이다. 무엇을 어떤 말로 부르는지는
 * 그 갈래가 가장 잘 안다. 모양을 정하는 일만 여기서 한다.
 *
 * **빈 값은 줄을 만들지 않는다.** 적지 않은 칸을 `—`로 늘어놓으면, 담아둔
 * 것을 보려고 온 사람에게 **없는 것의 목록**을 보여주는 셈이 된다. 폼에서는
 * 빈 칸이 "여기 적으세요"라는 뜻이지만 읽기 화면에서는 아무 뜻이 없다.
 *
 * 그래서 **아무것도 없으면 그렇다고 말한다.** 줄이 하나도 없는데 칸만
 * 비어 있으면 고장으로 보인다.
 */

/** 한 줄. 값이 비면 그려지지 않는다. */
export type RecordedField = {
  label: string;
  /** 비었으면 `null`·`undefined`·빈 글자 중 무엇이든 괜찮다. */
  value: string | null | undefined;
  /**
   * 줄바꿈을 살려야 하는 긴 글인가. 이유·평가·줄거리가 그렇다.
   *
   * 살리지 않으면 **적을 때 나눠 적은 단락이 한 덩어리로 붙는다.**
   */
  multiline?: boolean;
};

export function RecordedFields({
  fields,
  emptyText,
}: {
  fields: readonly RecordedField[];
  /** 적어둔 것이 하나도 없을 때 할 말. */
  emptyText: string;
}) {
  const filled = fields.filter(
    (field) => (field.value ?? "").trim().length > 0,
  );

  if (filled.length === 0) {
    return (
      <p className="text-sm leading-6 text-zinc-500">
        {emptyText} 오른쪽 위 연필을 눌러 적을 수 있습니다.
      </p>
    );
  }

  return (
    /*
      `dl`을 쓴다. 이름과 값의 짝이라 그 뜻이 맞고, 읽어주는 기계가 짝으로
      읽는다. 표로 짜면 좁은 화면에서 칸이 눌린다.
    */
    <dl className="flex flex-col gap-3">
      {filled.map((field) => (
        <div
          key={field.label}
          className="flex flex-col gap-0.5 sm:flex-row sm:gap-4"
        >
          <dt className="shrink-0 text-xs text-zinc-500 sm:w-28 sm:pt-0.5">
            {field.label}
          </dt>
          <dd
            className={`min-w-0 flex-1 text-sm leading-6 text-zinc-800 dark:text-zinc-200 ${
              field.multiline ? "whitespace-pre-wrap" : "break-words"
            }`}
          >
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/*
  **칸의 껍데기를 여기 만들지 않는다.** 처음에 `RecordedSection`을
  만들었는데 `panel.tsx`의 `Panel`이 이미 같은 일을 하고 있었다. 제목과
  물음표 단추와 테두리가 그것이다.

  두 벌이 되면 고치는 중과 읽을 때의 머리말이 조금씩 달라지고, 연필을
  누를 때 화면이 위아래로 튄다. 같은 `Panel`을 쓰면 **머리말이 제자리에
  있고 안쪽만 바뀐다.**
*/
