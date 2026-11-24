'use client'

import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { AiRunStatus } from '@/components/app/ai-run-status'
import { ChapterPicker } from '@/components/app/chapter-picker'
import { PopButton } from '@/components/motion'
import type { ReaderSimResult } from '@/ai/tasks/reader-sim'
import { postAction } from '@/lib/client/post-json'
import { runAction } from '@/lib/client/run-action'
import { useAiRun } from '@/lib/client/use-ai-run'
import { chapterLabel } from '@/lib/labels'

type ReaderSimControlsProps = {
  workId: string
  chapters: { id: string; position: number; title: string }[]
  personas: { id: string; name: string }[]
  initialChapter: string | null
}

export function ReaderSimControls({
  workId,
  chapters,
  personas,
  initialChapter,
}: ReaderSimControlsProps) {
  const router = useRouter()
  const pickerId = useId()
  const [chapterId, setChapterId] = useState(initialChapter)
  const [selected, setSelected] = useState(() => personas.map((persona) => persona.id))
  const ai = useAiRun()
  const index = Math.max(
    0,
    chapters.findIndex((chapter) => chapter.id === chapterId),
  )
  const chapter = chapters[index]

  async function run() {
    if (!chapter || selected.length === 0) return
    const result = await ai.run((signal) =>
      runAction(
        postAction<{ runId: string; result: ReaderSimResult }>(
          `/api/works/${workId}/chapters/${chapter.id}/reader-sim`,
          { personaIds: selected },
          { signal },
        ),
      ),
    )
    if (result) router.refresh()
  }

  if (!chapter)
    return (
      <p className="wg-advice-question b-ruled">독자 반응을 보려면 먼저 회차를 만들어 주세요.</p>
    )

  const label = chapterLabel(chapter.position, chapter.title)
  const max = chapters.length - 1

  return (
    <section aria-label="독자 반응 실행" className="wg-advice-controls">
      <fieldset disabled={ai.running} className="wg-advice-fields">
        <div className="wg-advice-chapter">
          <label htmlFor={pickerId} className="b-label wg-advice-caption font-medium">
            회차 선택
          </label>
          <ChapterPicker
            id={pickerId}
            chapters={chapters}
            value={chapter.id}
            onChange={setChapterId}
          />
          {max > 0 && (
            <input
              type="range"
              className="b-range wg-advice-range"
              min={0}
              max={max}
              value={index}
              aria-label="회차 넘기기"
              aria-valuetext={label}
              onChange={(event) => setChapterId(chapters[event.currentTarget.valueAsNumber].id)}
            />
          )}
        </div>
        <fieldset className="min-w-0">
          <legend className="b-label wg-advice-caption mb-2 font-medium">독자 선택</legend>
          <div className="wg-advice-personas">
            {personas.map((persona) => (
              <label key={persona.id} className="wg-advice-persona">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={selected.includes(persona.id)}
                  onChange={({ currentTarget }) => {
                    const checked = currentTarget.checked
                    setSelected((prev) =>
                      checked ? [...prev, persona.id] : prev.filter((id) => id !== persona.id),
                    )
                  }}
                />
                {persona.name}
              </label>
            ))}
          </div>
        </fieldset>
      </fieldset>
      <div>
        {ai.running ? (
          <AiRunStatus label="독자 반응 보는 중" elapsedSec={ai.elapsedSec} onCancel={ai.cancel} />
        ) : (
          <PopButton onClick={() => void run()} disabled={selected.length === 0}>
            독자 반응 보기
          </PopButton>
        )}
      </div>
    </section>
  )
}
