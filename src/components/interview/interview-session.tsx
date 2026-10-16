'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ConfirmButton } from '@/components/app/confirm-button'
import { EmptyState } from '@/components/app/empty-state'
import { AnswerProposals } from '@/components/interview/answer-proposals'
import { QuestionCard } from '@/components/interview/question-card'
import { Button, buttonVariants } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { InterviewTurnRow, ProposalRow } from '@/db/types'
import { runAction } from '@/lib/client/run-action'
import {
  answerTurnAction,
  askNextQuestionAction,
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

  async function ask(id: string) {
    const turn = await runAction(askNextQuestionAction({ sessionId: id }))
    if (turn) {
      setCurrent(turn)
      setTurns((prev) => upsertTurn(prev, turn))
    }
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
      const result = await runAction(answerTurnAction({ turnId: current.id, answer: text }))
      if (!result) return
      setTurns((prev) => upsertTurn(prev, result.turn))
      setCurrent(null)
      setAnswered({
        turnId: result.turn.id,
        proposals: result.proposals.map(toProposalView),
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
        description="질문에 답하면 설정 카드 후보가 만들어집니다."
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
            답에서 나온 카드 후보는 승인 대기에서 확인하세요. 승인하기 전까지 위키에 들어가지
            않습니다.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link className={buttonVariants()} href={`/works/${workId}/approvals`}>
              승인 대기에서 확인하기
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
              canEdit={canEdit}
              busy={busy}
              onAnswer={answer}
              onSkip={skip}
            />
          )}

          {!current && answered && (
            <AnswerProposals key={answered.turnId} workId={workId} proposals={answered.proposals} />
          )}

          {!current && !canEdit && (
            <p className="text-sm text-muted-foreground">진행 중인 질문이 없습니다.</p>
          )}

          {canEdit && (
            <div className="flex flex-wrap gap-2">
              {!current && (
                <Button onClick={nextQuestion} disabled={busy}>
                  다음 질문
                </Button>
              )}
              <ConfirmButton
                title="인터뷰를 끝낼까요?"
                description="지금까지 답한 내용은 남습니다. 답에서 나온 제안은 승인 대기에서 확인할 수 있습니다."
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
