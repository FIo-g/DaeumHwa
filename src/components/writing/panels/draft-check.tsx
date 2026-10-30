'use client'

import { useEffect, useRef, useState } from 'react'
import { AiRunStatus } from '@/components/app/ai-run-status'
import { Button } from '@/components/ui/button'
import { postAction } from '@/lib/client/post-json'
import { runAction } from '@/lib/client/run-action'
import { useAiRun } from '@/lib/client/use-ai-run'
import { REASON_LABELS, type SceneFinding } from '@/lib/draft-check'
import type { DraftCheckResult } from '@/server/draft-check'
import { applySceneFixAction, discardSceneFixAction } from '@/server/actions/ai-features'

type DraftCheckProps = {
  workId: string
  runId: string
  /** Called with the fixed text after the author applies it. */
  onApplied(text: string): void
  /** Reports whether a fix preview is open, so the panel can hold its other buttons. */
  onPreviewChange(open: boolean): void
}

/**
 * The route always answers with a check result. A payload that is not one must not take the
 * panel down; the check shows its failure line instead.
 */
function isCheckResult(data: DraftCheckResult): boolean {
  if (!Array.isArray(data.findings)) return false
  if (data.fix === null) return true
  return (
    typeof data.fix === 'object' && Array.isArray(data.fix.scenes) && Array.isArray(data.fix.parts)
  )
}

/** One findings line per scene: the scene number and its labels. */
function sceneLines(findings: SceneFinding[]): { scene: number; labels: string }[] {
  const byScene = new Map<number, string[]>()
  for (const finding of findings) {
    const labels = byScene.get(finding.scene) ?? []
    const label = REASON_LABELS[finding.reason]
    if (!labels.includes(label)) labels.push(label)
    byScene.set(finding.scene, labels)
  }
  return [...byScene.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([scene, labels]) => ({ scene, labels: labels.join(', ') }))
}

/**
 * The draft check (stage 3). Starts once when mounted and shows the weak scenes; when the
 * server fixed up to two scenes it previews the candidate. Nothing changes until the author
 * presses "적용".
 */
export function DraftCheck({ workId, runId, onApplied, onPreviewChange }: DraftCheckProps) {
  const ai = useAiRun()
  const [result, setResult] = useState<DraftCheckResult | null>(null)
  const [failed, setFailed] = useState(false)
  const [applying, setApplying] = useState(false)
  // The panel keys this by run id, so one mount is one check. The guard keeps a second
  // render (or effect re-run) from starting another call.
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    let signal: AbortSignal | null = null
    void ai
      .run((s) => {
        signal = s
        return runAction(
          postAction<DraftCheckResult>(
            `/api/works/${workId}/draft/check`,
            { runId },
            { signal: s },
          ),
        )
      })
      .then((data) => {
        if (data === null) {
          // A cancel resolves to null silently; only a real failure shows the notice.
          if (signal?.aborted) return
          setFailed(true)
          return
        }
        // A payload that is not a check result must not take the panel down.
        if (!isCheckResult(data)) {
          setFailed(true)
          return
        }
        setResult(data)
        if (data.fix !== null) onPreviewChange(true)
      })
  }, [ai, workId, runId, onPreviewChange])

  async function apply() {
    const fix = result?.fix
    if (!fix) return
    setApplying(true)
    const applied = await runAction(applySceneFixAction({ workId, runId, token: fix.token }), {
      success: '고친 장면으로 바꿨습니다.',
    })
    setApplying(false)
    // A failure keeps the preview open; the toast carries the server's reason.
    if (!applied) return
    setResult((prev) => (prev ? { ...prev, fix: null } : prev))
    onPreviewChange(false)
    onApplied(applied.text)
  }

  async function discard() {
    const fix = result?.fix
    if (!fix) return
    setApplying(true)
    const discarded = await runAction(discardSceneFixAction({ workId, runId, token: fix.token }))
    setApplying(false)
    if (!discarded) return
    setResult((prev) => (prev ? { ...prev, fix: null } : prev))
    onPreviewChange(false)
  }

  if (ai.running) {
    return <AiRunStatus label="점검하는 중" elapsedSec={ai.elapsedSec} onCancel={ai.cancel} />
  }

  if (failed) {
    return <p className="text-sm text-muted-foreground">점검을 하지 못했습니다.</p>
  }

  if (result === null) return null

  const lines = sceneLines(result.findings)
  const fix = result.fix

  if (fix === null) {
    if (lines.length === 0) {
      return (
        <div className="grid gap-2">
          <p className="text-sm text-muted-foreground">고칠 곳을 찾지 못했습니다.</p>
          {result.notice && <p className="text-sm text-muted-foreground">{result.notice}</p>}
        </div>
      )
    }
    return (
      <div className="grid gap-1 rounded-lg border p-3 text-sm">
        <p className="font-medium">점검 결과</p>
        <ul className="grid gap-1 text-muted-foreground">
          {lines.map((line) => (
            <li key={line.scene}>{`장면 ${line.scene}: ${line.labels}`}</li>
          ))}
        </ul>
        {result.notice && <p className="text-muted-foreground">{result.notice}</p>}
      </div>
    )
  }

  return (
    <section role="region" aria-label="고친 장면 미리 보기" className="grid gap-3">
      {lines.length > 0 && (
        <div className="grid gap-1 rounded-lg border p-3 text-sm">
          <p className="font-medium">점검 결과</p>
          <ul className="grid gap-1 text-muted-foreground">
            {lines.map((line) => (
              <li key={line.scene}>{`장면 ${line.scene}: ${line.labels}`}</li>
            ))}
          </ul>
        </div>
      )}
      {(fix.voiceLines ?? 0) > 0 && (
        <p className="text-sm text-muted-foreground">{`말투를 고친 대사 ${fix.voiceLines}줄`}</p>
      )}
      <p className="text-sm font-medium">고친 장면 미리 보기</p>
      <p className="text-xs text-muted-foreground">
        초록은 새 글, 빨강 취소선은 지워지는 글입니다.
      </p>
      <div className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg border bg-muted/30 p-3 text-sm leading-7">
        {fix.parts.map((part, index) => {
          if (part.type === 'insert') {
            return (
              <ins
                key={index}
                className="bg-emerald-100 text-emerald-900 no-underline dark:bg-emerald-950 dark:text-emerald-200"
              >
                {part.value}
              </ins>
            )
          }
          if (part.type === 'delete') {
            return (
              <del
                key={index}
                className="bg-red-100 text-red-900 line-through decoration-red-700 dark:bg-red-950 dark:text-red-200"
              >
                {part.value}
              </del>
            )
          }
          return <span key={index}>{part.value}</span>
        })}
      </div>
      {result.notice && <p className="text-sm text-muted-foreground">{result.notice}</p>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void apply()} disabled={applying}>
          적용
        </Button>
        <Button variant="outline" onClick={() => void discard()} disabled={applying}>
          버리기
        </Button>
      </div>
    </section>
  )
}
