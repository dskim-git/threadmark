"use client";

import { useEffect, useRef, useState } from "react";

import { findGoogleAddressAtPoint } from "@/lib/places/google-geocode";
import { loadGoogleMaps } from "@/lib/places/google-map-sdk";
import {
  loadKakaoMaps,
  readMapFailure,
} from "@/lib/places/map-sdk";
import {
  mapFailureMessage,
  mapProviderForRegion,
  type CoordinateAddress,
  type MapLoadFailure,
} from "@/lib/places/places";

import { findAddressAtPoint } from "./place-actions";

/** 찍은 자리. 부르는 쪽이 이 값으로 칸을 채운다. */
export type PickedPoint = {
  latitude: number;
  longitude: number;
  address: CoordinateAddress | null;
};

/**
 * 지도에서 찍어 담는 창. (설계 문서 17-3.3절, 2026-09-25 사용자 요청)
 *
 * > 이름을 기억하지 못하는 경우 거꾸로 지도에서 장소를 찾아서 등록시키는거
 *
 * **이름으로도 주소로도 못 찾을 때 쓰는 마지막 길이다.** 간판 이름과
 * 등록된 상호가 다르거나, 이름은 잊었고 "그 골목 그 자리"만 기억나는
 * 경우다. 그때는 지도를 보면 안다.
 *
 * **찍은 좌표를 주소로 바꾼다.** 카카오의 `coord2address`가 도로명 주소·
 * 지번 주소·우편번호를 함께 준다. 지금 쓰는 REST 열쇠로 된다.
 *
 * **이름은 채우지 않는다.** 지도는 그 자리에 무엇이 있는지 모른다. 이름을
 * 모를 때 쓰는 길이므로 그것이 맞고, 이름은 사용자가 적는다.
 *
 * **창으로 띄우는 까닭.** 지도를 찍는 일에는 넓은 자리가 필요하고, 그동안
 * 아래 입력 칸들은 볼 일이 없다. 칸 안에 지도를 하나 더 그리면 화면이
 * 길어져 무엇을 하는 중인지 알기 어려워진다. `띄워놓고 찾기`(16-A)와 같은
 * 판단이다.
 *
 * **국내와 해외가 다른 지도를 쓴다.** (17-3.4절 3차례) 카카오맵은 해외
 * 자료가 부실해 찍을 것이 안 보이고, 좌표를 주소로 바꾸는 것도 국내만
 * 된다. 해외는 구글 지도를 그리고 구글에 주소를 묻는다.
 *
 * **묻는 자리가 정반대다.** 국내는 우리 서버가 카카오에 묻고(Server
 * Action), 해외는 이 브라우저가 구글에 직접 묻는다. 구글 열쇠에 리퍼러
 * 제한이 걸려 있어 서버에서 부르면 거부되기 때문이다.
 */
export function PlacePicker({
  /** 창을 열 때 지도가 놓일 자리. 이미 담아둔 좌표가 있으면 그곳이다. */
  startLatitude,
  startLongitude,
  region,
  onPicked,
}: {
  startLatitude: number | null;
  startLongitude: number | null;
  /** 국내인지 해외인지. 어느 지도를 그리고 어디에 물을지 정한다. */
  region: string;
  onPicked: (point: PickedPoint) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="h-10 shrink-0 whitespace-nowrap rounded-full border border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
      >
        지도에서 찍기
      </button>

      {open ? (
        <PickerWindow
          startLatitude={startLatitude}
          startLongitude={startLongitude}
          region={region}
          onClose={() => setOpen(false)}
          onPicked={(point) => {
            onPicked(point);
            setOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * 창 안쪽.
 *
 * **창이 열릴 때만 만들어진다.** 지도를 그리는 효과가 창과 함께 살고
 * 죽으므로, 닫았다 열면 처음부터 다시 그린다. 상태를 손으로 되돌릴 자리가
 * 없어진다. (`place-map.tsx`에서 `key`로 한 것과 같은 생각이다)
 */
function PickerWindow({
  startLatitude,
  startLongitude,
  region,
  onClose,
  onPicked,
}: {
  startLatitude: number | null;
  startLongitude: number | null;
  region: string;
  onClose: () => void;
  onPicked: (point: PickedPoint) => void;
}) {
  const overseas = mapProviderForRegion(region) === "google";
  const box = useRef<HTMLDivElement | null>(null);
  const [failure, setFailure] = useState<MapLoadFailure | null>(null);
  const [picked, setPicked] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [address, setAddress] = useState<CoordinateAddress | null>(null);
  const [asking, setAsking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Esc로 닫는다. 창이 화면을 덮고 있어서 나가는 길이 분명해야 한다.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    let alive = true;

    /*
      담아둔 좌표가 있으면 그 자리에서 시작한다.

      **없을 때 어디서 시작할지가 국내와 해외에서 다르다.**

      국내는 서울시청이다. 지도가 바다에서 시작하면 사용자가 먼저 할 일이
      "우리 나라 찾기"가 된다.

      해외는 그렇게 정할 자리가 없다. **어느 나라인지 우리가 모른다.**
      한 곳을 골라두면 열에 아홉은 틀린 대륙에서 시작하고, 엉뚱한 곳에서
      빠져나오는 것이 넓은 데서 찾아 들어오는 것보다 길다. 그래서 넓게
      펴서 시작한다.

      시작 자리는 찍힌 것이 아니므로 표시를 두지 않는다.
    */
    const started = startLatitude !== null && startLongitude !== null;
    const startLat = startLatitude ?? 37.5666805;
    const startLng = startLongitude ?? 126.9784147;

    /**
     * 찍은 자리를 받아 주소까지 알아본다.
     *
     * **두 지도가 같은 일을 한다.** 다른 것은 어디에 묻느냐뿐이라 여기
     * 한 곳에 둔다. 나눠 두면 한쪽만 고쳐지고, 그것은 오류 없이 "해외만
     * 주소가 안 채워진다"로 나타난다.
     */
    const take = (lat: number, lng: number) => {
      setPicked({ latitude: lat, longitude: lng });
      setAddress(null);
      setAsking(true);
      setNotice(null);

      /*
        찍자마자 주소를 물어본다. **누르고 나서 또 누르게 하지 않는다.**
        찍는 것이 곧 "여기다"라는 뜻이고, 주소는 그 결과로 따라오는 값이다.

        국내는 우리 서버가 카카오에 묻고, 해외는 이 브라우저가 구글에
        직접 묻는다. 돌려주는 모양을 같게 맞춰 두어 아래가 한 벌로 끝난다.
      */
      const asked = overseas
        ? findGoogleAddressAtPoint(lat, lng)
        : findAddressAtPoint(lat, lng);

      void asked.then((result) => {
        if (!alive) {
          return;
        }

        setAsking(false);

        if (!result.ok) {
          setNotice(result.message);

          return;
        }

        setAddress(result.address);
        setNotice(
          result.address === null
            ? "그 자리의 주소를 찾지 못했습니다. 좌표만 담고 주소는 손으로 적으셔도 됩니다."
            : null,
        );
      });
    };

    const drawKakao = async () => {
      const maps = await loadKakaoMaps();
      const container = box.current;

      if (!alive || !container) {
        return;
      }

      container.innerHTML = "";

      const map = new maps.Map(container, {
        center: new maps.LatLng(startLat, startLng),
        level: 3,
      });

      /*
        찍은 자리에 표시를 하나 둔다. **표시를 새로 만들지 않고 옮긴다.**
        매번 만들면 찍은 자리마다 표시가 쌓여 어느 것이 지금 자리인지
        알 수 없어진다.
      */
      const marker = new maps.Marker({
        position: new maps.LatLng(startLat, startLng),
      });

      // 담아둔 좌표가 있으면 그 자리를 이미 찍힌 것으로 본다.
      if (started) {
        marker.setMap(map);
        setPicked({ latitude: startLat, longitude: startLng });
      }

      maps.event.addListener(map, "click", (event) => {
        const point = event.latLng;

        marker.setPosition(point);
        marker.setMap(map);

        take(point.getLat(), point.getLng());
      });

      map.relayout();
      map.setCenter(new maps.LatLng(startLat, startLng));
    };

    const drawGoogle = async () => {
      const maps = await loadGoogleMaps();
      const container = box.current;

      if (!alive || !container) {
        return;
      }

      container.innerHTML = "";

      const center = started
        ? { lat: startLat, lng: startLng }
        : /*
            담아둔 자리가 없을 때. 위도 20도쯤이 대륙이 고르게 보이는
            자리다. 특정 나라를 가운데 두지 않는다.
          */
          { lat: 20, lng: 0 };

      const map = new maps.Map(container, {
        center,
        // 담아둔 자리가 있으면 골목까지, 없으면 대륙이 다 보이게.
        zoom: started ? 16 : 2,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
      });

      const marker = new maps.Marker({ position: center });

      if (started) {
        marker.setMap(map);
        setPicked({ latitude: startLat, longitude: startLng });
      }

      map.addListener("click", (event) => {
        const point = event.latLng;

        // 지도 밖이나 로고 위를 누르면 자리가 비어 온다. 그때는 아무 일도 없다.
        if (!point) {
          return;
        }

        const lat = point.lat();
        const lng = point.lng();

        marker.setPosition({ lat, lng });
        marker.setMap(map);

        take(lat, lng);
      });
    };

    (overseas ? drawGoogle() : drawKakao()).catch((error: unknown) => {
      if (alive) {
        setFailure(readMapFailure(error));
      }
    });

    return () => {
      alive = false;
    };
  }, [startLatitude, startLongitude, overseas]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onPointerDown={(event) => {
        // 바깥을 누르면 닫는다. 안쪽 누름은 여기까지 올라오지 않게 막는다.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-label="지도에서 장소 찍기"
        className="flex h-full max-h-[42rem] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-black/[.08] bg-white shadow-xl dark:border-white/[.145] dark:bg-zinc-950"
      >
        <div className="flex flex-wrap items-center gap-2 border-b border-black/[.08] px-5 py-4 dark:border-white/[.145]">
          <h2 className="text-sm font-medium text-black dark:text-zinc-50">
            지도에서 찍기
          </h2>
          <p className="text-xs text-zinc-500">
            찾는 자리를 누르면 주소를 알아봅니다. 이름은 직접 적으셔야 합니다.
          </p>

          <button
            type="button"
            onClick={onClose}
            className="ml-auto h-8 shrink-0 rounded-full border border-black/[.08] px-3 text-xs text-black transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            닫기
          </button>
        </div>

        {failure ? (
          <p className="m-5 rounded-lg bg-zinc-50 px-4 py-3 text-xs leading-5 text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
            {mapFailureMessage(failure)}
          </p>
        ) : (
          /*
            지도가 남은 자리를 다 쓴다. **찍는 일에는 넓은 자리가 필요하다.**
            골목을 가려내야 하는데 좁으면 손가락으로 짚을 수가 없다.
          */
          <div ref={box} className="min-h-0 flex-1 bg-zinc-50 dark:bg-white/[.04]" />
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-black/[.08] px-5 py-4 dark:border-white/[.145]">
          {/*
            찍은 자리를 글로 보여준다. **찍었는지 아닌지가 보여야 한다.**
            지도의 표시만으로는 스크롤하다 가려질 수 있다.
          */}
          <div className="min-w-0 flex-1 text-xs leading-5">
            {picked === null ? (
              <span className="text-zinc-500">
                지도를 눌러 자리를 찍어 주세요.
              </span>
            ) : (
              <span className="flex flex-col gap-0.5">
                <span className="text-zinc-800 dark:text-zinc-200">
                  {asking
                    ? "주소를 알아보는 중…"
                    : (address?.roadAddress ??
                      address?.address ??
                      "주소를 찾지 못했습니다")}
                </span>
                <span className="text-zinc-500">
                  {picked.latitude}, {picked.longitude}
                  {address?.postalCode ? ` · ${address.postalCode}` : ""}
                </span>
              </span>
            )}
          </div>

          {/*
            **찍기 전에는 담을 수 없다.** 창을 열자마자 눌리면 지도 가운데의
            아무 자리가 담긴다. 주소를 알아보는 동안도 막는다. 그때 담으면
            좌표만 들어가고, 사용자는 주소가 왜 비었는지 모른다.
          */}
          <button
            type="button"
            disabled={picked === null || asking}
            onClick={() => {
              if (picked === null) {
                return;
              }

              onPicked({ ...picked, address });
            }}
            className="h-10 shrink-0 whitespace-nowrap rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            이 자리로 담기
          </button>
        </div>

        {notice ? (
          <p className="border-t border-black/[.08] px-5 py-3 text-xs leading-5 text-zinc-600 dark:border-white/[.145] dark:text-zinc-400">
            {notice}
          </p>
        ) : null}
      </div>
    </div>
  );
}
