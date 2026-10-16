'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { runAction } from '@/lib/client/run-action'
import { chapterLabel } from '@/lib/labels'
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
        title="아직 회차가 없습니다."
        description="회차를 만들면 요약을 적을 수 있습니다."
      />
    )
  }
  return (
    <ul className="flex flex-col gap-4">
      {chapters.map((chapter) => (
        <li key={chapter.id}>
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
  const label = chapterLabel(chapter.position, chapter.title)
  const [saved, setSaved] = useState(chapter.summary)
  const [draft, setDraft] = useState(chapter.summary)
  const [pending, setPending] = useState(false)
  const dirty = draft !== saved

  async function save() {
    setPending(true)
    const result = await runAction(
      setChapterSummaryAction({ chapterId: chapter.id, summary: draft.trim() }),
      { success: '요약을 저장했습니다.' },
    )
    setPending(false)
    if (result) {
      setSaved(draft.trim())
      setDraft(draft.trim())
      router.refresh()
    }
  }

  if (!canEdit) {
    return (
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{saved || '요약이 없습니다'}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={`summary-${chapter.id}`}>{`${label} 요약`}</Label>
      <Textarea
        id={`summary-${chapter.id}`}
        rows={3}
        maxLength={2000}
        placeholder="이 회차에서 일어난 일을 짧게 적어 주세요."
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        {!saved && <span className="text-xs text-muted-foreground">요약이 없습니다</span>}
        <Button type="button" size="sm" disabled={!dirty || pending} onClick={save}>
          요약 저장
        </Button>
      </div>
    </div>
  )
}
