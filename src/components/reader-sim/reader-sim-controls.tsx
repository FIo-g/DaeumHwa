'use client'

import { useRouter } from 'next/navigation'
import { type CSSProperties, useId, useRef, useState } from 'react'
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
  const [tracking, setTracking] = useState(false)
  const pointerStart = useRef<number | null>(null)
  const ai = useAiRun()
  const index = Math.max(
    0,
    chapters.findIndex((chapter) => chapter.id === chapterId),
  )
  const chapter = chapters[index]

  function endTracking() {
    pointerStart.current = null
    setTracking(false)
  }

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
    return <p className="text-sm text-muted-ink">독자 반응을 보려면 먼저 회차를 만들어 주세요.</p>

  const label = chapterLabel(chapter.position, chapter.title)
  const max = chapters.length - 1

  return (
    <section aria-label="독자 반응 실행" className="b-tools-paper grid gap-4">
      <fieldset disabled={ai.running} className="grid min-w-0 gap-3">
        <div className="grid min-w-0 gap-1">
          <label htmlFor={pickerId} className="font-bold">
            회차 선택
          </label>
          <ChapterPicker
            id={pickerId}
            chapters={chapters}
            value={chapter.id}
            onChange={setChapterId}
          />
        </div>
        {max > 0 && (
          <div className="b-tools-range-wrap">
            <div
              className="b-meter b-tools-range-meter"
              aria-hidden="true"
              data-live={tracking}
              style={{ '--b-value': index / max } as CSSProperties}
            >
              <span className="b-meter__fill" />
              <span className="b-tools-range-thumb" />
            </div>
            <input
              type="range"
              className="b-range b-tools-range"
              min={0}
              max={max}
              value={index}
              aria-label="회차 넘기기"
              aria-valuetext={label}
              onPointerDown={(event) => {
                pointerStart.current = event.clientX
              }}
              onPointerMove={(event) => {
                if (
                  pointerStart.current !== null &&
                  Math.abs(event.clientX - pointerStart.current) > 3
                )
                  setTracking(true)
              }}
              onPointerUp={endTracking}
              onPointerCancel={endTracking}
              onPointerLeave={endTracking}
              onLostPointerCapture={endTracking}
              onBlur={endTracking}
              onChange={(event) => setChapterId(chapters[event.currentTarget.valueAsNumber].id)}
            />
          </div>
        )}
        <fieldset className="flex min-w-0 flex-wrap gap-2">
          <legend className="mb-2 font-bold">독자 선택</legend>
          {personas.map((persona) => (
            <label key={persona.id} className="b-tools-persona-chip">
              <input
                type="checkbox"
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
        </fieldset>
      </fieldset>
      <div>
        {ai.running ? (
          <div className="b-tools-running">
            <span className="b-tools-working-papers" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <AiRunStatus
              label="독자 반응 보는 중"
              elapsedSec={ai.elapsedSec}
              onCancel={ai.cancel}
            />
          </div>
        ) : (
          <PopButton onClick={() => void run()} disabled={selected.length === 0}>
            독자 반응 보기
          </PopButton>
        )}
      </div>
    </section>
  )
}
