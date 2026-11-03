'use client'

import Link from 'next/link'
import { useEffect, useSyncExternalStore } from 'react'
import { isSampleChapter, markSampleChapter } from '@/lib/client/sample-session'

type SampleBannerProps = {
  demo: boolean
  workId: string
  chapterId: string
  chapterPosition: number
  chapters: { id: string; position: number }[]
}

function subscribeNoop(): () => void {
  return () => {}
}

/**
 * Demo guide shown on the sample chapter screen. Points at the other planted chapter.
 *
 * The auto check drops `demo` from the URL, and the re-renders that follow no longer see it, so
 * the banner also stays up for the rest of the tab through the session flag.
 */
export function SampleBanner({
  demo,
  workId,
  chapterId,
  chapterPosition,
  chapters,
}: SampleBannerProps) {
  const stored = useSyncExternalStore(
    subscribeNoop,
    () => isSampleChapter(chapterId),
    () => false,
  )
  const active = demo || stored

  useEffect(() => {
    if (demo) markSampleChapter(chapterId)
  }, [demo, chapterId])

  if (!active) return null

  const targetPosition = chapterPosition === 3 ? 2 : 3
  const target = chapters.find((c) => c.position === targetPosition)
  return (
    <div className="rounded-xl border bg-muted/40 p-4 text-sm">
      <p className="font-medium">샘플 작품</p>
      <p className="mt-1 text-muted-foreground">
        1~3화 원고에 설정 오류 3곳을 심어 두었습니다. 2화에 1곳, 3화에 2곳입니다. 점검 결과에서 원고
        문장과 위키 근거를 나란히 확인해 보세요.
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        {target && (
          <Link
            href={`/works/${workId}/chapters/${target.id}?demo=1`}
            className="underline underline-offset-4"
          >
            {targetPosition}화 점검하기
          </Link>
        )}
        <Link href={`/works/${workId}/wiki`} className="underline underline-offset-4">
          설정 보드 보기
        </Link>
      </div>
    </div>
  )
}
