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
 * **녹음 파일마다 한 칸이다.** (2026-10-05, 사용자가 찾음)
 *
 * 처음에는 자료 하나에 한 칸이었고, 그래서 **한 자료에 녹음이 여럿일 때
 * 첫 번째 것에만 전사문이 붙었다.** 두 번째에 적으면 첫 번째 것이 덮였고
 * 오류는 나지 않았다. 적은 사람은 앞의 것이 사라진 줄 몰랐다.
 *
 * 블루프린트 17-V.2절이 그 전제와 나갈 길을 함께 적어 두었다. **적어둔
 * 덕에 무엇을 해야 하는지 다시 생각하지 않았다.**
 *
 * **전사문은 직접 적는다.** 말을 자동으로 글로 바꿔 주지 않는다. 그러려면
 * 그 일을 하는 다른 회사의 서비스를 연결해야 하고, 밖으로 녹음을 보내는
 * 일이라 아직 하지 않았다. (17-V.6절)
 *
 * **지우는 단추를 두지 않는다.** 표에 삭제 표시가 없어서 지우면 되살릴 수
 * 없다. 권한과 정책에서도 막혀 있다. 비우고 저장하면 글만 비워진다.
 */

export type AudioFile = {
  id: string;
  fileName: string;
  checksum: string | null;
};

export function AudioPanel({
  sourceId,
  files,
  profiles,
  returnTo,
}: {
  sourceId: string;
  /** 이 자료에 붙은 음성 파일 **전부.** 올린 차례대로다. */
  files: readonly AudioFile[];
  /** 파일 번호로 찾는 전사문. 아직 적지 않은 파일은 없다. */
  profiles: ReadonlyMap<string, AudioProfile>;
  returnTo: string;
}) {
  const editing = useSourceEditing();

  return (
    <Panel
      title="음성"
      help="audio-listen"
      helpLabel="음성 메모"
      hint={
        editing
          ? "들으면서 직접 옮겨 적는 칸입니다. 말을 자동으로 글로 바꿔 주지는 않습니다. 적어둔 글은 검색으로 찾을 수 있고, 공개되지는 않습니다."
          : undefined
      }
    >
      {/*
        **붙은 녹음이 없어도 칸은 남는다.** (2026-10-05, 사용자가 정함)

        처음에는 칸째로 숨겼는데, 그러면 **무엇을 담는 자리인지 알 길이
        없다.** 비었다는 말 한 줄이 그 칸의 내용이다. 다른 칸들과 같다.
      */}
      {files.length === 0 ? (
        <p className="text-sm leading-6 text-zinc-500">
          이 자료에 붙은 녹음이 없습니다. 아래 `파일` 칸에서 녹음을 올리거나
          `녹음하기`로 바로 녹음할 수 있습니다.
        </p>
      ) : null}

      {files.map((file) => (
        <AudioFileSection
          key={file.id}
          sourceId={sourceId}
          file={file}
          profile={profiles.get(file.id) ?? null}
          returnTo={returnTo}
          editing={editing}
          /*
            녹음이 하나뿐이면 파일 이름을 머리말로 내걸지 않는다.
            칸 이름이 이미 `음성`이고, 한 줄이 더 생길 뿐이다.
          */
          showName={files.length > 1}
        />
      ))}
    </Panel>
  );
}

/**
 * 녹음 하나의 전사문.
 *
 * **상태를 파일마다 따로 든다.** 한 곳에서 모아 들면 파일을 바꿀 때마다
 * 적던 글이 섞인다. 기록 카드가 카드마다 따로 접히는 것과 같은 생각이다.
 */
function AudioFileSection({
  sourceId,
  file,
  profile,
  returnTo,
  editing,
  showName,
}: {
  sourceId: string;
  file: AudioFile;
  profile: AudioProfile | null;
  returnTo: string;
  editing: boolean;
  showName: boolean;
}) {
  const [transcript, setTranscript] = useState(profile?.transcript ?? "");
  const [voiceScope, setVoiceScope] = useState<string>(
    profile?.voiceScope ?? "",
  );

  /*
    전사문을 적은 뒤에 파일이 교체되었는가. (설계 문서 9.2절)

    **오류가 나지 않는 자리다.** 글은 그대로 있고 가리키는 녹음만 달라진다.
    둘 중 하나라도 모르면 아무 말도 하지 않는다. 틀린 경고는 사람이 멀쩡한
    글을 지우게 만든다.
  */
  const stale =
    profile !== null &&
    transcriptIsStale({
      storedChecksum: profile.transcriptChecksum,
      fileChecksum: file.checksum,
    });

  const heading = showName ? (
    <h3
      title={file.fileName}
      className="truncate text-xs font-medium text-zinc-600 dark:text-zinc-400"
    >
      {file.fileName}
    </h3>
  ) : null;

  const staleNotice = stale ? (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-200">
      이 전사문을 적은 뒤에 <strong>녹음 파일이 바뀌었습니다.</strong> 지금
      붙어 있는 녹음과 맞는지 확인해 주세요. 적어둔 글은 그대로 있습니다.
    </p>
  ) : null;

  if (!editing) {
    return (
      <section className="flex flex-col gap-2">
        {heading}
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
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-black/[.06] p-4 dark:border-white/[.1]">
      {heading}
      {staleNotice}

      <form action={saveAudioProfile} className="flex flex-col gap-4">
        <input type="hidden" name="sourceId" value={sourceId} />
        <input type="hidden" name="returnTo" value={returnTo} />

        {/*
          **어느 녹음의 전사문인지.** 이 값이 줄을 가린다. (2026-10-05)
          파일마다 한 줄이라, 이것이 없으면 담을 자리를 찾을 수 없다.
        */}
        <input type="hidden" name="sourceFileId" value={file.id} />
        <input type="hidden" name="fileChecksum" value={file.checksum ?? ""} />

        {/*
          길이는 녹음할 때 담긴다. 여기서 손으로 고치게 하지 않는다.
          **사람이 아는 값이 아니고**, 틀리게 적으면 그만큼 거짓이 남는다.
        */}
        <input
          type="hidden"
          name="durationSeconds"
          value={profile?.durationSeconds ?? ""}
        />

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
            누구의 목소리인가
          </span>

          {/*
            **고르는 자리에 동의를 붙여 둔다.** (17-V.5절) 안내문을 따로
            띄우는 것보다 고르는 그 순간에 붙어 있는 편이 읽힌다.

            비워둘 수 있다. 혼자 쓰는 녹음에는 이 구분이 쓸모없을 수 있다.
            다만 **비어 있으면 나중에도 공개할 수 없다.**
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
            전사문은 공개되지 않습니다.
          </span>
        </div>
      </form>
    </section>
  );
}
