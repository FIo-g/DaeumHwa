'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { AiRunStatus } from '@/components/app/ai-run-status'
import { ConfirmButton } from '@/components/app/confirm-button'
import { EmptyState } from '@/components/app/empty-state'
import { AnswerProposals } from '@/components/interview/answer-proposals'
import { QuestionCard } from '@/components/interview/question-card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { InterviewTurnRow, ProposalRow } from '@/db/types'
import { postAction } from '@/lib/client/post-json'
import { runAction } from '@/lib/client/run-action'
import { useAiRun } from '@/lib/client/use-ai-run'
import {
  completeInterviewAction,
  skipTurnAction,
  startInterviewAction,
} from '@/server/actions/interview'
import type { ProposalView } from '@/server/proposals'

type InterviewSessionProps = {
  workId: string
  canEdit: boolean
  sessionId: string | null
  turns: InterviewTurnRow[]
  current: InterviewTurnRow | null
}

type Answered = { turnId: string; proposals: ProposalView[] }

// Question failures that a retry cannot fix: the daily limit and a missing or foreign session.
const NO_RETRY_CODES = ['AI_LIMIT', 'NOT_FOUND']

/** The interview screen (F1). One question at a time; answers become pending proposals. */
export function InterviewSession({
  workId,
  canEdit,
  sessionId: initialSessionId,
  turns: initialTurns,
  current: initialCurrent,
}: InterviewSessionProps) {
  const [sessionId, setSessionId] = useState(initialSessionId)
  const [turns, setTurns] = useState(initialTurns)
  const [current, setCurrent] = useState(initialCurrent)
  const [answered, setAnswered] = useState<Answered | null>(null)
  const [finished, setFinished] = useState(false)
  const [busy, setBusy] = useState(false)
  const [askError, setAskError] = useState<{ code: string; message: string } | null>(null)
  const askFailed = askError !== null
  const asking = useAiRun()
  const answering = useAiRun()
  const router = useRouter()

  // After router.refresh() the page passes fresh turn state. Local state follows it, so a turn
  // that the server stored while the screen showed a cancel can be reconciled. Adjusting state
  // during render (not in an effect) keeps this to one extra render.
  const [seenProps, setSeenProps] = useState({ turns: initialTurns, current: initialCurrent })
  if (seenProps.turns !== initialTurns || seenProps.current !== initialCurrent) {
    setSeenProps({ turns: initialTurns, current: initialCurrent })
    setTurns(initialTurns)
    setCurrent(initialCurrent)
  }

  // Route handlers, not Server Actions: the AI calls can run for minutes, and Server Actions run
  // one at a time. Cancel aborts the request; a failed question keeps the "다시 시도" control.
  async function ask(id: string) {
    setAskError(null)
    const result = await asking.run((signal) =>
      postAction<InterviewTurnRow>(
        `/api/works/${workId}/interview/next`,
        { sessionId: id },
        { signal },
      ),
    )
    if (!result || (!result.ok && result.error.code === 'CANCELLED')) {
      // Cancelled. The server may already have stored the question, so reload the turn state.
      router.refresh()
      return
    }
    if (!result.ok) {
      setAskError({ code: result.error.code, message: result.error.message })
      return
    }
    setCurrent(result.data)
    setTurns((prev) => upsertTurn(prev, result.data))
    // start and skip run a Server Action first, and its page refresh can arrive after this question
    // and overwrite it with the older snapshot. Refresh once more so the server state, which now
    // includes the question, is the last one applied.
    router.refresh()
  }

  async function start() {
    setBusy(true)
    try {
      const session = await runAction(startInterviewAction({ workId }))
      if (!session) return
      if (session.id !== sessionId) setTurns([])
      setSessionId(session.id)
      setFinished(false)
      setAnswered(null)
      await ask(session.id)
    } finally {
      setBusy(false)
    }
  }

  async function nextQuestion() {
    if (!sessionId) return
    setBusy(true)
    setAnswered(null)
    try {
      await ask(sessionId)
    } finally {
      setBusy(false)
    }
  }

  async function answer(text: string) {
    if (!current) return
    setBusy(true)
    try {
      const result = await answering.run((signal) =>
        postAction<{ turn: InterviewTurnRow; proposals: ProposalRow[] }>(
          `/api/works/${workId}/interview/answer`,
          { turnId: current.id, answer: text },
          { signal },
        ),
      )
      if (!result || (!result.ok && result.error.code === 'CANCELLED')) {
        // Cancelled after the server may already have saved the answer. Reload the turn state;
        // the typed text stays.
        router.refresh()
        return
      }
      if (!result.ok) {
        toast.error(result.error.message)
        // CONFLICT: the question was answered elsewhere. Reload so the screen shows it as answered.
        if (result.error.code === 'CONFLICT') router.refresh()
        return
      }
      const { turn, proposals } = result.data
      setTurns((prev) => upsertTurn(prev, turn))
      setCurrent(null)
      setAnswered({
        turnId: turn.id,
        proposals: proposals.map(toProposalView),
      })
    } finally {
      setBusy(false)
    }
  }

  async function skip() {
    if (!current || !sessionId) return
    setBusy(true)
    try {
      const turn = await runAction(skipTurnAction({ turnId: current.id }))
      if (!turn) return
      setTurns((prev) => upsertTurn(prev, turn))
      setCurrent(null)
      setAnswered(null)
      await ask(sessionId)
    } finally {
      setBusy(false)
    }
  }

  async function finish() {
    if (!sessionId) return
    setBusy(true)
    try {
      const session = await runAction(completeInterviewAction({ sessionId }), {
        success: '인터뷰를 끝냈습니다.',
      })
      if (session) {
        setFinished(true)
        setCurrent(null)
        setAnswered(null)
      }
    } finally {
      setBusy(false)
    }
  }

  if (!sessionId && !finished) {
    return (
      <EmptyState
        title="진행 중인 인터뷰가 없습니다."
        description="질문에 답하면 설정 카드 후보가 만들어집니다. 설정이 충분하면 다음 화와 스토리 방향을 함께 정합니다."
        action={
          canEdit ? (
            <Button onClick={start} disabled={busy}>
              인터뷰 시작
            </Button>
          ) : undefined
        }
      />
    )
  }

  const history = turns.filter(
    (turn) => turn.id !== current?.id && (turn.answer !== null || turn.skipped),
  )

  return (
    <div className="grid gap-6">
      {finished ? (
        <section className="grid gap-4 rounded-xl border p-5">
          <p className="font-medium">인터뷰를 끝냈습니다.</p>
          <p className="text-sm text-muted-foreground">
            처리하지 않은 후보는 승인 대기에 남아 있습니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link className={buttonVariants()} href={`/works/${workId}/approvals`}>
              승인 대기 보기
            </Link>
            <Link className={buttonVariants({ variant: 'outline' })} href={`/works/${workId}/wiki`}>
              설정 보드 보기
            </Link>
            {canEdit && (
              <Button variant="ghost" onClick={start} disabled={busy}>
                새 인터뷰 시작
              </Button>
            )}
          </div>
        </section>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{`지금까지 ${turns.length}개 질문`}</p>

          {current && (
            <QuestionCard
              key={current.id}
              topic={current.topic}
              question={current.question}
              rationale={current.rationale}
              focus={current.focus}
              canEdit={canEdit}
              busy={busy}
              answering={
                answering.running
                  ? { elapsedSec: answering.elapsedSec, onCancel: answering.cancel }
                  : null
              }
              onAnswer={answer}
              onSkip={skip}
            />
          )}

          {!current && answered && (
            <AnswerProposals key={answered.turnId} workId={workId} proposals={answered.proposals} />
          )}

          {!current && askError && (
            <section className="grid gap-3 rounded-xl border p-5">
              <p className="font-medium">질문을 만들지 못했습니다.</p>
              <p className="text-sm text-muted-foreground">{askError.message}</p>
              {canEdit && !NO_RETRY_CODES.includes(askError.code) && (
                <div>
                  <Button onClick={nextQuestion} disabled={busy}>
                    다시 시도
                  </Button>
                </div>
              )}
            </section>
          )}

          {!current && !canEdit && (
            <p className="text-sm text-muted-foreground">진행 중인 질문이 없습니다.</p>
          )}

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {!current &&
                !askFailed &&
                (asking.running ? (
                  <AiRunStatus
                    label="질문 만드는 중"
                    elapsedSec={asking.elapsedSec}
                    onCancel={asking.cancel}
                  />
                ) : (
                  <Button onClick={nextQuestion} disabled={busy}>
                    다음 질문
                  </Button>
                ))}
              <ConfirmButton
                title="인터뷰를 끝낼까요?"
                description="지금까지 답한 내용은 남습니다. 처리하지 않은 후보는 승인 대기에 남습니다."
                confirmLabel="끝내기"
                onConfirm={finish}
                disabled={busy}
              >
                인터뷰 끝내기
              </ConfirmButton>
            </div>
          )}
        </>
      )}

      {history.length > 0 && (
        <Collapsible>
          <CollapsibleTrigger className={buttonVariants({ variant: 'ghost' })}>
            {`지난 질문 ${history.length}개 보기`}
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ol className="mt-3 grid gap-3">
              {history.map((turn) => (
                <li key={turn.id} className="grid gap-1 rounded-lg border p-3 text-sm">
                  <p className="font-medium">{turn.question}</p>
                  {turn.skipped ? (
                    <p className="text-muted-foreground">(건너뜀)</p>
                  ) : (
                    <p className="whitespace-pre-wrap">{turn.answer}</p>
                  )}
                </li>
              ))}
            </ol>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  )
}

function upsertTurn(list: InterviewTurnRow[], turn: InterviewTurnRow): InterviewTurnRow[] {
  const index = list.findIndex((item) => item.id === turn.id)
  if (index === -1) return [...list, turn]
  return list.map((item, i) => (i === index ? turn : item))
}

/** Interview proposals are shown with the same card as the approval queue; the chapter and group fields are unused here. */
function toProposalView(row: ProposalRow): ProposalView {
  return {
    ...row,
    chapterPosition: null,
    chapterTitle: null,
    groupKey: row.id,
    groupLabel: '',
  }
}
