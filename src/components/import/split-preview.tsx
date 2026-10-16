'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { SplitChapter, SplitMethod } from '@/lib/import/split'
import { countChars } from '@/lib/korean/chars'

// The service accepts at most this many chapters in one import job.
const MAX_CHAPTERS = 2000

const METHOD_LABEL: Record<SplitMethod, string> = {
  headings: '제목 패턴',
  separators: '구분선',
  size: '분량',
  single: '한 덩어리',
}

export type DraftChapter = { id: string; title: string; body: string }

type SplitPreviewProps = {
  method: SplitMethod
  initial: SplitChapter[]
  onBack: () => void
  onConfirm: (chapters: DraftChapter[]) => void
  busy?: boolean
}

/** Step 2 of the import: the split chapters with title edits, merge and exclude, before upload. */
export function SplitPreview({
  method,
  initial,
  onBack,
  onConfirm,
  busy = false,
}: SplitPreviewProps) {
  const [chapters, setChapters] = useState<DraftChapter[]>(() =>
    initial.map((chapter, index) => ({
      id: `chapter-${index}`,
      title: chapter.title,
      body: chapter.body,
    })),
  )

  function setTitle(id: string, title: string) {
    setChapters((prev) => prev.map((c) => (c.id === id ? { ...c, title } : c)))
  }

  function exclude(id: string) {
    setChapters((prev) => prev.filter((c) => c.id !== id))
  }

  /** Appends this chapter's body to the one before it and keeps the earlier title. */
  function mergeWithPrevious(id: string) {
    setChapters((prev) => {
      const index = prev.findIndex((c) => c.id === id)
      if (index <= 0) return prev
      const previous = prev[index - 1]
      const merged: DraftChapter = {
        ...previous,
        body: `${previous.body}\n\n${prev[index].body}`,
      }
      return [...prev.slice(0, index - 1), merged, ...prev.slice(index + 1)]
    })
  }

  const total = chapters.length
  const tooMany = total > MAX_CHAPTERS

  return (
    <section aria-label="회차 나누기 미리보기" className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{`나눈 방식: ${METHOD_LABEL[method]}`}</p>
      <p className="text-sm font-medium">
        {`${total}화를 가져옵니다. 회차마다 AI 호출이 1번씩 일어납니다.`}
      </p>

      {total === 0 && <p className="text-sm text-muted-foreground">가져올 회차가 없습니다.</p>}

      <ol className="flex flex-col gap-3">
        {chapters.map((chapter, index) => (
          <li key={chapter.id} className="grid gap-2 rounded-lg border p-3">
            <div className="flex items-center gap-2">
              <Input
                aria-label={`${index + 1}번째 회차 제목`}
                value={chapter.title}
                maxLength={200}
                onChange={(event) => setTitle(chapter.id, event.target.value)}
              />
              <span className="shrink-0 text-xs text-muted-foreground">
                {`${countChars(chapter.body).withSpaces}자`}
              </span>
            </div>
            <p className="truncate text-sm text-muted-foreground">{firstLine(chapter.body)}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={index === 0}
                onClick={() => mergeWithPrevious(chapter.id)}
              >
                앞 회차와 합치기
              </Button>
              <Button size="sm" variant="ghost" onClick={() => exclude(chapter.id)}>
                제외
              </Button>
            </div>
          </li>
        ))}
      </ol>

      {tooMany && (
        <p role="alert" className="text-sm text-destructive">
          {`회차는 ${MAX_CHAPTERS}화까지 가져올 수 있습니다. 회차를 합치거나 제외해 주세요.`}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onBack} disabled={busy}>
          파일 다시 고르기
        </Button>
        <Button onClick={() => onConfirm(chapters)} disabled={busy || total === 0 || tooMany}>
          이대로 가져오기
        </Button>
      </div>
    </section>
  )
}

function firstLine(body: string): string {
  return (
    body
      .split('\n')
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ''
  )
}
