'use client'

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AiBadge } from '@/components/app/ai-badge'
import { AiRunStatus } from '@/components/app/ai-run-status'
import { EmptyState } from '@/components/app/empty-state'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { postAction } from '@/lib/client/post-json'
import { runAction } from '@/lib/client/run-action'
import { useAiRun } from '@/lib/client/use-ai-run'
import type { Highlight, WorkspaceApi, WritingData } from '../types'
import { EDITOR_ONLY_NOTE, canEditChapter, offerUndo, rangeOf } from './shared'

type ProofreadPanelProps = {
  data: WritingData
  api: WorkspaceApi
  text: string
}

// Mirrors ProofreadSuggestion from the server checker. Kept local so this client file imports no server code.
type ProofreadItem = {
  source: 'rule' | 'ai'
  quote: string
  replacement: string
  kind: 'spelling' | 'spacing' | 'grammar' | 'awkward'
  reason: string
  start: number
  end: number
}

const KIND_LABEL: Record<ProofreadItem['kind'], string> = {
  spelling: '맞춤법',
  spacing: '띄어쓰기',
  grammar: '문법',
  awkward: '어색한 표현',
}

/**
 * Proofreading (F14). "규칙 검사" runs the built-in checks; "AI 교정" adds model suggestions.
 * Applying a suggestion replaces its quote in the editor. Saving stays with the author.
 */
export function ProofreadPanel({ data, api, text }: ProofreadPanelProps) {
  const editable = canEditChapter(data)
  const [items, setItems] = useState<ProofreadItem[] | null>(null)
  const [ruleRunning, setRuleRunning] = useState(false)
  const ai = useAiRun()

  const highlights = useMemo<Highlight[]>(
    () =>
      (items ?? []).flatMap((item, index) => {
        const range = rangeOf(text, item.quote, item.start)
        if (!range) return []
        return [{ id: `proofread-${index}`, start: range.start, end: range.end, kind: 'spelling' }]
      }),
    [items, text],
  )

  useEffect(() => {
    api.setHighlights('proofread', highlights)
  }, [api, highlights])

  useEffect(() => {
    return () => api.setHighlights('proofread', [])
  }, [api])

  const proofreadUrl = `/api/works/${data.workId}/chapters/${data.chapter.id}/proofread`

  async function runRules() {
    setRuleRunning(true)
    // A route handler, not a Server Action, so a long AI pass elsewhere cannot hold this queue.
    const result = await runAction(
      postAction<{ suggestions: ProofreadItem[]; runId: string | null }>(proofreadUrl, {
        text: api.getText(),
        useAi: false,
      }),
    )
    setRuleRunning(false)
    if (result) setItems(result.suggestions)
  }

  async function runAi() {
    // The AI pass can take a while, and the author may cancel it from the status line.
    const result = await ai.run((signal) =>
      runAction(
        postAction<{ suggestions: ProofreadItem[]; runId: string | null }>(
          proofreadUrl,
          { text: api.getText(), useAi: true },
          { signal },
        ),
      ),
    )
    if (result) setItems(result.suggestions)
  }

  function apply(item: ProofreadItem): boolean {
    const before = api.getText()
    const replaced = api.replaceQuote(item.quote, item.replacement, item.start)
    if (!replaced) {
      toast.error('원고가 바뀌어 문장을 찾지 못했습니다. 다시 검사해 주세요.')
      return false
    }
    offerUndo(api, before, '문장을 바꿨습니다.')
    setItems((prev) => (prev ? prev.filter((x) => x !== item) : prev))
    return true
  }

  /** Applies every rule suggestion from the end of the text backwards, so earlier offsets stay valid. */
  function applyAllRules() {
    if (!items) return
    const rules = items.filter((item) => item.source === 'rule').sort((a, b) => b.start - a.start)
    const before = api.getText()
    const done = rules.filter((item) => api.replaceQuote(item.quote, item.replacement, item.start))
    if (done.length < rules.length) {
      toast.error(`${rules.length - done.length}곳은 원고가 바뀌어 고치지 못했습니다.`)
    }
    if (done.length > 0) {
      // One snapshot for the whole batch, so a single 되돌리기 restores every change.
      offerUndo(api, before, `${done.length}곳을 고쳤습니다.`)
      setItems((prev) => (prev ? prev.filter((x) => !done.includes(x)) : prev))
    }
  }

  const ruleCount = items?.filter((item) => item.source === 'rule').length ?? 0

  return (
    <section aria-label="맞춤법과 표현" className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {editable ? (
          <>
            <Button
              size="sm"
              variant="outline"
              disabled={ruleRunning || ai.running}
              onClick={() => void runRules()}
            >
              {ruleRunning ? '검사 중…' : '규칙 검사'}
            </Button>
            {ai.running ? (
              <AiRunStatus label="교정 중" elapsedSec={ai.elapsedSec} onCancel={ai.cancel} />
            ) : (
              <Button size="sm" disabled={ruleRunning} onClick={() => void runAi()}>
                AI 교정
              </Button>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">{EDITOR_ONLY_NOTE}</p>
        )}
        {editable && ruleCount > 0 && (
          <Button size="sm" variant="ghost" onClick={applyAllRules}>
            모두 적용 (규칙)
          </Button>
        )}
      </div>

      {items === null && (
        <p className="text-sm text-muted-foreground">
          규칙 검사는 흔한 맞춤법과 띄어쓰기 오류를 바로 찾습니다. AI 교정은 어색한 표현까지
          찾습니다.
        </p>
      )}

      {items !== null && items.length === 0 && <EmptyState title="고칠 곳을 찾지 못했습니다." />}

      <ul className="grid gap-2">
        {(items ?? []).map((item, index) => (
          <li key={`${item.start}-${index}`} className="grid gap-2 rounded-lg border p-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="outline">{KIND_LABEL[item.kind]}</Badge>
              {item.source === 'ai' && <AiBadge />}
            </div>
            <p className="text-sm leading-6">
              <span className="line-through decoration-destructive">{item.quote}</span>
              <span aria-hidden="true"> → </span>
              <span className="font-medium">{item.replacement}</span>
            </p>
            <p className="text-sm text-muted-foreground">{item.reason}</p>
            {editable && (
              <div>
                <Button size="sm" variant="outline" onClick={() => apply(item)}>
                  적용
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
