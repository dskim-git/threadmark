/**
 * 고치기를 뜻하는 연필. (2026-10-04)
 *
 * **`capture-editing.tsx`에서 떼어냈다.** 거기 "한 곳에서만 쓰는 작은
 * 그림이라 파일을 늘릴 일이 아니다"라고 적어 두었는데, 자료 화면이 같은
 * 단추를 쓰게 되면서 두 곳이 되었다.
 *
 * **같은 뜻의 것을 두 벌 만들지 않는다.** 두 벌이 되면 한쪽만 고쳐지고,
 * 같은 일을 가리키는 그림이 화면마다 다르면 읽는 사람이 둘을 다른 것으로
 * 여긴다. (`media/time.ts` 머리말과 같은 생각)
 *
 * 그림 파일을 두지 않고 선으로 그린다. 쓰는 곳이 둘뿐이라 아직 그쪽이
 * 가볍다.
 */
export function PencilIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
    >
      <path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10z" />
      <path d="M10 4l2 2" />
    </svg>
  );
}
