import { starredInputValue } from "@/lib/stars";

/**
 * 중요 표시(별) 단추. (설계 문서 5.2-1절, 6.2-1절)
 *
 * 자료와 기록이 같은 단추를 쓴다. 하는 일이 같고, 두 벌로 만들면 한쪽만
 * 손보게 된다. 다른 것은 어느 Server Action을 부르느냐뿐이라 그것만 받는다.
 *
 * 브라우저에서 도는 코드가 없다. form 하나와 단추 하나다. 자바스크립트가
 * 아직 오지 않았어도 눌리고, 눌린 결과는 서버가 다시 그려준 화면에 나온다.
 *
 * **지금 상태가 아니라 바꾸려는 상태를 보낸다.** 지금 상태를 보내고 서버가
 * 뒤집게 하면, 빠르게 두 번 눌렸을 때 결과가 누른 순서에 달리게 된다.
 * (stars.ts의 readStarredInput)
 */
export function StarButton({
  action,
  id,
  starred,
  returnTo,
  title,
  className,
}: {
  /** toggleSourceStar 또는 toggleCaptureStar. */
  action: (formData: FormData) => Promise<void>;
  id: string;
  starred: boolean;
  /** 눌린 뒤 다시 그릴 화면. 오류일 때만 이 주소로 옮긴다. */
  returnTo: string;
  /** 무엇에 다는 별인지. 읽어주는 이름에 들어간다. 예: "이 자료" */
  title: string;
  className?: string;
}) {
  const label = starred
    ? `${title}의 중요 표시 떼기`
    : `${title}을(를) 중요 표시하기`;

  return (
    <form action={action} className={className}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="returnTo" value={returnTo} />
      <input type="hidden" name="starred" value={starredInputValue(starred)} />
      <button
        type="submit"
        aria-pressed={starred}
        aria-label={label}
        title={label}
        /*
          누를 자리를 손가락만큼 준다. 별 모양만큼만 주면 좁은 화면에서
          옆의 카드가 눌린다.
        */
        className={
          starred
            ? "flex h-9 w-9 items-center justify-center rounded-full text-amber-500 transition-colors hover:bg-amber-500/10 dark:text-amber-400"
            : "flex h-9 w-9 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-black/[.06] hover:text-amber-500 dark:text-zinc-600 dark:hover:bg-white/[.08] dark:hover:text-amber-400"
        }
      >
        <StarIcon filled={starred} />
      </button>
    </form>
  );
}

/**
 * 별 모양.
 *
 * 글자(★ ☆)를 쓰지 않는다. 기기마다 다른 글꼴로 그려져 크기와 굵기가
 * 들쭉날쭉하고, 어떤 기기에서는 색이 입혀진 그림으로 나와 꺼진 상태와
 * 켜진 상태가 구별되지 않는다.
 *
 * 켜진 것과 꺼진 것을 **색만으로 가르지 않는다.** 속을 채우느냐 테두리만
 * 남기느냐로도 가른다. 색만으로 가르면 색을 구별하기 어려운 사람에게는
 * 둘이 같아 보인다.
 */
function StarIcon({ filled }: { filled: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.6}
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3.5l2.6 5.28 5.83.85-4.22 4.11.997 5.81L12 16.82l-5.21 2.74.995-5.81-4.22-4.11 5.83-.85L12 3.5z" />
    </svg>
  );
}
