"use client";

import { useEffect, useRef, useState } from "react";

import {
  loadKakaoMaps,
  readMapFailure,
} from "@/lib/places/map-sdk";
import { mapFailureMessage, type MapLoadFailure } from "@/lib/places/places";

/**
 * 담아둔 장소의 지도. (설계 문서 17-2절)
 *
 * **주소 아래에 놓인다.** (2026-09-25, 사용자가 정함) 지도는 주소를
 * 확인하는 수단이다. 찾아 고른 주소가 맞는 곳인지는 글자로 봐서는 알 수
 * 없고 지도를 봐야 안다. 그러니 주소 바로 아래가 맞는 자리다. (17-2.1절)
 *
 * **지도가 안 떠도 멈추지 않는다.** 열쇠가 없거나 도메인이 등록되지
 * 않았거나 브라우저가 스크립트를 막으면, 그 자리에 **까닭을 적는다.**
 * 주소와 지도 링크는 그대로 보인다.
 *
 * **빈 상자를 그리지 않는다.** 이 저장소가 도메인 등록을 빠뜨려 두 번
 * 막혔고(12-A·12-C), 그때마다 화면은 아무 말도 하지 않았다. 세 번째는
 * 그러지 않는다. (17-2.5절)
 *
 * 우리가 그리는 지도로는 **길찾기를 할 수 없다.** 그래서 이 아래에
 * 카카오맵·구글 지도 링크가 남아 있다. 부르는 쪽이 그린다. (17-2.2절)
 */
export function PlaceMap({
  latitude,
  longitude,
  name,
}: {
  latitude: number;
  longitude: number;
  name: string;
}) {
  const box = useRef<HTMLDivElement | null>(null);
  const [failure, setFailure] = useState<MapLoadFailure | null>(null);
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    /*
      효과가 두 번 돌거나 좌표가 바뀌는 동안 늦게 온 답이 화면을 건드리는
      것을 막는다. **안 막으면 앞 장소의 지도가 뒤 장소 자리에 그려진다.**
      오류는 나지 않는다.
    */
    let alive = true;

    /*
      여기서 상태를 되돌리지 않는다.

      처음에는 효과 앞머리에서 `setFailure(null)`과 `setDrawn(false)`를
      불렀다. 그것이 **효과 안에서 바로 상태를 바꾸는 일**이라 lint가
      막았고, 막은 것이 옳다. 그렇게 하면 한 번 더 그려지고, 무엇보다
      "좌표가 바뀌었으니 처음부터"를 손으로 되돌리는 코드가 된다.

      **되돌리는 대신 다시 붙인다.** 부르는 쪽이 좌표를 `key`로 주므로,
      좌표가 바뀌면 React가 이 칸을 새로 만든다. 그때 상태는 저절로
      처음 값이다. 손으로 맞출 자리가 없어진다.
    */
    loadKakaoMaps()
      .then((maps) => {
        const container = box.current;

        if (!alive || !container) {
          return;
        }

        /*
          다시 그릴 때 앞의 지도를 지운다. 카카오맵은 상자 안에 요소를
          만들어 넣는데, 비우지 않으면 **지도가 겹쳐 쌓인다.**
        */
        container.innerHTML = "";

        const center = new maps.LatLng(latitude, longitude);

        const map = new maps.Map(container, {
          center,
          /*
            확대 정도. 3이면 골목이 보인다.

            **가게 하나를 확인하는 지도다.** 넓게 잡으면 무엇을 확인해야
            하는지 알 수 없고, 너무 좁히면 어디쯤인지 감이 안 온다.
          */
          level: 3,
        });

        new maps.Marker({ position: center, map });

        /*
          상자 크기가 정해진 뒤에 자리를 다시 잡는다.

          지도를 만드는 시점에 상자가 아직 자리를 못 잡았으면 표시가
          한쪽으로 치우친다. `relayout`이 그것을 바로잡는다.
        */
        map.relayout();
        map.setCenter(center);

        setDrawn(true);
      })
      .catch((error: unknown) => {
        if (alive) {
          setFailure(readMapFailure(error));
        }
      });

    return () => {
      alive = false;
    };
  }, [latitude, longitude]);

  if (failure) {
    return (
      <p className="rounded-xl bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
        {mapFailureMessage(failure)}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={box}
        /*
          높이를 정해 둔다. 지도는 상자 크기를 스스로 정하지 못한다.
          높이가 0이면 **아무것도 안 보이고 오류도 나지 않는다.**

          384px(`h-96`)이다. 처음에는 256px(`h-64`)이었는데 실제로 써보고
          1.5배로 늘렸다. (2026-09-25, 사용자 요청) **낮으면 주변이 안
          보인다.** 표시 하나만 꽉 차게 보이고 그 곳이 어느 길가인지,
          무엇 옆인지가 잘려 나간다. 답사지를 확인하는 지도라 주변이 함께
          보여야 한다.

          너비는 `w-full`로 둔다. 칸 너비에 맞춰 늘고 줄어야 좁은 화면에서
          가로로 삐져나가지 않는다.
        */
        className="h-96 w-full overflow-hidden rounded-xl border border-black/[.08] bg-zinc-50 dark:border-white/[.145] dark:bg-white/[.04]"
        /* 읽어주는 기계에는 그림이 아니라 장소 이름을 알려준다. */
        role="img"
        aria-label={`${name} 위치 지도`}
      />

      {/*
        아직 그리는 중일 때.

        **빈 상자만 두지 않는다.** 느린 인터넷에서는 몇 초 비어 있는데,
        그 사이에 사용자는 고장이라고 생각한다.
      */}
      {!drawn ? (
        <p className="text-xs leading-5 text-zinc-500">지도를 불러오는 중…</p>
      ) : (
        /*
          어디서 온 지도인지 밝힌다.

          카카오가 정해진 문구를 요구하는지는 확인하지 못했다. 그 사정은
          `legal/attribution.ts`에 적어 두었다. **밝히는 것까지가 우리가
          확실히 할 수 있는 일이다.**
        */
        <p className="text-xs leading-5 text-zinc-500">
          지도는 카카오맵에서 가져왔습니다.{" "}
          <a
            href="/credits"
            className="underline underline-offset-2 hover:text-black dark:hover:text-zinc-300"
          >
            출처 표기
          </a>
        </p>
      )}
    </div>
  );
}
