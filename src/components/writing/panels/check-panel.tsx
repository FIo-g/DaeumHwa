'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { AiRunStatus } from '@/components/app/ai-run-status'
import { EmptyState } from '@/components/app/empty-state'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import type { IssueRow } from '@/db/types'
import { postAction } from '@/lib/client/post-json'
import { runAction } from '@/lib/client/run-action'
import { useAiRun } from '@/lib/client/use-ai-run'
import { ISSUE_KIND_LABEL, SEVERITY_LABEL } from '@/lib/labels'
import { resolveIssueAction } from '@/server/actions/issues'
import type { ChapterCheckResult } from '@/server/chapter-check'
import type { Highlight, WorkspaceApi, WritingData } from '../types'
import { ApprovalDialog } from './approval-dialog'
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
}

/**
 * Chapter check (F7). Runs the saved chapter through the naming rules, the continuity check and
 * chapter extraction. Each open issue shows the manuscript sentence next to its wiki evidence.
 */
export function CheckPanel({ data, api, text }: CheckPanelProps) {
  const editable = canEditChapter(data)
  const [issues, setIssues] = useState<IssueRow[]>(data.issues)
  // Re-sync when the page reloads the chapter's open issues.
  const [synced, setSynced] = useState<IssueRow[]>(data.issues)
  if (synced !== data.issues) {
    setSynced(data.issues)
    setIssues(data.issues)
  }
  const ai = useAiRun()
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

  async function runCheck() {
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
    if (!result) return
    setIssues(result.issues)
    if (result.proposals.length > 0) setApprovalOpen(true)
    api.refresh()
  }

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

  return (
    <section aria-label="회차 점검" className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {editable &&
          (ai.running ? (
            <AiRunStatus label="점검 중" elapsedSec={ai.elapsedSec} onCancel={ai.cancel} />
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

      {issues.length === 0 && (
        <EmptyState
          title="열린 지적이 없습니다."
          description="회차 점검을 누르면 설정과 어긋나는 문장을 찾아 줍니다."
        />
      )}

      <ul className="grid gap-3">
        {issues.map((issue) => {
          const entry = data.entries.find((e) => e.id === issue.entryId)
          const busy = busyId === issue.id
          return (
            <li key={issue.id} className="grid gap-3 rounded-lg border p-3">
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge variant="outline">{ISSUE_KIND_LABEL[issue.kind]}</Badge>
                <Badge variant="secondary">심각도 {SEVERITY_LABEL[issue.severity]}</Badge>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid content-start gap-1">
                  <p className="text-xs font-medium text-muted-foreground">원고</p>
                  <button
                    type="button"
                    onClick={() => focusIssue(issue)}
                    className="rounded-md bg-muted/60 p-2 text-left text-sm leading-6 hover:bg-muted"
                  >
                    {issue.quote}
                  </button>
                </div>
                <div className="grid content-start gap-1">
                  <p className="text-xs font-medium text-muted-foreground">위키</p>
                  <p className="rounded-md border p-2 text-sm leading-6">
                    {issue.wikiExcerpt || '근거 없음'}
                  </p>
                  {entry && (
                    <Link
                      href={`/works/${data.workId}/wiki/entries/${entry.id}`}
                      className="text-xs underline underline-offset-4"
                    >
                      {entry.name} 카드 열기
                    </Link>
                  )}
                </div>
              </div>

              {issue.explanation && <p className="text-sm">{issue.explanation}</p>}
              {issue.suggestion && (
                <p className="text-sm text-muted-foreground">제안: {issue.suggestion}</p>
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
