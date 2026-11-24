'use client'

import Link from 'next/link'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { AiRunStatus } from '@/components/app/ai-run-status'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
import type { IssueRow } from '@/db/types'
import { cancelAutoCheck, useAutoCheck } from '@/lib/client/auto-check'
import { postAction } from '@/lib/client/post-json'
import { runAction } from '@/lib/client/run-action'
import { markAutoChecked, wasAutoChecked } from '@/lib/client/sample-session'
import { useAiRun } from '@/lib/client/use-ai-run'
import { ISSUE_KIND_LABEL, SEVERITY_LABEL } from '@/lib/labels'
import { resolveIssueAction } from '@/server/actions/issues'
import type { ChapterCheckResult } from '@/server/chapter-check'
import type { Highlight, WorkspaceApi, WritingData } from '../types'
import { ApprovalDialog } from './approval-dialog'
import { CheckContext } from './check-context'
import { EDITOR_ONLY_NOTE, canEditChapter, offerUndo, rangeOf } from './shared'
import { WikiFixDialog } from './wiki-fix-dialog'

/**
 * Only a sentence swap can be applied from here. Thread and timeline issues need a wiki or plot
 * change, so their suggestion is advice, not a replacement.
 */
function canApplySuggestion(issue: IssueRow): boolean {
  return Boolean(issue.suggestion) && issue.kind !== 'thread' && issue.kind !== 'timeline'
}

type CheckPanelProps = {
  data: WritingData
  api: WorkspaceApi
  text: string
  autoRun?: boolean
}

/**
 * Chapter check (F7). Runs the saved chapter through the naming rules, the continuity check and
 * chapter extraction. Each open issue shows the manuscript sentence next to its wiki evidence.
 */
export function CheckPanel({ data, api, text, autoRun }: CheckPanelProps) {
  const editable = canEditChapter(data)
  const [issues, setIssues] = useState<IssueRow[]>(data.issues)
  // Re-sync when the page reloads the chapter's open issues.
  const [synced, setSynced] = useState<IssueRow[]>(data.issues)
  if (synced !== data.issues) {
    setSynced(data.issues)
    setIssues(data.issues)
  }
  const ai = useAiRun()
  const auto = useAutoCheck(data.chapter.id)
  const [checkedKey, setCheckedKey] = useState(0)
  // Show a finished auto check before router.refresh brings its issues back in data.issues.
  // The first previous value is the one at mount, so a late panel keeps fresh server data.
  const [previousAutoResult, setPreviousAutoResult] = useState(auto.result)
  if (auto.result !== previousAutoResult) {
    setPreviousAutoResult(auto.result)
    if (auto.result) {
      setIssues(auto.result.issues)
      setCheckedKey((key) => key + 1)
    }
  }
  const [busyId, setBusyId] = useState<string | null>(null)
  const [approvalOpen, setApprovalOpen] = useState(false)
  const [fixing, setFixing] = useState<IssueRow | null>(null)

  const highlights = useMemo<Highlight[]>(
    () =>
      issues.flatMap((issue) => {
        const range = rangeOf(text, issue.quote, issue.quoteStart)
        if (!range) return []
        return [
          {
            id: issue.id,
            start: range.start,
            end: range.end,
            kind: issue.kind === 'naming' ? 'naming' : 'issue',
          },
        ]
      }),
    [issues, text],
  )

  useEffect(() => {
    api.setHighlights('check', highlights)
  }, [api, highlights])

  useEffect(() => {
    return () => api.setHighlights('check', [])
  }, [api])

  /** Resolves true only when the check finished; cancel or failure leaves it false. */
  async function runCheck(opts?: { openApproval?: boolean }): Promise<boolean> {
    // A route handler, not a Server Action: the check can run for minutes, and Server Actions
    // run one at a time, so autosave and navigation would wait behind it.
    const result = await ai.run(async (signal) => {
      await api.saveNow()
      return runAction(
        postAction<ChapterCheckResult>(
          `/api/works/${data.workId}/chapters/${data.chapter.id}/check`,
          {},
          { signal },
        ),
        { success: '점검을 마쳤습니다.' },
      )
    })
    if (!result) return false
    setIssues(result.issues)
    setCheckedKey((key) => key + 1)
    if ((opts?.openApproval ?? true) && result.proposals.length > 0) setApprovalOpen(true)
    api.refresh()
    return true
  }

  const autoRan = useRef(false)
  const runCheckRef = useRef(runCheck)
  useEffect(() => {
    runCheckRef.current = runCheck
  })
  useEffect(() => {
    if (!autoRun || !editable) return
    // A finished check survives remounts (and StrictMode), so the AI is never called twice.
    if (autoRan.current || wasAutoChecked(data.chapter.id)) return
    autoRan.current = true
    const chapterId = data.chapter.id
    void runCheckRef.current({ openApproval: false }).then((finished) => {
      if (finished) markAutoChecked(chapterId)
    })
    window.history.replaceState(null, '', window.location.pathname)
    // StrictMode unmounts the first mount, which aborts the request; let the second one start it.
    return () => {
      autoRan.current = false
    }
  }, [autoRun, editable, data.chapter.id])

  function focusIssue(issue: IssueRow) {
    const range = rangeOf(text, issue.quote, issue.quoteStart)
    if (range) api.focusRange(range.start, range.end)
    else toast.error('원고에서 해당 문장을 찾지 못했습니다.')
  }

  async function resolve(issue: IssueRow, status: 'accepted' | 'dismissed') {
    setBusyId(issue.id)
    const result = await runAction(resolveIssueAction({ issueId: issue.id, status }))
    setBusyId(null)
    if (!result) return
    setIssues((prev) => prev.filter((item) => item.id !== issue.id))
    api.refresh()
  }

  function applyFix(issue: IssueRow) {
    if (!canApplySuggestion(issue)) return
    const before = api.getText()
    const replaced = api.replaceQuote(issue.quote, issue.suggestion, issue.quoteStart ?? undefined)
    if (!replaced) {
      toast.error('원고가 바뀌어 문장을 찾지 못했습니다. 다시 점검해 주세요.')
      return
    }
    offerUndo(api, before, '문장을 바꿨습니다.')
    void resolve(issue, 'accepted')
  }

  function handleFixed(issueId: string) {
    setIssues((prev) => prev.filter((item) => item.id !== issueId))
    setFixing(null)
    api.refresh()
  }

  // While a check runs, "no open issues" would read as "the check found nothing".
  const checking = ai.running || auto.running

  return (
    <section aria-label="회차 점검" className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {editable &&
          (ai.running ? (
            <AiRunStatus label="점검 중" elapsedSec={ai.elapsedSec} onCancel={ai.cancel} />
          ) : auto.running ? (
            <AiRunStatus
              label="자동 점검 중"
              elapsedSec={auto.elapsedSec}
              onCancel={() => cancelAutoCheck(data.chapter.id)}
            />
          ) : (
            <Button size="sm" onClick={() => void runCheck()}>
              회차 점검
            </Button>
          ))}
        {!editable && <p className="text-xs text-muted-foreground">{EDITOR_ONLY_NOTE}</p>}
        {issues.length > 0 && (
          <span className="text-sm text-muted-foreground">열린 지적 {issues.length}건</span>
        )}
      </div>

      {checking && (
        <p role="status" className="text-sm text-muted-foreground">
          설정과 어긋나는 문장을 찾고 있습니다. 보통 15~25초 걸립니다.
        </p>
      )}

      {data.chapter.archivedAt === null && (
        <CheckContext
          workId={data.workId}
          chapterId={data.chapter.id}
          position={data.chapter.position}
          refreshKey={checkedKey}
        />
      )}

      {issues.length === 0 && !checking && (
        <EmptyState
          title="열린 지적이 없습니다."
          description="회차 점검을 누르거나 회차를 완료로 바꾸면 설정과 어긋나는 문장을 찾아 줍니다."
        />
      )}

      <ul className="grid gap-3">
        {issues.map((issue) => {
          const entry = data.entries.find((e) => e.id === issue.entryId)
          const busy = busyId === issue.id
          return (
            <li
              key={issue.id}
              className="@container grid gap-3 rounded-sm border border-rule bg-sheet p-4"
            >
              <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
                <span className="font-medium text-mark">{ISSUE_KIND_LABEL[issue.kind]}</span>
                <span className="text-muted-foreground">
                  심각도 {SEVERITY_LABEL[issue.severity]}
                </span>
              </p>

              <div className="grid gap-3 @md:grid-cols-2">
                <div className="grid content-start gap-1">
                  <p className="text-xs text-muted-foreground">원고</p>
                  <button
                    type="button"
                    onClick={() => focusIssue(issue)}
                    className="rounded-sm px-1 py-0.5 text-left font-serif text-[15px] leading-7 underline decoration-mark decoration-2 underline-offset-[5px] hover:bg-mark/5"
                  >
                    {issue.quote}
                  </button>
                </div>
                <div className="grid content-start gap-1 border-t border-rule pt-3 @md:border-t-0 @md:border-l @md:pt-0 @md:pl-3">
                  <p className="text-xs text-muted-foreground">위키 원문</p>
                  <p className="font-serif text-[15px] leading-7 text-canon">
                    {issue.wikiExcerpt || '근거 없음'}
                  </p>
                  {entry && (
                    <Link
                      href={`/works/${data.workId}/wiki/entries/${entry.id}`}
                      className="w-fit text-xs text-canon underline decoration-canon/40 hover:decoration-canon"
                    >
                      {entry.name} 카드 열기
                    </Link>
                  )}
                </div>
              </div>

              {issue.explanation && <p className="text-sm">{issue.explanation}</p>}
              {issue.suggestion && (
                <p className="text-sm text-muted-foreground">
                  제안: <span className="font-serif text-[15px] text-mark">{issue.suggestion}</span>
                </p>
              )}

              {editable && (
                <div className="flex flex-wrap gap-2">
                  {canApplySuggestion(issue) && (
                    <Button size="sm" disabled={busy} onClick={() => applyFix(issue)}>
                      제안대로 고치기
                    </Button>
                  )}
                  {issue.factId && (
                    <Button size="sm" variant="outline" onClick={() => setFixing(issue)}>
                      위키 고치기
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void resolve(issue, 'dismissed')}
                  >
                    무시
                  </Button>
                </div>
              )}
            </li>
          )
        })}
      </ul>

      {fixing && (
        <WikiFixDialog
          issue={fixing}
          data={data}
          onClose={() => setFixing(null)}
          onDone={handleFixed}
        />
      )}

      <ApprovalDialog
        open={approvalOpen}
        onOpenChange={setApprovalOpen}
        workId={data.workId}
        chapterId={data.chapter.id}
        chapters={data.chapters}
        onChanged={() => api.refresh()}
      />
    </section>
  )
}
