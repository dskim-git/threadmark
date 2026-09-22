"use client";

import { useCallback } from "react";

import { saveReadingPosition } from "../../file-actions";
import { PdfReader } from "./pdf-reader";

/**
 * 뷰어와 "보던 자리 저장"을 잇는 얇은 껍데기.
 *
 * PdfReader는 PDF를 그리는 일만 한다. 서버에 무엇을 저장할지는 모른다.
 * 그 둘을 여기서 잇는다. 뷰어를 다른 곳에서 쓰거나 저장 방식이 바뀌어도
 * 그리는 쪽은 손대지 않아도 된다.
 */
export function ReaderView({
  fileId,
  initialPage,
  initialZoom,
}: {
  fileId: string;
  initialPage: number;
  initialZoom: number | null;
}) {
  // useCallback으로 감싸지 않으면 매번 새 함수가 되어, 뷰어 쪽의
  // "잠시 기다렸다 저장하기"가 계속 초기화된다.
  const handlePositionChange = useCallback(
    (page: number, zoom: number | null) => {
      // 저장 결과를 기다리지 않는다. 실패해도 읽기를 방해하지 않는다.
      void saveReadingPosition({ fileId, page, zoom });
    },
    [fileId],
  );

  return (
    <PdfReader
      fileId={fileId}
      initialPage={initialPage}
      initialZoom={initialZoom}
      onPositionChange={handlePositionChange}
    />
  );
}
