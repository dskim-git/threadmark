"use client";

import { useState, useTransition } from "react";

import { Panel } from "@/app/(app)/panel";
import type { AddressCandidate, PlaceCandidate } from "@/lib/places/kakao";
import {
  PLACE_VISIT_STATUSES,
  categoryLabel,
  getPlaceProviderLabel,
  getPlaceVisitStatusLabel,
  googleMapsUrl,
  kakaoMapUrl,
} from "@/lib/places/places";
import type { PlaceProfile } from "@/lib/places/queries";
import { MAX_TITLE_LENGTH } from "@/lib/sources/schema";

import { findAddresses, findPlaces, savePlace } from "./place-actions";

/**
 * 장소 칸. 이름으로 찾아 고르고 채운다. (설계 문서 17-1절)
 *
 * **지도를 그리지 않는다.** 좌표까지 담아두고 화면에는 카카오맵·구글
 * 지도로 가는 링크만 둔다. 지도를 그리려면 열쇠와 도메인 등록이 따로
 * 필요하고, 이 저장소는 도메인 등록을 빠뜨려 두 번 막혔다. (17-1.2절)
 *
 * **후보를 늘어놓고 사람이 고른다.** `경복궁`으로 물으면 549건이 오고
 * 그 안에 `다이소 경복궁역점`, `온유어마크 경복궁`이 섞여 있다.
 *
 * **고르는 목록에 분류와 주소를 함께 보여준다.** 이름만 보여주면 어느 것이
 * 찾던 곳인지 고를 수 없다. 이것이 이 화면에서 가장 중요한 결정이다.
 *
 * **고른 뒤에도 후보 목록을 감추지 않는다.** 잘못 골랐을 때 바로 다른 것을
 * 누를 수 있어야 한다. (`AGENTS.md` 2절)
 *
 * **찾는 칸과 적는 칸을 나누지 않는다.** 이름 칸 자체가 검색어다. 음악에서
 * 둘로 나눴다가 값이 두 벌이 되어 어긋났다.
 *
 * 저장을 누르기 전에는 아무것도 저장되지 않고 바뀐 값이 바로 칸에 보인다.
 * 그 둘이 있어서 덮어써도 위험하지 않다.
 */
export function PlacePanel({
  sourceId,
  sourceTitle,
  description,
  profile,
  returnTo,
}: {
  sourceId: string;
  sourceTitle: string;
  description: string | null;
  profile: PlaceProfile | null;
  returnTo: string;
}) {
  const [name, setName] = useState(sourceTitle);
  const [why, setWhy] = useState(description ?? "");

  const [provider, setProvider] = useState(profile?.provider ?? "");
  const [externalId, setExternalId] = useState(profile?.externalId ?? "");
  const [roadAddress, setRoadAddress] = useState(profile?.roadAddress ?? "");
  const [address, setAddress] = useState(profile?.address ?? "");
  const [category, setCategory] = useState(profile?.category ?? "");
  const [postal, setPostal] = useState(profile?.postalCode ?? "");
  const [phone, setPhone] = useState(profile?.phone ?? "");
  const [placeUrl, setPlaceUrl] = useState(profile?.placeUrl ?? "");
  const [lat, setLat] = useState(
    profile?.latitude === null || profile?.latitude === undefined
      ? ""
      : String(profile.latitude),
  );
  const [lng, setLng] = useState(
    profile?.longitude === null || profile?.longitude === undefined
      ? ""
      : String(profile.longitude),
  );
  const [visitStatus, setVisitStatus] = useState(profile?.visitStatus ?? "");

  /*
    찾은 것. **두 가지 중 하나다.**

    이름으로 찾은 것과 주소로 찾은 것은 모양이 다르다. 주소 쪽에는 이름도
    장소 번호도 없다. 목록 둘을 따로 들고 있으면 **화면에 둘이 함께 떠서
    어느 것을 눌러야 하는지 알 수 없어진다.** 마지막에 찾은 것만 보여준다.
  */
  const [found, setFound] = useState<
    | { kind: "place"; items: PlaceCandidate[] }
    | { kind: "address"; items: AddressCandidate[] }
    | null
  >(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();

  function search() {
    const query = name.trim();

    if (query === "") {
      setFailed("찾을 장소 이름을 적어 주세요.");

      return;
    }

    startBusy(async () => {
      const result = await findPlaces(query);

      if (!result.ok) {
        setFailed(result.message);
        setNotice(null);

        return;
      }

      setFound({ kind: "place", items: result.candidates });
      setFailed(null);
      setNotice(
        result.notice ??
          "맞는 곳을 눌러 주세요. 누르면 칸이 채워지고, 저장을 눌러야 남습니다.",
      );
    });
  }

  /**
   * 주소로 찾는다. (2026-09-25, 사용자 요청)
   *
   * **이름이 틀렸을 때 쓰는 길이다.** 상호명이 부정확해도 어디쯤인지는
   * 보통 안다. 우편번호도 이쪽에서만 온다.
   *
   * 도로명 칸을 먼저 보고 비었으면 지번 칸을 쓴다. **찾는 칸을 따로
   * 만들지 않는다.** 적는 칸이 곧 찾는 말이다. 음악에서 둘로 나눴다가
   * 값이 두 벌이 되어 어긋났다.
   */
  function searchByAddress() {
    const query = (roadAddress.trim() || address.trim()).trim();

    if (query === "") {
      setFailed("찾을 주소를 도로명 주소나 지번 주소 칸에 적어 주세요.");

      return;
    }

    startBusy(async () => {
      const result = await findAddresses(query);

      if (!result.ok) {
        setFailed(result.message);
        setNotice(null);

        return;
      }

      setFound({ kind: "address", items: result.candidates });
      setFailed(null);
      setNotice(
        result.notice ??
          "맞는 주소를 눌러 주세요. 좌표와 우편번호가 채워집니다. 자료 제목은 바뀌지 않습니다.",
      );
    });
  }

  /**
   * 주소 후보를 고른다.
   *
   * **자료 제목을 건드리지 않는다.** 주소로 찾는 상황은 곧 "내가 적은
   * 이름이 카카오에 없다"는 상황이고, 그때 이름을 덮으면 사용자가 부르던
   * 이름을 우리가 지우는 것이 된다. (17-1.3절)
   *
   * 분류·전화·상세 화면 주소도 건드리지 않는다. 주소 검색은 그것들을
   * 주지 않는다. **모르는 것을 비우지 않는다.** 이름으로 먼저 찾아
   * 채워둔 값이 있을 수 있다.
   */
  function chooseAddress(candidate: AddressCandidate) {
    setProvider("kakao");
    setRoadAddress(candidate.roadAddress ?? "");
    setAddress(candidate.address ?? "");
    setPostal(candidate.postalCode ?? "");
    setLat(String(candidate.latitude));
    setLng(String(candidate.longitude));

    setFailed(null);
    setNotice(
      candidate.postalCode === null
        ? "좌표를 채웠습니다. 그 주소에는 우편번호가 없습니다. 저장을 눌러야 남습니다."
        : "좌표와 우편번호를 채웠습니다. 저장을 눌러야 남습니다.",
    );
  }

  /**
   * 이름으로 고른 뒤 **모자란 주소를 한 번 더 물어 채운다.**
   * (2026-09-25, 사용자가 찾음)
   *
   * 왜 필요한가
   *   `대경베일리`로 찾으면 도로명 주소가 안 온다. 카카오가 그 장소에
   *   도로명 주소를 안 가지고 있다. **그리고 우편번호는 이름으로 찾는
   *   응답에 아예 없다.**
   *
   *   그래서 사용자가 도로명 주소를 손으로 적고 `주소로 찾기`를 한 번 더
   *   눌러야 했다. **그런데 이름으로 찾는 사람은 주소를 모른다.** 알면
   *   처음부터 주소로 찾았을 것이다. 순서가 뒤집혀 있었다.
   *
   * 무엇으로 묻는가
   *   방금 받은 지번 주소다. `대경베일리`에는 그것이 있다. 지번으로 물으면
   *   카카오가 도로명과 우편번호를 함께 돌려준다.
   *
   * **좌표는 건드리지 않는다**
   *   장소 검색이 준 좌표가 그 가게의 자리이고, 주소 검색이 주는 것은
   *   그 주소의 대표 자리다. 건물이 크면 다르다. 도로명 하나 채우자고
   *   더 정확한 좌표를 덮지 않는다.
   *
   * **하나일 때만 저절로 채운다**
   *   여럿이면 우리가 고르지 않는다. 목록을 띄워 사람이 고르게 한다.
   *   이 저장소가 처음부터 지켜온 방식이다. (15-E)
   *
   * 실패해도 고른 것은 그대로다. 주소를 못 채우는 것은 장소를 담지 못할
   * 이유가 아니다.
   */
  async function fillMissingAddress(candidate: PlaceCandidate) {
    const query = (candidate.roadAddress ?? candidate.address ?? "").trim();

    // 물어볼 주소가 없으면 더 할 수 있는 것이 없다.
    if (query === "") {
      setNotice(
        "카카오맵에서 가져온 값으로 채웠습니다. 그 곳에는 주소가 없습니다. 저장을 눌러야 남습니다.",
      );

      return;
    }

    const result = await findAddresses(query);

    if (!result.ok || result.candidates.length === 0) {
      setNotice(
        "카카오맵에서 가져온 값으로 채웠습니다. 도로명 주소와 우편번호는 찾지 못했습니다. 저장을 눌러야 남습니다.",
      );

      return;
    }

    if (result.candidates.length > 1) {
      setFound({ kind: "address", items: result.candidates });
      setNotice(
        "카카오맵에서 가져온 값으로 채웠습니다. 도로명 주소 후보가 여럿이라 아래에 늘어놓았습니다. 맞는 것을 눌러 주세요.",
      );

      return;
    }

    const [only] = result.candidates;

    // 이미 있는 것을 덮지 않는다. 모자란 것만 채운다.
    if (candidate.roadAddress === null && only.roadAddress !== null) {
      setRoadAddress(only.roadAddress);
    }

    if (only.postalCode !== null) {
      setPostal(only.postalCode);
    }

    setNotice(
      only.postalCode === null
        ? "카카오맵에서 가져온 값으로 채웠습니다. 그 주소에는 우편번호가 없습니다. 저장을 눌러야 남습니다."
        : "카카오맵에서 가져온 값으로 채웠습니다. 도로명 주소와 우편번호도 함께 채웠습니다. 저장을 눌러야 남습니다.",
    );
  }

  function choose(candidate: PlaceCandidate) {
    /*
      **고른 것의 값으로 바꾼다.** 후보를 누른 것이 곧 "이 장소가 맞다"는
      뜻이다. 빈 칸만 채우게 두면 한 곳을 담은 뒤 다른 곳으로 바꿀 수 없다.
      음악에서 겪은 고장이다. (`AGENTS.md` 2절)

      **`가봤는지`는 건드리지 않는다.** 그것만 사람이 적은 값이다. 같은 곳을
      다시 골라 주소를 새로 받아오는 일이 흔하고, 그때 `가봤다`가 지워지면
      사용자가 적은 것을 우리가 지우는 셈이다.
    */
    setName(candidate.name.slice(0, MAX_TITLE_LENGTH));
    setProvider("kakao");
    setExternalId(candidate.externalId);
    setRoadAddress(candidate.roadAddress ?? "");
    setAddress(candidate.address ?? "");
    setCategory(candidate.category ?? "");
    setPhone(candidate.phone ?? "");
    /*
      **우편번호는 비운다.** 이름으로 찾는 응답에는 우편번호가 없다.
      앞서 주소로 찾아 채워둔 값을 그대로 두면, 다른 장소를 고른 뒤에도
      **옛 장소의 우편번호가 남는다.** 틀린 값이 조용히 붙어 있는 쪽이
      비어 있는 것보다 나쁘다.

      바로 아래에서 다시 물어 채운다.
    */
    setPostal("");
    setPlaceUrl(candidate.placeUrl ?? "");
    setLat(String(candidate.latitude));
    setLng(String(candidate.longitude));

    setFailed(null);
    setNotice("카카오맵에서 가져온 값으로 채웠습니다. 주소를 마저 찾는 중…");

    /*
      **찾아오는 동안 단추가 잠긴다.** 그 사이에 다른 후보를 누르면 두
      요청의 답이 순서 없이 돌아와, 늦게 온 쪽이 먼저 고른 장소의 칸을
      덮는다. 오류는 나지 않는다.
    */
    startBusy(async () => {
      await fillMissingAddress(candidate);
    });
  }

  const hasPair = lat !== "" && lng !== "";
  const latNumber = Number(lat);
  const lngNumber = Number(lng);
  const canLink =
    hasPair && Number.isFinite(latNumber) && Number.isFinite(lngNumber);

  const shownCategory = categoryLabel(category);
  const providerLabel = getPlaceProviderLabel(provider);

  return (
    <Panel
      title="장소"
      help="place"
      helpLabel="장소"
      hint="이름으로 찾아 고르면 주소와 좌표가 채워집니다. 지도는 카카오맵·구글 지도로 열립니다. 저장을 눌러야 남습니다."
    >
      <form action={savePlace} className="flex flex-col gap-4">
        <input type="hidden" name="sourceId" value={sourceId} />
        <input type="hidden" name="returnTo" value={returnTo} />
        <input type="hidden" name="provider" value={provider} />
        <input type="hidden" name="externalId" value={externalId} />
        <input type="hidden" name="category" value={category} />
        <input type="hidden" name="postalCode" value={postal} />
        <input type="hidden" name="phone" value={phone} />
        <input type="hidden" name="placeUrl" value={placeUrl} />

        {/* 이름 칸이 곧 검색어다. 값이 하나면 어긋날 자리가 없다. */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            장소 이름
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <input
              name="title"
              type="text"
              required
              maxLength={MAX_TITLE_LENGTH}
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
            <button
              type="button"
              onClick={search}
              disabled={busy}
              className="h-10 shrink-0 whitespace-nowrap rounded-full border border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
            >
              {busy ? "찾는 중…" : "찾기"}
            </button>
          </div>
        </label>

        {failed ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm leading-6 text-red-800 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
          >
            {failed}
          </p>
        ) : null}

        {notice ? (
          <p className="rounded-lg bg-zinc-50 px-3 py-2 text-xs leading-5 text-zinc-600 dark:bg-white/[.04] dark:text-zinc-400">
            {notice}
          </p>
        ) : null}

        {/*
          후보 목록. **고른 뒤에도 감추지 않는다.**

          분류와 주소를 함께 보여준다. `경복궁`을 물으면 궁, 주차장,
          지하철역, 다이소가 함께 오는데 **이름만으로는 고를 수 없다.**
        */}
        {found?.kind === "place" && found.items.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {found.items.map((candidate) => {
              const chosen = externalId === candidate.externalId;
              const kind = categoryLabel(candidate.category);

              return (
                <li key={candidate.externalId}>
                  <button
                    type="button"
                    onClick={() => choose(candidate)}
                    disabled={busy}
                    className={`flex w-full flex-col gap-1 rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${
                      chosen
                        ? "border-accent bg-accent-soft dark:border-accent-dark dark:bg-accent-dark-soft"
                        : "border-black/[.08] hover:bg-black/[.03] dark:border-white/[.145] dark:hover:bg-white/[.06]"
                    }`}
                  >
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-sm text-black dark:text-zinc-50">
                        {candidate.name}
                      </span>
                      {/*
                        **분류가 같은 이름을 가른다.** 이것이 없으면
                        `경복궁`과 `경복궁 주차장`과 `다이소 경복궁역점`이
                        한 줄씩 나란히 있는데 무엇이 무엇인지 알 수 없다.
                      */}
                      {kind ? (
                        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-white/[.08] dark:text-zinc-400">
                          {kind}
                        </span>
                      ) : null}
                      {chosen ? (
                        <span className="shrink-0 text-[11px] text-accent dark:text-accent-dark">
                          고름
                        </span>
                      ) : null}
                    </span>

                    {/*
                      주소를 **둘 다** 보여준다. (2026-09-25, 사용자가 찾음)

                      처음에는 있는 쪽 하나만 보여줬다. 그러니 고른 뒤에
                      `도로명 주소` 칸이 비어 있을 때 **왜 비었는지 알 수가
                      없었다.** 눌러야 채워지는 것을 몰랐는지, 그 장소에
                      도로명 주소가 없는 것인지 화면이 말해주지 않았다.

                      카카오는 도로명 주소가 없는 곳에 빈 글자를 준다.
                      궁 안의 건물, 행사, 새로 생긴 가게가 그렇다. 그럴 때는
                      **없다고 적는다.** 빈 자리는 고장처럼 보인다.
                    */}
                    <span className="flex flex-col gap-0.5 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                      <span className="flex gap-1.5">
                        <span className="shrink-0 text-zinc-400">도로명</span>
                        {candidate.roadAddress ? (
                          <span>{candidate.roadAddress}</span>
                        ) : (
                          <span className="text-zinc-400">없음</span>
                        )}
                      </span>

                      {candidate.address ? (
                        <span className="flex gap-1.5">
                          <span className="shrink-0 text-zinc-400">지번</span>
                          <span>{candidate.address}</span>
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        {/*
          주소로 찾은 후보. **이름이 없다.**

          주소 검색은 장소가 아니라 주소를 돌려준다. 그래서 상호명 자리에
          도로명 주소를 놓고, 우편번호를 꼬리표로 붙인다. 우편번호가 이
          길에서만 오는 값이라 **그것이 보여야 무엇이 달라지는지 안다.**
        */}
        {found?.kind === "address" && found.items.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {found.items.map((candidate) => {
              const chosen =
                lat === String(candidate.latitude) &&
                lng === String(candidate.longitude);

              return (
                <li
                  key={`${candidate.latitude},${candidate.longitude},${candidate.roadAddress ?? candidate.address}`}
                >
                  <button
                    type="button"
                    onClick={() => chooseAddress(candidate)}
                    disabled={busy}
                    className={`flex w-full flex-col gap-1 rounded-xl border p-3 text-left transition-colors disabled:opacity-50 ${
                      chosen
                        ? "border-accent bg-accent-soft dark:border-accent-dark dark:bg-accent-dark-soft"
                        : "border-black/[.08] hover:bg-black/[.03] dark:border-white/[.145] dark:hover:bg-white/[.06]"
                    }`}
                  >
                    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                      <span className="text-sm text-black dark:text-zinc-50">
                        {candidate.roadAddress ?? candidate.address}
                      </span>
                      {candidate.postalCode ? (
                        <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] text-zinc-600 dark:bg-white/[.08] dark:text-zinc-400">
                          {candidate.postalCode}
                        </span>
                      ) : null}
                      {chosen ? (
                        <span className="shrink-0 text-[11px] text-accent dark:text-accent-dark">
                          고름
                        </span>
                      ) : null}
                    </span>

                    {candidate.roadAddress && candidate.address ? (
                      <span className="flex gap-1.5 text-xs leading-5 text-zinc-600 dark:text-zinc-400">
                        <span className="shrink-0 text-zinc-400">지번</span>
                        <span>{candidate.address}</span>
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            왜 담았는지
          </span>
          <textarea
            name="description"
            rows={3}
            maxLength={5000}
            value={why}
            onChange={(event) => setWhy(event.target.value)}
            placeholder="답사 후보, 소설의 배경, 가족 여행 때 들를 곳처럼 적어둡니다."
            className="w-full rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-7 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
        </label>

        {/*
          주소는 고칠 수 있는 칸으로 둔다.

          찾아온 값이라도 **해외 장소는 손으로 적어야 한다.** 1단계에서는
          국내만 찾아오므로, 이 칸이 잠겨 있으면 해외 장소를 아예 담을 수
          없다. (17-1.3절)
        */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              도로명 주소
            </span>
            <input
              name="roadAddress"
              type="text"
              maxLength={500}
              value={roadAddress}
              onChange={(event) => setRoadAddress(event.target.value)}
              placeholder="후보를 눌러야 채워집니다"
              className="h-10 w-full min-w-0 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </label>

          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              지번 주소
            </span>
            <input
              name="address"
              type="text"
              maxLength={500}
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              placeholder="해외 장소는 여기에 적어도 됩니다"
              className="h-10 w-full min-w-0 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </label>
        </div>

        {/*
          주소로 찾기. (2026-09-25, 사용자 요청)

          **이름이 틀렸을 때 쓰는 길이다.** 상호명이 부정확해도 어디쯤인지는
          보통 안다. 우편번호도 이 길에서만 온다. (17-1.3절)

          단추를 주소 칸 바로 아래에 둔다. **찾는 칸을 따로 만들지 않는다.**
          적는 칸이 곧 찾는 말이다. 음악에서 칸을 둘로 나눴다가 값이 두
          벌이 되어 어긋났다.
        */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={searchByAddress}
            disabled={busy}
            className="h-10 shrink-0 whitespace-nowrap rounded-full border border-black/[.08] px-4 text-sm font-medium text-black transition-colors hover:bg-black/[.04] disabled:opacity-50 dark:border-white/[.145] dark:text-zinc-50 dark:hover:bg-white/[.06]"
          >
            {busy ? "찾는 중…" : "주소로 찾기"}
          </button>

          <span className="text-xs leading-5 text-zinc-500">
            위에 적은 주소로 좌표와 우편번호를 찾습니다. 가게 이름이 정확하지
            않을 때 쓰세요. 자료 제목은 바뀌지 않습니다.
          </span>
        </div>

        {/*
          좌표.

          **짝으로만 뜻이 있다.** 한쪽만 적으면 저장이 거절된다. 그 까닭을
          칸 아래에 미리 적어 둔다. 거절된 뒤에 읽는 것보다 낫다.
        */}
        <div className="flex flex-col gap-4 sm:flex-row">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              위도
            </span>
            <input
              name="latitude"
              type="text"
              inputMode="decimal"
              value={lat}
              onChange={(event) => setLat(event.target.value)}
              placeholder="37.579617"
              className="h-10 w-full min-w-0 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </label>

          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              경도
            </span>
            <input
              name="longitude"
              type="text"
              inputMode="decimal"
              value={lng}
              onChange={(event) => setLng(event.target.value)}
              placeholder="126.976889"
              className="h-10 w-full min-w-0 rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
            />
          </label>
        </div>

        <p className="text-xs leading-5 text-zinc-500">
          좌표는 둘 다 적거나 둘 다 비워 주세요. 하나만 있으면 지도 링크가
          엉뚱한 곳을 엽니다. 찾아 고르면 알아서 채워집니다.
        </p>

        {/*
          가봤는가.

          **안 정함이 기본이고 되돌릴 수 있다.** 수업 준비에는 이 구분이
          쓸모없을 수 있어서, 고르지 않으면 화면에 아무것도 보이지 않는다.
          (17-1.5절)
        */}
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            가봤는지
          </span>
          <select
            name="visitStatus"
            value={visitStatus}
            onChange={(event) => setVisitStatus(event.target.value)}
            className="h-10 w-full rounded-lg border border-black/[.08] bg-white px-3 text-sm text-black sm:w-56 dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          >
            {/* 빈 값이 뜻을 가진다. `가보고 싶다`와 다르다. */}
            <option value="">안 정함</option>
            {PLACE_VISIT_STATUSES.map((status) => (
              <option key={status} value={status}>
                {getPlaceVisitStatusLabel(status)}
              </option>
            ))}
          </select>
        </label>

        {/*
          찾아온 값 중 사람이 고칠 일이 없는 것은 읽기만 보여준다.
          칸으로 두면 고쳐도 되는 값처럼 보이고, 실제로 고치면 카카오가
          말한 것과 우리가 적어둔 것이 어긋난다.
        */}
        <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-xl bg-zinc-50 px-4 py-3 text-xs dark:bg-white/[.04]">
          <div className="flex gap-2">
            <dt className="text-zinc-500">분류</dt>
            <dd className="text-zinc-800 dark:text-zinc-200">
              {shownCategory ?? "없음"}
            </dd>
          </div>

          {/*
            우편번호. **이름으로 찾으면 비어 있는 것이 정상이다.**
            카카오의 키워드 검색 응답에 그 값이 없다. 그래서 `없음`이 아니라
            어디서 오는 값인지를 적는다. 빈 자리는 고장처럼 보인다.
          */}
          <div className="flex gap-2">
            <dt className="text-zinc-500">우편번호</dt>
            <dd className="text-zinc-800 dark:text-zinc-200">
              {postal === "" ? "주소로 찾으면 채워집니다" : postal}
            </dd>
          </div>

          <div className="flex gap-2">
            <dt className="text-zinc-500">전화</dt>
            <dd className="text-zinc-800 dark:text-zinc-200">
              {phone === "" ? "없음" : phone}
            </dd>
          </div>

          <div className="flex gap-2">
            <dt className="text-zinc-500">어디서</dt>
            <dd className="text-zinc-800 dark:text-zinc-200">
              {providerLabel ?? "직접 적음"}
            </dd>
          </div>

          {profile?.fetchedAt ? (
            <div className="flex gap-2">
              <dt className="text-zinc-500">받아온 때</dt>
              <dd className="text-zinc-800 dark:text-zinc-200">
                {profile.fetchedAt.slice(0, 10)}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="h-10 shrink-0 whitespace-nowrap rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            저장
          </button>

          {/*
            지도로 가는 링크. (17-1.2절)

            **좌표가 있을 때만 보여준다.** 좌표 없이 이름으로 보내면 같은
            이름의 다른 곳이 열린다. 없는데 단추를 두면 눌러보고 나서야
            안 되는 것을 알게 된다.

            둘을 나란히 둔다. 구글 지도는 한국에서 길찾기가 안 되고, 카카오맵은
            해외가 부실하다. **어느 쪽이 나은지는 그 장소가 어디인지에
            달렸으므로 사용자가 고른다.** (17-1.3절)
          */}
          {canLink ? (
            <>
              <a
                href={kakaoMapUrl(latNumber, lngNumber, name)}
                target="_blank"
                rel="noreferrer noopener"
                className="text-sm text-zinc-600 underline underline-offset-4 transition-colors hover:text-accent dark:text-zinc-400 dark:hover:text-accent-dark"
              >
                카카오맵에서 보기 →
              </a>

              <a
                href={googleMapsUrl(latNumber, lngNumber)}
                target="_blank"
                rel="noreferrer noopener"
                className="text-sm text-zinc-600 underline underline-offset-4 transition-colors hover:text-accent dark:text-zinc-400 dark:hover:text-accent-dark"
              >
                구글 지도에서 보기 →
              </a>
            </>
          ) : (
            <span className="text-xs text-zinc-500">
              좌표를 채우면 지도로 가는 링크가 생깁니다.
            </span>
          )}
        </div>

        {/*
          어디서 온 값인지 밝힌다.

          **`출처 표기` 화면으로 보내지 않는다.** 그 화면에는 TMDB와
          JustWatch만 있다. 그 둘은 쓰는 조건으로 표기하기로 한 곳이고,
          Kakao는 그 목록에 없다. **없는 곳으로 링크를 걸면 눌러본 사람이
          찾지 못한다.** 책 찾기도 같은 방식으로 이름만 밝힌다.

          Kakao가 형식을 갖춘 표기를 요구하는지는 확인하지 않았다. 요구한다면
          `legal/attribution.ts`에 더하고 이 자리에서 그 화면으로 보낸다.
        */}
        {provider === "kakao" ? (
          <p className="text-xs leading-5 text-zinc-500">
            주소·좌표·분류는 카카오맵에서 가져온 값입니다.
          </p>
        ) : null}
      </form>
    </Panel>
  );
}
