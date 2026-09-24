/**
 * 자료의 대표 그림. (15-E-2a 뒤, 사용자 요청)
 *
 * 책 표지, 앨범 표지, 웹페이지의 대표 이미지가 여기 온다. 전부
 * `sources.thumbnail_url` 한 칸에 담겨 있고, 각 유형의 저장 과정이 채운다.
 *
 * **없으면 아무것도 그리지 않는다.** 빈 회색 상자를 자리마다 두면, 표지가
 * 있는 자료보다 없는 자료가 훨씬 많은 목록에서는 그 상자가 곧 잡음이 된다.
 * 논문과 메모에는 표지라는 것이 아예 없다. 있는 것만 보여주고 없으면 글이
 * 그 자리를 쓴다.
 *
 * **자르지 않고 담는다.** 세 가지 모양이 한 목록에 섞인다.
 *
 *   책 표지    세로로 긴 네모
 *   앨범 표지  정사각형
 *   웹페이지   가로로 긴 네모
 *
 * 한 상자에 맞춰 잘라내면(`object-cover`) 책 표지는 제목이 적힌 위쪽이
 * 날아가고 웹페이지는 양옆이 잘린다. **알아보라고 넣는 그림인데 알아볼 수
 * 없게 된다.** 그래서 상자 안에 통째로 넣고(`object-contain`) 남는 자리는
 * 비워 둔다. 조금 헐거워 보이지만 잃는 것이 없다.
 *
 * **주소 자리에는 http와 https만 받는다.** 받아온 값이 그대로 그림 주소로
 * 들어간다. 저장하는 쪽에서도 보고 데이터베이스에서도 보지만 여기서 한 번
 * 더 본다. 세 곳에서 모두 보는 것이 이 저장소의 규칙이다. (15-C)
 *
 * **어디서 왔는지 상대에게 알리지 않는다.** 그림을 불러오면 브라우저가
 * 그 사이트에 `Referer`를 함께 보낸다. 그러면 남의 서버가 우리 앱의 주소와
 * 사용자가 보고 있던 화면을 알게 된다. 표지 하나 보여주자고 알릴 일이 아니다.
 *
 * `next/image`를 쓰지 않는다. 주소가 어디서 올지 미리 알 수 없어 허용
 * 목록을 적어둘 수 없다. 음악의 앨범 표지와 같은 판단이다.
 */
export function SourceThumb({ url }: { url: string | null }) {
  if (!url || !/^https?:\/\//iu.test(url)) {
    return null;
  }

  return (
    <span className="flex h-20 w-16 shrink-0 items-center justify-center overflow-hidden rounded bg-zinc-50 dark:bg-white/[.06]">
      {/*
        alt를 비워 둔다. 제목이 바로 옆에 있어서, 읽어주는 기계가 그림까지
        읽으면 같은 말을 두 번 듣게 된다. 이 그림은 곁들임이지 내용이 아니다.
      */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="max-h-full max-w-full object-contain"
      />
    </span>
  );
}
