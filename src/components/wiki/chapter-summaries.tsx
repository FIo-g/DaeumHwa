'use client'

import type { CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { EmptyState } from '@/components/app/empty-state'
import { useReplay } from '@/components/motion'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { runAction } from '@/lib/client/run-action'
import { stripEpisodePrefix } from '@/lib/labels'
import { setChapterSummaryAction } from '@/server/actions/chapters'

export type ChapterSummaryItem = {
  id: string
  position: number
  title: string
  summary: string
}

type ChapterSummariesProps = {
  chapters: ChapterSummaryItem[]
  canEdit: boolean
}

/** Approved summary of each chapter. Editors save; viewers read. */
export function ChapterSummaries({ chapters, canEdit }: ChapterSummariesProps) {
  if (chapters.length === 0) {
    return (
      <EmptyState
        title="아직 회차가 없어요."
        description="요약은 회차가 생긴 뒤에 적을 수 있어요."
      />
    )
  }
  return (
    <ul className="wg-wiki-tabs-list">
      {chapters.map((chapter, index) => (
        <li
          key={chapter.id}
          className="wg-wiki-tabs-row wg-wiki-tabs-summary"
          tabIndex={0}
          style={{ '--wg-wiki-tabs-order': Math.min(index, 2) } as CSSProperties}
        >
          <span className="wg-wiki-tabs-number" aria-hidden="true" />
          <ChapterSummaryRow chapter={chapter} canEdit={canEdit} />
        </li>
      ))}
    </ul>
  )
}

function ChapterSummaryRow({
  chapter,
  canEdit,
}: {
  chapter: ChapterSummaryItem
  canEdit: boolean
}) {
  const router = useRouter()
  const title = stripEpisodePrefix(chapter.title, chapter.position)
  const { replayKey, replay } = useReplay()
  const [saved, setSaved] = useState(chapter.summary)
  const [draft, setDraft] = useState(chapter.summary)
  const [pending, setPending] = useState(false)
  const dirty = draft !== saved

  async function save() {
    setPending(true)
    const result = await runAction(
      setChapterSummaryAction({ chapterId: chapter.id, summary: draft.trim() }),
      { success: '요약을 저장했어요.' },
    )
    setPending(false)
    if (result) {
      setSaved(draft.trim())
      setDraft(draft.trim())
      replay()
      router.refresh()
    }
  }

  const chapterName = (
    <>
      <span className="font-mono text-sm">{chapter.position}화</span>
      {title && (
        <>
          {' '}
          <span className="font-heading text-base font-bold">{title}</span>
        </>
      )}
    </>
  )

  if (!canEdit) {
    return (
      <>
        <p className="wg-wiki-tabs-chapter wg-wiki-tabs-write">{chapterName}</p>
        <p className="wg-wiki-tabs-summary-copy b-manuscript wg-wiki-tabs-write">
          {saved || <span className="b-label b-muted">요약이 없어요</span>}
        </p>
      </>
    )
  }

  return (
    <>
      <Label className="wg-wiki-tabs-chapter wg-wiki-tabs-write" htmlFor={`summary-${chapter.id}`}>
        {chapterName} <span className="b-muted">요약</span>
      </Label>
      <div className="wg-wiki-tabs-summary-edit">
        <Textarea
          className="font-heading"
          id={`summary-${chapter.id}`}
          rows={3}
          maxLength={2000}
          placeholder="이 회차에서 일어난 일을 짧게 적어 주세요."
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!saved && <span className="b-label b-muted mr-auto">요약이 없어요</span>}
          <Button type="button" size="sm" disabled={!dirty || pending} onClick={save}>
            요약 저장
          </Button>
        </div>
        {replayKey > 0 && (
          <span key={replayKey} className="wg-wiki-tabs-summary-ink" aria-hidden="true" />
        )}
      </div>
    </>
  )
}
