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
    <div className="b-paper flex min-w-0 flex-wrap items-center gap-4 p-4 text-sm">
      <p className="b-hand shrink-0 rounded-field border border-ink bg-apricot px-3 py-1">
        샘플 작품
      </p>
      <div className="min-w-0 flex-1 basis-56">
        <p className="mt-1 text-pretty text-muted-foreground">
          1~3화에 설정 오류를 세 군데 숨겨 뒀어요. 2화에 1곳, 3화에 2곳이에요. 점검 결과에서 원고
          문장과 위키 근거를 <span className="inline-block">같이 확인해 보세요.</span>
        </p>
        <div className="mt-2 flex flex-wrap gap-3">
          {target && (
            <Link
              href={`/works/${workId}/chapters/${target.id}?demo=1`}
              className="b-link underline underline-offset-4"
            >
              <span>{targetPosition}화 점검하기</span>
            </Link>
          )}
          <Link href={`/works/${workId}/wiki`} className="b-link underline underline-offset-4">
            <span>설정 보드 보기</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
