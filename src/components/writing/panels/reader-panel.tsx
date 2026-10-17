'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { postAction } from '@/lib/client/post-json'
import { runAction } from '@/lib/client/run-action'
import type { ReaderSimResult } from '@/ai/tasks/reader-sim'
import type { Highlight, WorkspaceApi, WritingData } from '../types'
import { EDITOR_ONLY_NOTE, canEditChapter, rangeOf } from './shared'

type ReaderPanelProps = {
  data: WritingData
  api: WorkspaceApi
  text: string
}

// Same ids and names as READER_PERSONAS in src/ai/personas.ts. Copied here because client code
// must not import the AI runtime.
const PERSONAS = [
  { id: 'reader-novice', name: '신규 유입 독자' },
  { id: 'reader-binge', name: '정주행 독자' },
  { id: 'reader-casual', name: '가볍게 보는 독자' },
  { id: 'reader-genre', name: '장르 매니아' },
] as const

const REACTION_LABEL: Record<string, string> = {
  confused: '헷갈림',
  bored: '지루함',
  excited: '몰입',
  dropoff: '이탈 위험',
  moved: '감동',
}

const RISK_LABEL: Record<string, string> = { low: '낮음', medium: '보통', high: '높음' }

type Result = { runId: string; result: ReaderSimResult }

/**
 * Reader reactions (F11). Runs the chosen reader personas on the saved chapter. Quoted moments
 * are marked in the editor.
 */
export function ReaderPanel({ data, api, text }: ReaderPanelProps) {
  const editable = canEditChapter(data)
  const [selected, setSelected] = useState<string[]>(PERSONAS.map((p) => p.id))
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState<Result | null>(null)

  useEffect(() => {
    if (!output) {
      api.setHighlights('reader', [])
      return
    }
    const highlights = output.result.personas.flatMap((persona, pi) =>
      persona.moments.flatMap((moment, mi) => {
        const range = rangeOf(text, moment.quote)
        if (!range) return []
        const highlight: Highlight = {
          id: `reader-${pi}-${mi}`,
          start: range.start,
          end: range.end,
          kind: 'reader',
        }
        return [highlight]
      }),
    )
    api.setHighlights('reader', highlights)
  }, [api, output, text])

  useEffect(() => {
    return () => api.setHighlights('reader', [])
  }, [api])

  function toggle(id: string, checked: boolean) {
    setSelected((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))
  }

  async function run() {
    if (selected.length === 0) return
    setRunning(true)
    await api.saveNow()
    // A route handler, not a Server Action: several personas can take minutes, and Server Actions
    // run one at a time, so autosave and navigation would wait behind it.
    const result = await runAction(
      postAction<Result>(`/api/works/${data.workId}/chapters/${data.chapter.id}/reader-sim`, {
        personaIds: selected,
      }),
    )
    setRunning(false)
    if (result) setOutput(result)
  }

  function focusQuote(quote: string) {
    const range = rangeOf(api.getText(), quote)
    if (range) api.focusRange(range.start, range.end)
  }

  const nameOf = (id: string) => PERSONAS.find((p) => p.id === id)?.name ?? id

  return (
    <section aria-label="독자 반응" className="grid gap-4">
      {!editable && <p className="text-xs text-muted-foreground">{EDITOR_ONLY_NOTE}</p>}

      {editable && (
        <>
          <fieldset className="grid gap-2">
            <legend className="text-sm font-medium">독자 선택</legend>
            {PERSONAS.map((persona) => {
              const id = `reader-persona-${persona.id}`
              return (
                <div key={persona.id} className="flex items-center gap-2">
                  <Checkbox
                    id={id}
                    checked={selected.includes(persona.id)}
                    disabled={running}
                    onCheckedChange={(checked) => toggle(persona.id, checked)}
                  />
                  <Label htmlFor={id}>{persona.name}</Label>
                </div>
              )
            })}
          </fieldset>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void run()} disabled={running || selected.length === 0}>
              {running ? '읽는 중… (AI)' : '독자 반응 보기'}
            </Button>
            <Link
              href={`/works/${data.workId}/reader-sim`}
              className={buttonVariants({ variant: 'ghost' })}
            >
              지난 결과 보기
            </Link>
          </div>
        </>
      )}

      {!editable && (
        <Link
          href={`/works/${data.workId}/reader-sim`}
          className="text-xs underline underline-offset-4"
        >
          지난 결과 보기
        </Link>
      )}

      {output && (
        <div className="grid gap-4">
          <p className="text-sm leading-6">{output.result.summary}</p>
          {output.result.personas.map((persona) => {
            const rating = Math.min(5, Math.max(1, Math.round(persona.rating)))
            return (
              <article key={persona.personaId} className="grid gap-2 rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">{nameOf(persona.personaId)}</h3>
                  <span className="text-sm" aria-label={`평점 ${rating}점 (5점 만점)`}>
                    {'★'.repeat(rating)}
                    {'☆'.repeat(5 - rating)}
                  </span>
                </div>
                <Badge variant="outline" className="w-fit">
                  이탈 위험 {RISK_LABEL[persona.dropOffRisk] ?? persona.dropOffRisk}
                </Badge>
                <p className="text-sm leading-6">{persona.overall}</p>
                {persona.moments.length > 0 && (
                  <ul className="grid gap-2">
                    {persona.moments.map((moment, index) => (
                      <li key={`${persona.personaId}-${index}`} className="grid gap-1 text-sm">
                        <button
                          type="button"
                          onClick={() => focusQuote(moment.quote)}
                          className="rounded-md bg-muted/60 p-2 text-left leading-6 hover:bg-muted"
                        >
                          {moment.quote}
                        </button>
                        <p>
                          <span className="font-medium">
                            {REACTION_LABEL[moment.reaction] ?? moment.reaction}
                          </span>
                          {' · '}
                          {moment.comment}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
