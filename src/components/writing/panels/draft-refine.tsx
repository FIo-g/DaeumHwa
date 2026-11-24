'use client'

import { useState } from 'react'
import { AiRunStatus } from '@/components/app/ai-run-status'
import { Button } from '@/components/ui/button'
import { postAction } from '@/lib/client/post-json'
import { runAction } from '@/lib/client/run-action'
import { useAiRun } from '@/lib/client/use-ai-run'
import { type DraftRefinePreview, refineRepairNote, refineSummary } from '@/lib/draft-refine'
import { applyDraftRefinementAction } from '@/server/actions/ai-features'

type DraftRefineProps = {
  workId: string
  runId: string
  /** Called with the refined text after the author applies it. */
  onApplied(text: string): void
  /** Reports whether a preview is open, so the panel can hold its other buttons. */
  onPreviewChange(open: boolean): void
  /** Holds the 다듬기 button while another preview is open. */
  disabled?: boolean
}

/**
 * "다듬기" for a finished draft (P6). The server runs the paragraph trim and the sentence repair
 * and returns a preview. Nothing changes until the author presses "적용".
 */
export function DraftRefine({
  workId,
  runId,
  onApplied,
  onPreviewChange,
  disabled,
}: DraftRefineProps) {
  const [preview, setPreview] = useState<DraftRefinePreview | null>(null)
  const [nothing, setNothing] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const ai = useAiRun()
  const url = `/api/works/${workId}/draft/refine`

  async function refine() {
    setNothing(null)
    setPreview(null)
    onPreviewChange(false)
    // Resolves null on a failure (already toasted) or a cancel (silent).
    const result = await ai.run((signal) =>
      runAction(postAction<DraftRefinePreview>(url, { runId }, { signal })),
    )
    if (result === null) return
    if (!result.changed) {
      // A skipped sentence repair says why nothing else was done; otherwise the draft is clean.
      setNothing(refineRepairNote(result) ?? '다듬을 곳을 찾지 못했어요.')
      return
    }
    setPreview(result)
    onPreviewChange(true)
  }

  async function apply() {
    if (!preview) return
    setApplying(true)
    const applied = await runAction(
      applyDraftRefinementAction({ workId, runId, token: preview.token }),
      {
        success: '다듬은 초안으로 바꿨어요.',
      },
    )
    setApplying(false)
    // A failure keeps the preview open; the toast carries the server's reason.
    if (!applied) return
    setPreview(null)
    onPreviewChange(false)
    onApplied(applied.text)
  }

  function discard() {
    setPreview(null)
    onPreviewChange(false)
  }

  if (ai.running) {
    return <AiRunStatus label="다듬는 중" elapsedSec={ai.elapsedSec} onCancel={ai.cancel} />
  }

  if (preview) {
    const note = refineRepairNote(preview)
    return (
      <section role="region" aria-label="다듬기 미리보기" className="grid gap-3">
        <p className="text-sm font-medium">{refineSummary(preview)}</p>
        <p className="text-xs text-muted-foreground">
          {`분량 ${preview.beforeChars.toLocaleString('ko-KR')}자 → ${preview.afterChars.toLocaleString('ko-KR')}자`}
        </p>
        {note && <p className="text-sm text-muted-foreground">{note}</p>}
        <p className="text-xs text-muted-foreground">
          겨자색으로 새 글을 표시해요. 지울 글에는 취소선을 그어요.
        </p>
        <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm leading-7">
          {preview.parts.map((part, index) => {
            if (part.type === 'insert') {
              return (
                <ins key={index} className="bg-kraft text-ink no-underline">
                  {part.value}
                </ins>
              )
            }
            if (part.type === 'delete') {
              return (
                <del
                  key={index}
                  className="bg-muted text-ink line-through decoration-ink decoration-2"
                >
                  {part.value}
                </del>
              )
            }
            return <span key={index}>{part.value}</span>
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          미리 보기를 적용하거나 버려 주세요. 그 뒤에 원고에 붙일 수 있어요.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => void apply()} disabled={applying}>
            적용
          </Button>
          <Button variant="outline" onClick={discard} disabled={applying}>
            버리기
          </Button>
        </div>
      </section>
    )
  }

  return (
    <div className="grid gap-2">
      <div>
        <Button size="sm" variant="outline" onClick={() => void refine()} disabled={disabled}>
          다듬기
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        긴 문단과 반복되는 표현을 다듬어요. 결과를 보고 적용 여부를 정할 수 있어요.
      </p>
      {nothing && <p className="text-sm text-muted-foreground">{nothing}</p>}
    </div>
  )
}
