'use client'

import Link from 'next/link'
import { BookOpenIcon } from 'lucide-react'
import { useEffect, useEffectEvent, useMemo, useRef, useState, type CSSProperties } from 'react'
import { toast } from 'sonner'
import { AiRunStatus } from '@/components/app/ai-run-status'
import { EmptyState } from '@/components/app/empty-state'
import {
  CountCell,
  Disclosure,
  GridTitle,
  MarginNote,
  PopButton,
  ProofPair,
  ProofStrike,
  ProofUnderline,
  usePrefersReducedMotion,
} from '@/components/motion'
import { Button } from '@/components/ui/button'
import type { IssueRow } from '@/db/types'
import { cancelAutoCheck, useAutoCheck } from '@/lib/client/auto-check'
import { postAction } from '@/lib/client/post-json'
import { runAction } from '@/lib/client/run-action'
import { markAutoChecked, wasAutoChecked } from '@/lib/client/sample-session'
import { flushPendingSaves } from '@/lib/client/use-autosave'
import { useAiRun } from '@/lib/client/use-ai-run'
import { ISSUE_KIND_LABEL, SEVERITY_LABEL } from '@/lib/labels'
import { isTrialCheckChapter, TRIAL_SIGNUP_MESSAGE } from '@/lib/trial'
import { resolveIssueAction } from '@/server/actions/issues'
import type { ChapterCheckResult } from '@/server/chapter-check'
import { changeMiddle } from '../text-ops'
import type { FindingLinks, Highlight, ProofRevision, WorkspaceApi, WritingData } from '../types'
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
  findings?: FindingLinks
}

/**
 * Chapter check (F7). Runs the saved chapter through the naming rules, the continuity check and
 * chapter extraction. Each open issue shows the manuscript sentence next to its wiki evidence.
 */
type FindingExit = {
  issue: IssueRow
  order: number
  kind: 'apply' | 'dismiss' | 'wiki'
  replacement?: string
  revision?: ProofRevision
}

const RESOLVED_TEXT = {
  apply: '문장을 바꿨어요.',
  dismiss: '지적을 닫았어요.',
  wiki: '위키를 고쳤어요.',
}

export function CheckPanel({ data, api, text, autoRun, findings }: CheckPanelProps) {
  const editable = canEditChapter(data)
  const canCheck = editable && (!data.trial || isTrialCheckChapter(data.chapter.position))
  const reduced = usePrefersReducedMotion()
  const onCheckState = findings?.onCheckState
  const onRequestHandled = findings?.onRequestHandled
  const checkControls = useRef<HTMLDivElement>(null)
  const cards = useRef<HTMLUListElement>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [exit, setExit] = useState<FindingExit | null>(null)
  const [resolved, setResolved] = useState('')
  const [issues, setIssues] = useState<IssueRow[]>(data.issues)
  // Re-sync when the page reloads the chapter's open issues.
  const [synced, setSynced] = useState<IssueRow[]>(data.issues)
  if (synced !== data.issues) {
    setSynced(data.issues)
    setIssues(data.issues)
  }
  const ai = useAiRun()
  const auto = useAutoCheck(data.chapter.id)
  const checking = ai.running || auto.running
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

  const highlights = useMemo<Highlight[]>(() => {
    if (checking) return []
    return [...issues, ...(exit?.kind === 'dismiss' ? [exit.issue] : [])].flatMap(
      (issue, order) => {
        const range = rangeOf(text, issue.quote, issue.quoteStart)
        if (!range) return []
        return [
          {
            id: issue.id,
            start: range.start,
            end: range.end,
            kind: issue.kind === 'naming' ? 'naming' : 'issue',
            order,
            closing: exit?.issue.id === issue.id && exit.kind === 'dismiss',
          },
        ]
      },
    )
  }, [checking, exit, issues, text])

  useEffect(() => {
    api.setHighlights('check', highlights)
  }, [api, highlights])

  useEffect(() => {
    return () => api.setHighlights('check', [])
  }, [api])

  const showRevision = useEffectEvent((revision: ProofRevision) => findings?.onRevision(revision))
  useEffect(() => {
    if (!exit) return
    let active = true
    function complete() {
      if (!active || !exit) return
      setExit(null)
      if (exit.revision) showRevision(exit.revision)
    }
    const row = cards.current?.querySelector('[data-exit]')
    const fold = reduced
      ? undefined
      : row
          ?.getAnimations?.()
          .find(
            (animation) =>
              'animationName' in animation && animation.animationName === 'wg-panels-fold',
          )
    if (fold) {
      void fold.finished.then(complete, complete)
      return () => {
        active = false
      }
    }
    const timer = window.setTimeout(complete, 0)
    return () => window.clearTimeout(timer)
  }, [exit, reduced])

  const requestedId = findings?.requestedId
  useEffect(() => {
    if (checking || !requestedId || !issues.some((issue) => issue.id === requestedId)) return
    const card = Array.from(cards.current?.children ?? []).find(
      (element) => element.getAttribute('data-finding-id') === requestedId,
    )
    const button = card?.querySelector<HTMLButtonElement>('button[aria-expanded]')
    if (!button || !button.getClientRects().length) return
    button.focus({ preventScroll: true })
    card?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'instant' : 'smooth' })
    onRequestHandled?.()
  }, [checking, issues, onRequestHandled, reduced, requestedId])

  /** Resolves true only when the check finished; cancel or failure leaves it false. */
  async function runCheck(opts?: { openApproval?: boolean }): Promise<boolean> {
    // A route handler, not a Server Action: the check can run for minutes, and Server Actions
    // run one at a time, so autosave and navigation would wait behind it.
    setResolved('')
    const result = await ai.run(async (signal) => {
      if (editable) await api.saveNow()
      return runAction(
        postAction<ChapterCheckResult>(
          `/api/works/${data.workId}/chapters/${data.chapter.id}/check`,
          {},
          { signal },
        ),
        { success: '점검을 마쳤어요.' },
      )
    })
    if (!result) return false
    setIssues(result.issues)
    setCheckedKey((key) => key + 1)
    if (editable && (opts?.openApproval ?? true) && result.proposals.length > 0) {
      setApprovalOpen(true)
    }
    api.refresh()
    return true
  }

  const autoRan = useRef(false)
  const runCheckRef = useRef(runCheck)
  useEffect(() => {
    runCheckRef.current = runCheck
  })
  useEffect(() => {
    if (!autoRun || !canCheck) return
    // Wait for the panel to settle before starting a request that unmounting would abort.
    const timer = window.setTimeout(() => {
      if (autoRan.current || wasAutoChecked(data.chapter.id)) return
      autoRan.current = true
      const chapterId = data.chapter.id
      void runCheckRef.current({ openApproval: false }).then((finished) => {
        if (finished) markAutoChecked(chapterId)
      })
      window.history.replaceState(null, '', window.location.pathname)
    }, 0)
    return () => window.clearTimeout(timer)
  }, [autoRun, canCheck, data.chapter.id])

  function focusIssue(issue: IssueRow) {
    const range = rangeOf(text, issue.quote, issue.quoteStart)
    if (!range) {
      toast.error('원고에서 해당 문장을 찾지 못했어요.')
      return
    }
    if (findings) findings.onJump(range.start, range.end, issue.id)
    else api.focusRange(range.start, range.end)
  }

  async function resolve(
    issue: IssueRow,
    status: 'accepted' | 'dismissed',
    revision?: ProofRevision,
  ) {
    setBusyId(issue.id)
    const result = await runAction(resolveIssueAction({ issueId: issue.id, status }))
    setBusyId(null)
    if (!result) {
      if (revision) findings?.onRevision(revision)
      return
    }
    finish(issue, status === 'dismissed' ? 'dismiss' : 'apply', { revision })
    api.refresh()
  }

  async function applyFix(issue: IssueRow) {
    if (!canApplySuggestion(issue)) return
    const before = api.getText()
    const start =
      issue.quoteStart !== null && before.startsWith(issue.quote, issue.quoteStart)
        ? issue.quoteStart
        : before.indexOf(issue.quote)
    const replaced = api.replaceQuote(issue.quote, issue.suggestion, issue.quoteStart ?? undefined)
    if (!replaced) {
      toast.error('원고가 바뀌어 문장을 찾지 못했어요. 다시 점검해 주세요.')
      return
    }
    const change = changeMiddle(issue.quote, issue.suggestion)
    const revision =
      start >= 0 && (change.before || change.after)
        ? { start: start + change.offset, before: change.before, after: change.after }
        : undefined
    setBusyId(issue.id)
    if (await flushPendingSaves()) {
      offerUndo(api, before, '문장을 바꿨어요.')
      await resolve(issue, 'accepted', revision)
    } else {
      setBusyId(null)
      if (revision) findings?.onRevision(revision)
    }
  }

  function finish(
    issue: IssueRow,
    kind: FindingExit['kind'],
    detail?: Pick<FindingExit, 'replacement' | 'revision'>,
  ) {
    const order = issues.findIndex((item) => item.id === issue.id)
    const activeCard = document.activeElement?.closest('[data-finding-id]')
    if (activeCard?.getAttribute('data-finding-id') === issue.id) {
      const next = activeCard.nextElementSibling ?? activeCard.previousElementSibling
      const target =
        next?.querySelector<HTMLButtonElement>('button[aria-expanded]') ??
        checkControls.current?.querySelector<HTMLButtonElement>('button')
      target?.focus({ preventScroll: true })
    }
    setResolved(RESOLVED_TEXT[kind])
    if (!reduced) setExit({ issue, order, kind, ...detail })
    setIssues((prev) => prev.filter((item) => item.id !== issue.id))
  }

  function handleFixed(issueId: string, replacement: string) {
    const issue = issues.find((item) => item.id === issueId)
    if (issue) finish(issue, 'wiki', { replacement })
    setFixing(null)
    api.refresh()
  }

  useEffect(() => {
    onCheckState?.({ checking, resultKey: checkedKey, issueCount: issues.length })
  }, [checkedKey, checking, issues.length, onCheckState])

  const shown = issues.map((issue, order) => ({
    issue,
    order,
    transition: undefined as FindingExit | undefined,
  }))
  if (exit && !issues.some(({ id }) => id === exit.issue.id)) {
    shown.splice(Math.max(0, exit.order), 0, {
      issue: exit.issue,
      order: exit.order,
      transition: exit,
    })
  }

  return (
    <section aria-label="회차 점검" className="wg-panels-section">
      <div className="wg-panels-check-head">
        <GridTitle columns={5}>회차 점검</GridTitle>
        <div ref={checkControls} className="flex flex-wrap items-center justify-between gap-2">
          {canCheck &&
            (ai.running ? (
              <AiRunStatus label="점검 중" elapsedSec={ai.elapsedSec} onCancel={ai.cancel} />
            ) : auto.running ? (
              <AiRunStatus
                label="자동 점검 중"
                elapsedSec={auto.elapsedSec}
                onCancel={() => cancelAutoCheck(data.chapter.id)}
              />
            ) : (
              <PopButton arrow={false} onClick={() => void runCheck()}>
                회차 점검
              </PopButton>
            ))}
          {!canCheck && (
            <p className="text-sm text-muted-foreground">
              {data.trial ? TRIAL_SIGNUP_MESSAGE : EDITOR_ONLY_NOTE}
            </p>
          )}
          {!checking && (
            <span className="wg-panels-count" aria-live="polite">
              열린 지적 <CountCell value={issues.length} />건
            </span>
          )}
        </div>

        {checking && (
          <p role="status" className="text-sm text-muted-foreground">
            설정과 어긋나는 문장을 찾고 있어요. 보통 15~25초 걸려요.
          </p>
        )}
        {resolved && !checking && (
          <p role="status" className="text-sm">
            {resolved}
          </p>
        )}
      </div>

      {data.chapter.archivedAt === null && (
        <div hidden={checking}>
          <CheckContext
            workId={data.workId}
            chapterId={data.chapter.id}
            position={data.chapter.position}
            refreshKey={checkedKey}
          />
        </div>
      )}

      {issues.length === 0 && !checking && !exit && (
        <EmptyState
          title="열린 지적이 없어요."
          description={
            data.trial ? undefined : '‘회차 점검’을 눌러 보세요. 설정과 어긋난 문장을 찾아 드려요.'
          }
        />
      )}

      <ul
        ref={cards}
        hidden={shown.length === 0}
        inert={checking}
        aria-hidden={checking || undefined}
        data-checking={checking}
        className="wg-panels-list"
      >
        {shown.map(({ issue, order, transition }) => {
          const entry = data.entries.find((item) => item.id === issue.entryId)
          const busy = busyId === issue.id
          const isOpen = expanded[issue.id] ?? issues.length === 1
          const wikiChange = transition?.kind === 'wiki' ? transition.replacement : undefined
          const editableQuote = canApplySuggestion(issue)
          const change = editableQuote ? changeMiddle(issue.quote, issue.suggestion) : null
          const marked = change?.before || issue.quote
          const offset = change?.before ? change.offset : 0
          const applying = transition?.kind === 'apply'
          const manuscript = (
            <>
              <p className="wg-panels-label">원고</p>
              <button
                type="button"
                aria-label={issue.quote}
                onClick={() => focusIssue(issue)}
                className="wg-panels-quote"
              >
                {issue.quote.slice(0, offset)}
                {applying ? (
                  <span className="wg-panels-revision">
                    {change?.after && (
                      <span aria-hidden="true" className="wg-panels-correction">
                        {change.after}
                      </span>
                    )}
                    {change?.before ? <ProofStrike>{marked}</ProofStrike> : marked}
                  </span>
                ) : (
                  <ProofUnderline replayKey={checkedKey}>{marked}</ProofUnderline>
                )}
                {issue.quote.slice(offset + marked.length)}
              </button>
            </>
          )
          const evidence = (
            <MarginNote>
              {issue.wikiExcerpt && (
                <span className={wikiChange ? 'wg-panels-wiki-previous' : undefined}>
                  {issue.wikiExcerpt}
                </span>
              )}
              {wikiChange && <span className="block">{wikiChange}</span>}
            </MarginNote>
          )
          return (
            <li
              key={issue.id}
              data-finding-id={issue.id}
              data-linked={findings?.linkedId === issue.id}
              data-reading={findings?.readingId === issue.id}
              data-exit={transition?.kind}
              className="wg-panels-row wg-panels-finding"
              data-arrival={checkedKey % 2 ? 'odd' : 'even'}
              aria-hidden={transition ? true : undefined}
              inert={Boolean(transition)}
              style={{ '--wg-panels-row': Math.min(order, 3) } as CSSProperties}
              onPointerEnter={(event) => {
                if (event.pointerType === 'mouse') findings?.onLink(issue.id)
              }}
              onPointerLeave={() => findings?.onLink(null)}
              onFocus={() => findings?.onLink(issue.id)}
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) findings?.onLink(null)
              }}
            >
              <Disclosure
                className="wg-panels-finding-disclosure"
                open={transition ? true : isOpen}
                onOpenChange={(open) => {
                  if (!transition) setExpanded((previous) => ({ ...previous, [issue.id]: open }))
                }}
                title={
                  <span className="wg-panels-finding-label">
                    <span className="wg-panels-finding-title">{ISSUE_KIND_LABEL[issue.kind]}</span>
                    <span className="wg-panels-severity">
                      심각도 {SEVERITY_LABEL[issue.severity]}
                    </span>
                  </span>
                }
              >
                <div className="wg-panels-finding-body">
                  {issue.wikiExcerpt ? (
                    <ProofPair manuscript={manuscript} note={evidence} className="wg-panels-pair" />
                  ) : (
                    <div className="wg-panels-single">
                      {manuscript}
                      <p className="wg-panels-label">위키 원문</p>
                      <p className="text-sm text-muted-foreground">근거 없음</p>
                    </div>
                  )}
                  {entry && (
                    <div className="wg-panels-source">
                      <Link
                        href={`/works/${data.workId}/wiki/entries/${entry.id}`}
                        className="b-link"
                      >
                        {entry.name} 카드 열기
                      </Link>
                      <span
                        tabIndex={0}
                        className="b-tooltip-anchor wg-panels-source-icon"
                        aria-describedby={`source-${issue.id}`}
                      >
                        <BookOpenIcon className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
                        <span id={`source-${issue.id}`} role="tooltip" className="b-tooltip">
                          {entry.name} 카드
                        </span>
                      </span>
                    </div>
                  )}
                  {issue.explanation && (
                    <p className="wg-panels-explanation">{issue.explanation}</p>
                  )}
                  {issue.suggestion && (
                    <div className="wg-panels-proposal">
                      <p className="wg-panels-label">제안</p>
                      <p className="wg-panels-sentence">{issue.suggestion}</p>
                    </div>
                  )}
                  {editable && (
                    <div className="wg-panels-actions">
                      {editableQuote && (
                        <PopButton
                          arrow={false}
                          disabled={busy}
                          onClick={() => void applyFix(issue)}
                        >
                          제안대로 고치기
                        </PopButton>
                      )}
                      {issue.factId && (
                        <Button
                          size="sm"
                          variant="link"
                          disabled={busy}
                          onClick={() => setFixing(issue)}
                        >
                          위키 고치기
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="link"
                        disabled={busy}
                        onClick={() => void resolve(issue, 'dismissed')}
                      >
                        무시
                      </Button>
                    </div>
                  )}
                </div>
              </Disclosure>
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
