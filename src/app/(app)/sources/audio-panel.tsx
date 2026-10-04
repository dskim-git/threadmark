"use client";

import { useState } from "react";

import { Panel } from "@/app/(app)/panel";
import type { AudioProfile } from "@/lib/audio/queries";
import {
  MAX_TRANSCRIPT_LENGTH,
  VOICE_SCOPES,
  getVoiceScopeHint,
  getVoiceScopeLabel,
  transcriptIsStale,
} from "@/lib/audio/transcript";
import { formatPosition } from "@/lib/media/time";

import { saveAudioProfile } from "./audio-actions";
import { RecordedFields } from "./recorded-fields";
import { useSourceEditing } from "./source-editing";

/**
 * 음성 칸. 전사문과 녹음 정보를 보여주고 고친다.
 * (설계 문서 17절, 17-V 4차례, 2026-10-04)
 *
 * > 전사문, AI 요약, 확인 여부를 별도 필드로 둔다.
 *
 * **AI 요약은 아직 없다.** 요약할 거리가 전사문이고, 전사문을 사람이 적는
 * 동안에는 요약할 것이 적다. 그리고 Claude는 소리를 받지 않아 AI 전사가
 * 회사를 하나 더 들이는 일이다. (17-V.6절)
 *
 * **지우는 단추를 두지 않는다.** 표에 삭제 표시가 없어서 지우면 되살릴 수
 * 없다. 권한과 정책에서도 막혀 있다. 비우고 저장하면 글만 비워진다.
 * (17-V.2절)
 *
 * 다른 갈래 칸과 같은 모양이다. 읽을 때는 담긴 것만 보이고, 연필을 누르면
 * 입력칸이 열린다.
 */
export function AudioPanel({
  sourceId,
  profile,
  returnTo,
  file,
}: {
  sourceId: string;
  /** 아직 아무것도 담지 않았으면 null. */
  profile: AudioProfile | null;
  returnTo: string;
  /**
   * 이 자료에 붙은 음성 파일. 없을 수 있다.
   *
   * **전사문이 어느 파일의 것인지 적는 데 쓴다.** 파일이 없으면 적을
   * 자리가 없으므로 그 값을 비워 보낸다.
   */
  file: { id: string; fileName: string; checksum: string | null } | null;
}) {
  const editing = useSourceEditing();

  const [transcript, setTranscript] = useState(profile?.transcript ?? "");
  const [voiceScope, setVoiceScope] = useState(profile?.voiceScope ?? "");

  /*
    전사문을 적은 뒤에 파일이 교체되었는가. (설계 문서 9.2절)

    **오류가 나지 않는 자리다.** 글은 그대로 있고 가리키는 녹음만 달라진다.
    둘 중 하나라도 모르면 아무 말도 하지 않는다. 틀린 경고는 사람이 멀쩡한
    글을 지우게 만든다.
  */
  const stale =
    profile !== null &&
    file !== null &&
    transcriptIsStale({
      storedChecksum: profile.transcriptChecksum,
      fileChecksum: file.checksum,
    });

  const staleNotice = stale ? (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
      이 전사문을 적은 뒤에 <strong>녹음 파일이 바뀌었습니다.</strong> 지금
      붙어 있는 녹음과 맞는지 확인해 주세요. 적어둔 글은 그대로 있습니다.
    </p>
  ) : null;

  if (!editing) {
    return (
      <Panel title="음성" help="audio-listen" helpLabel="음성 메모">
        {staleNotice}

        <RecordedFields
          emptyText="이 녹음에 대해 아직 적어둔 것이 없습니다. 전사문은 들으면서 직접 적는 칸이라, 녹음을 담아도 비어 있습니다."
          fields={[
            {
              label: "길이",
              value:
                profile?.durationSeconds === null ||
                profile?.durationSeconds === undefined
                  ? ""
                  : formatPosition(profile.durationSeconds),
            },
            {
              /*
                **밝히지 않았으면 줄이 생기지 않는다.** `안 밝힘`이라고
                적으면 정해야 할 일처럼 보인다. (`getVoiceScopeLabel`)
              */
              label: "목소리",
              value: getVoiceScopeLabel(profile?.voiceScope),
            },
            {
              label: "전사문",
              value: profile?.transcript,
              // 말을 옮긴 글은 단락이 뜻을 가진다. 붙여 보이면 읽을 수 없다.
              multiline: true,
            },
          ]}
        />
      </Panel>
    );
  }

  return (
    <Panel
      title="음성"
      help="audio-listen"
      helpLabel="음성 메모"
      hint="들으면서 **직접** 옮겨 적는 칸입니다. 말을 자동으로 글로 바꿔 주지는 않습니다. 적어둔 글은 검색으로 찾을 수 있고, 공개되지는 않습니다."
    >
      {staleNotice}

      <form action={saveAudioProfile} className="flex flex-col gap-4">
        <input type="hidden" name="sourceId" value={sourceId} />
        <input type="hidden" name="returnTo" value={returnTo} />

        {/*
          길이는 녹음할 때 담긴다. 여기서 손으로 고치게 하지 않는다.
          **사람이 아는 값이 아니고**, 틀리게 적으면 그만큼 거짓이 남는다.
        */}
        <input
          type="hidden"
          name="durationSeconds"
          value={profile?.durationSeconds ?? ""}
        />

        {/*
          전사문이 어느 파일의 것인지. 파일이 붙어 있을 때만 적는다.
          비어 있으면 서버가 비운 채로 담는다.
        */}
        <input type="hidden" name="sourceFileId" value={file?.id ?? ""} />
        <input type="hidden" name="fileChecksum" value={file?.checksum ?? ""} />

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            누구의 목소리인가
          </span>

          {/*
            **고르는 자리에 동의를 붙여 둔다.** (17-V.5절) 안내문을 따로
            띄우는 것보다 고르는 그 순간에 붙어 있는 편이 읽힌다.

            비워둘 수 있게 한다. 혼자 쓰는 녹음에는 이 구분이 쓸모없을 수
            있다. 다만 **비어 있으면 나중에도 공개할 수 없다.**
          */}
          <div className="flex flex-col gap-2">
            {VOICE_SCOPES.map((scope) => (
              <label key={scope} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="voiceScope"
                  value={scope}
                  checked={voiceScope === scope}
                  onChange={() => setVoiceScope(scope)}
                  className="mt-1"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm text-black dark:text-zinc-50">
                    {getVoiceScopeLabel(scope)}
                  </span>
                  <span className="text-xs leading-5 text-zinc-500">
                    {getVoiceScopeHint(scope)}
                  </span>
                </span>
              </label>
            ))}

            {voiceScope === "" ? null : (
              <button
                type="button"
                onClick={() => setVoiceScope("")}
                className="w-fit text-xs text-zinc-500 underline underline-offset-2 hover:text-black dark:hover:text-zinc-50"
              >
                고른 것 지우기
              </button>
            )}
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            전사문
          </span>
          <textarea
            name="transcript"
            rows={12}
            maxLength={MAX_TRANSCRIPT_LENGTH}
            value={transcript}
            onChange={(event) => setTranscript(event.target.value)}
            placeholder="녹음을 들으면서 직접 옮겨 적습니다. 누가 말했는지를 줄 앞에 적어두면 나중에 읽기 좋습니다."
            className="resize-y rounded-lg border border-black/[.08] bg-white px-3 py-2 text-sm leading-7 text-black dark:border-white/[.145] dark:bg-black dark:text-zinc-50"
          />
          <span className="text-xs text-zinc-500">
            {transcript.length.toLocaleString("ko-KR")} /{" "}
            {MAX_TRANSCRIPT_LENGTH.toLocaleString("ko-KR")}자
            {file === null
              ? " · 이 자료에 붙은 녹음 파일이 없습니다"
              : ` · ${file.fileName}`}
          </span>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="h-10 rounded-full bg-zinc-900 px-5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-black dark:hover:bg-zinc-300"
          >
            저장
          </button>

          {/*
            **지우는 단추를 두지 않는다.** (17-V.2절) 표에 삭제 표시가 없어
            지우면 되살릴 수 없다. 비우고 저장하면 글만 비워진다.
          */}
          <span className="text-xs text-zinc-500">
            전사문은 공개되지 않습니다. 녹음에 다른 분의 목소리가 담겼을 수
            있기 때문입니다.
          </span>
        </div>
      </form>
    </Panel>
  );
}
